"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { uploadMedia } from "@/lib/storage/upload-client";
import { resolveMediaUrl } from "@/lib/storage/backend";
import { adminWrite } from "@/lib/admin/catalog-write";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
import {
  SUPPORTED_COUNTRIES,
  COUNTRY_PROFILES,
  DEFAULT_COUNTRY,
  isSupportedCountry,
} from "@/lib/countries";

type Row = {
  id: string;
  alt: string;
  image_path: string | null;
  video_url: string | null; // stores PUBLIC url of uploaded video
  link_url: string | null;
  page_scope: string;
  position: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  country: string;
  created_at: string;
  updated_at: string;
};

type Mode = "create" | "edit";

export default function BannersAdminPage() {
  const [banners, setBanners] = useState<Row[]>([]);
  const [scope, setScope] = useState("home");
  // Country filter for the list. "all" shows every country's banners for
  // the active page scope; otherwise the list narrows to the chosen
  // country (matches the storefront-side per-country selection).
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  // modal state
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);

  // form
  const [alt, setAlt] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [pageScope, setPageScope] = useState("home");
  const [position, setPosition] = useState(10);
  const [active, setActive] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [country, setCountry] = useState<string>(DEFAULT_COUNTRY);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string>("");
  // True while save() is awaiting an image upload + DB insert. Used to
  // disable the Save button and surface a "Saving…" label so the
  // admin doesn't think the click was ignored.
  const [saving, setSaving] = useState(false);

  // Backend-aware (S3/CloudFront or Supabase) — was a raw Supabase public URL,
  // which 404s under NEXT_PUBLIC_STORAGE_BACKEND=s3.
  const toPublicUrl = (path?: string | null) =>
    path ? resolveMediaUrl("site-assets", path) : undefined;

  const isoToLocal = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
      d.getHours()
    )}:${p(d.getMinutes())}`;
  };
  const localToIso = (v?: string) => (v ? new Date(v).toISOString() : null);

  async function fetchList() {
    setLoading(true);
    let query = supabase
      .from("home_banners")
      .select(
        "id, alt, image_path, video_url, link_url, page_scope, position, active, starts_at, ends_at, country, created_at, updated_at"
      )
      .eq("page_scope", scope);

    if (countryFilter !== "all") {
      query = query.eq("country", countryFilter);
    }

    const { data, error } = await query
      .order("country", { ascending: true })
      .order("position", { ascending: true });

    if (error) alert(error.message);
    setBanners((data ?? []) as Row[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, countryFilter]);

  function resetForm() {
    setAlt("");
    setLinkUrl("");
    setPageScope(scope);
    // Pre-fill the country from the active list filter so creating a new
    // banner while filtering by, say, "UK" doesn't silently default back
    // to India. Falls back to the canonical default when filter is "all".
    const seedCountry =
      countryFilter !== "all" && isSupportedCountry(countryFilter)
        ? countryFilter
        : DEFAULT_COUNTRY;
    setCountry(seedCountry);
    // Position auto-increment was using the last banner across all
    // countries; scope it to the country we're about to assign so
    // numbering stays sane per-country.
    const sameCountry = banners.filter((b) => b.country === seedCountry);
    setPosition(
      sameCountry.length
        ? (sameCountry[sameCountry.length - 1]?.position ?? 0) + 10
        : 10
    );
    setActive(true);
    setStartsAt("");
    setEndsAt("");
    setImageFile(null);
    setVideoFile(null);
    setMsg("");
  }

  function openCreate() {
    setMode("create");
    setEditingId(null);
    resetForm();
    setOpen(true);
  }

  function openEdit(r: Row) {
    setMode("edit");
    setEditingId(r.id);
    setAlt(r.alt);
    setLinkUrl(r.link_url ?? "");
    setPageScope(r.page_scope);
    setPosition(r.position);
    setActive(r.active);
    setStartsAt(isoToLocal(r.starts_at));
    setEndsAt(isoToLocal(r.ends_at));
    setCountry(isSupportedCountry(r.country) ? r.country : DEFAULT_COUNTRY);
    setImageFile(null);
    setVideoFile(null);
    setMsg("");
    setOpen(true);
  }

  function safeExt(name: string, fallback: string) {
    const raw = (name.split(".").pop() || fallback).toLowerCase();
    return raw.replace(/[^a-z0-9]/g, "") || fallback;
  }

  async function upload(path: string, file: File) {
    const { path: storedPath, publicUrl } = await uploadMedia(
      "site-assets",
      path,
      file,
      { upsert: true }
    );
    return { path: storedPath, publicUrl };
  }

  // Tells the home route to drop its cached banner data and re-render.
  // Best-effort: we never block the admin save on this network call, and
  // never surface its failure — the next ISR tick will catch up anyway.
  async function revalidateHome() {
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      await fetch("/api/admin/banners/revalidate", {
        method: "POST",
        credentials: "include",
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      // ignore — non-critical
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this banner?")) return;
    try {
      await adminWrite({ table: "home_banners", op: "delete", match: { id } });
    } catch (err: any) {
      return alert(err.message || "Delete failed");
    }
    await fetchList();
    revalidateHome();
  }

  async function handleToggle(r: Row) {
    try {
      await adminWrite({
        table: "home_banners",
        op: "update",
        data: { active: !r.active },
        match: { id: r.id },
      });
    } catch (err: any) {
      return alert(err.message || "Update failed");
    }
    await fetchList();
    revalidateHome();
  }

  // Create or Save (works even if image_path NOT NULL — we upload first)
  async function save() {
    try {
      setSaving(true);
      setMsg("");
      if (!alt.trim()) throw new Error("Alt is required.");

      const trimmedLink = linkUrl.trim();
      if (!trimmedLink) {
        throw new Error("Link URL is required.");
      }
      if (
        !/^https?:\/\//i.test(trimmedLink) &&
        !trimmedLink.startsWith("/")
      ) {
        throw new Error(
          "Link URL must start with http://, https://, or / (for an internal route)."
        );
      }
      const linkValue = trimmedLink;

      if (mode === "create") {
        // If your DB keeps image_path NOT NULL, require image
        if (!imageFile) throw new Error("Please select an image.");

        // Pre-generate id for storage paths
        const id =
          (globalThis.crypto as any)?.randomUUID?.() ||
          Math.random().toString(36).slice(2);

        // Upload image first (required)
        const imgExt = safeExt(imageFile.name, "jpg");
        const imagePath = `banners/${id}/image.${imgExt}`;
        await upload(imagePath, imageFile);

        // Upload optional video and get a PUBLIC url
        let videoUrl: string | null = null;
        if (videoFile) {
          const vidExt = safeExt(videoFile.name, "mp4");
          const videoPath = `banners/${id}/video.${vidExt}`;
          videoUrl = (await upload(videoPath, videoFile)).publicUrl;
        }

        // Insert with image_path present (and optional video_url)
        await adminWrite({
          table: "home_banners",
          op: "insert",
          data: {
            id,
            alt,
            link_url: linkValue,
            page_scope: pageScope,
            position,
            active,
            starts_at: localToIso(startsAt),
            ends_at: localToIso(endsAt),
            country,
            image_path: imagePath,
            video_url: videoUrl,
          },
        });
      } else {
        // EDIT
        if (!editingId) throw new Error("Missing banner id");

        // Update base fields
        const base: any = {
          alt,
          link_url: linkValue,
          page_scope: pageScope,
          position,
          active,
          starts_at: localToIso(startsAt),
          ends_at: localToIso(endsAt),
          country,
        };
        await adminWrite({
          table: "home_banners",
          op: "update",
          data: base,
          match: { id: editingId },
        });

        // Upload/patch media if chosen
        const updates: any = {};
        if (imageFile) {
          const imgExt = safeExt(imageFile.name, "jpg");
          const imagePath = `banners/${editingId}/image.${imgExt}`;
          const { path } = await upload(imagePath, imageFile);
          updates.image_path = path; // store STORAGE path
        }
        if (videoFile) {
          const vidExt = safeExt(videoFile.name, "mp4");
          const videoPath = `banners/${editingId}/video.${vidExt}`;
          const { publicUrl } = await upload(videoPath, videoFile);
          updates.video_url = publicUrl; // store PUBLIC URL
        }
        if (Object.keys(updates).length) {
          await adminWrite({
            table: "home_banners",
            op: "update",
            data: updates,
            match: { id: editingId },
          });
        }
      }

      setOpen(false);
      await fetchList();
      revalidateHome();
    } catch (err: any) {
      setMsg(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const list = useMemo(() => banners, [banners]);

  return (
    <>
    <AdminBackBar title="Banners" to="/admin/cms" />
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Banner Management</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-gray-500">Scope</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value="home">home</option>
          </select>
          <label className="text-xs text-gray-500 ml-2">Country</label>
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value="all">All countries</option>
            {SUPPORTED_COUNTRIES.map((c) => {
              const p = COUNTRY_PROFILES[c];
              return (
                <option key={c} value={c}>
                  {p.flag} {p.name} ({c})
                </option>
              );
            })}
          </select>
          <button
            onClick={openCreate}
            className="rounded bg-black text-white px-3 py-2 hover:opacity-90"
          >
            + Add Banner
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Banners are scoped per country. Visitors see banners authored for
        their country; if none exist, the storefront falls back to India
        ({DEFAULT_COUNTRY}) banners.
      </p>

      {/* List */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">Preview</th>
              <th className="text-left px-3 py-2">Alt</th>
              <th className="text-left px-3 py-2">Country</th>
              <th className="text-left px-3 py-2">Scope</th>
              <th className="text-left px-3 py-2">Position</th>
              <th className="text-left px-3 py-2">Active</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && list.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  No banners yet.
                </td>
              </tr>
            )}
            {list.map((r) => {
              const img = toPublicUrl(r.image_path);
              return (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="w-36 h-16 bg-gray-100 rounded overflow-hidden">
                      {r.video_url ? (
                        <video
                          src={r.video_url}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                      ) : img ? (
                        <img
                          src={img}
                          alt={r.alt}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-xs text-gray-400">
                          no media
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.alt}</td>
                  <td className="px-3 py-2">
                    {(() => {
                      // r.country is `string` from the DB; narrow before
                      // indexing the typed COUNTRY_PROFILES map. Anything
                      // outside the supported set just shows the code.
                      const p = isSupportedCountry(r.country)
                        ? COUNTRY_PROFILES[r.country]
                        : null;
                      return p ? (
                        <span title={p.name}>
                          {p.flag} {r.country}
                        </span>
                      ) : (
                        <span className="text-gray-500">{r.country || "—"}</span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2">{r.page_scope}</td>
                  <td className="px-3 py-2">{r.position}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleToggle(r)}
                      className={`px-2 py-1 rounded text-xs ${
                        r.active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {r.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => openEdit(r)}
                        className="px-3 py-1 rounded border hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="px-3 py-1 rounded border hover:bg-red-50 text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-lg font-semibold">
                  {mode === "create" ? "Add Banner" : "Edit Banner"}
                </div>
                <div className="text-xs text-gray-500">
                  Choose image/video and set details.
                </div>
              </div>
              <button
                className="text-gray-500 hover:text-black"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="grid gap-3">
              <label className="text-sm">
                Alt
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={alt}
                  onChange={(e) => setAlt(e.target.value)}
                />
              </label>

              <label className="text-sm">
                Link URL <span className="text-red-600">*</span>
                <input
                  type="url"
                  required
                  className="mt-1 w-full border rounded px-2 py-1"
                  placeholder="/products/some-slug or https://example.com/…"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
                <span className="text-xs text-gray-500">
                  Where the banner sends users when clicked. Use a path like{" "}
                  <code>/products/&lt;slug&gt;</code> for internal routes, or a
                  full <code>https://</code> URL for external destinations.
                </span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Page scope
                  <select
                    className="mt-1 w-full border rounded px-2 py-1"
                    value={pageScope}
                    onChange={(e) => setPageScope(e.target.value)}
                  >
                    <option value="home">home</option>
                  </select>
                </label>
                <label className="text-sm">
                  Country
                  <select
                    className="mt-1 w-full border rounded px-2 py-1"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  >
                    {SUPPORTED_COUNTRIES.map((c) => {
                      const p = COUNTRY_PROFILES[c];
                      return (
                        <option key={c} value={c}>
                          {p.flag} {p.name} ({c})
                        </option>
                      );
                    })}
                  </select>
                  <span className="text-xs text-gray-500">
                    Visitors from this country see this banner. Other
                    countries fall back to {DEFAULT_COUNTRY}.
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Position
                  <input
                    type="number"
                    className="mt-1 w-full border rounded px-2 py-1"
                    value={position}
                    onChange={(e) => setPosition(Number(e.target.value) || 0)}
                  />
                </label>
                <label className="inline-flex items-end gap-2 text-sm pb-1.5">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  Active
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Starts at (optional)
                  <input
                    type="datetime-local"
                    className="mt-1 w-full border rounded px-2 py-1"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Ends at (optional)
                  <input
                    type="datetime-local"
                    className="mt-1 w-full border rounded px-2 py-1"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </label>
              </div>

              <label className="text-sm">
                Image (required on create if your DB has NOT NULL)
                <input
                  type="file"
                  accept="image/*"
                  className="mt-1 block w-full"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                />
                <span className="text-xs text-gray-500">
                  Stored at{" "}
                  <code>site-assets/banners/&lt;id&gt;/image.&lt;ext&gt;</code>
                </span>
              </label>

              <label className="text-sm">
                Video (optional)
                <input
                  type="file"
                  accept="video/*"
                  className="mt-1 block w-full"
                  onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                />
                <span className="text-xs text-gray-500">
                  We save its <em>public</em> URL to <code>video_url</code>.
                </span>
              </label>

              {msg && <div className="text-sm text-red-600">{msg}</div>}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-3 py-2 rounded border hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-3 py-2 rounded bg-black text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving
                  ? mode === "create"
                    ? "Creating…"
                    : "Saving…"
                  : mode === "create"
                  ? "Create"
                  : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
