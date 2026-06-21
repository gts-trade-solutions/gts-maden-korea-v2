"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { uploadMedia } from "@/lib/storage/upload-client";
import { ProductMultiPicker, type PickerProduct } from "@/components/admin/ProductMultiPicker";
import { useAdminGate } from "@/lib/hooks/useAdminGate";
import { adminWrite } from "@/lib/admin/catalog-write";

const JOIN_TABLE = "home_influencer_video_products";

type Row = {
  id: string;
  influencer_name: string;
  influencer_handle: string | null;
  caption: string | null;
  views: number | null;

  // We will write to these:
  video_url: string | null; // public URL of uploaded file
  thumbnail_url: string | null; // public URL of uploaded file

  // Kept for compatibility; we will clear post_url on save when a video is uploaded
  post_url: string | null;
  embed_captioned: boolean;
  instagram_link: string | null;

  page_scope: string;
  position: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

type Mode = "create" | "edit";

const BUCKET = "product-media"; // or 'site-assets' if you prefer
const videoPath = (id: string, file: File) => {
  const ext =
    (file.name.split(".").pop() || "mp4")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "mp4";
  return `influencer-videos/${id}/video.${ext}`;
};
const thumbPath = (id: string, file: File) => {
  const ext =
    (file.name.split(".").pop() || "jpg")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";
  return `influencer-videos/${id}/thumb.${ext}`;
};

export default function AdminInstagramVideosPage() {
  const { ready, requireSession } = useAdminGate();

  const [scope, setScope] = useState("home");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // modal + form
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  // fields
  const [influencerName, setInfluencerName] = useState("");
  const [influencerHandle, setInfluencerHandle] = useState("");
  const [caption, setCaption] = useState("");
  const [views, setViews] = useState<number | "">("");
  const [pageScope, setPageScope] = useState("home");
  const [position, setPosition] = useState(10);
  const [active, setActive] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [instagramLink, setInstagramLink] = useState("");

  // files
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);

  // attached products (M:N)
  const [attachedProducts, setAttachedProducts] = useState<PickerProduct[]>([]);

  // Save flow state — disables buttons + shows in-flight label so admins
  // can't double-click the button and trigger a duplicate upload.
  const [saving, setSaving] = useState(false);

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
    const { data, error } = await supabase
      .from("home_influencer_videos")
      .select("*")
      .eq("page_scope", scope)
      .order("position", { ascending: true });

    if (error) {
      console.error(error);
      setRows([]);
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchList(); /* eslint-disable-next-line */
  }, [scope]);

  function resetForm() {
    setInfluencerName("");
    setInfluencerHandle("");
    setCaption("");
    setViews("");
    setPageScope(scope);
    setPosition(rows.length ? (rows.at(-1)?.position ?? 0) + 10 : 10);
    setActive(true);
    setStartsAt("");
    setEndsAt("");
    setInstagramLink("");
    setVideoFile(null);
    setThumbFile(null);
    setAttachedProducts([]);
    setMsg("");
  }

  // Load currently-attached products for an existing video.
  async function loadAttached(videoId: string): Promise<PickerProduct[]> {
    const { data, error } = await supabase
      .from(JOIN_TABLE)
      .select(`position, products ( id, slug, name, hero_image_path )`)
      .eq("video_id", videoId)
      .order("position", { ascending: true });
    if (error) {
      console.error("loadAttached error:", error);
      return [];
    }
    return ((data ?? []) as Array<{ position: number; products: any }>)
      .filter((r) => !!r.products)
      .map((r) => r.products as PickerProduct);
  }

  // Replace-all via server route. The route is admin-authed and uses the
  // service-role client to write the join, bypassing the table's RLS so
  // a flaky session can't fail the write while parent writes succeed.
  async function persistAttached(videoId: string) {
    // Asserts a live session and grabs a fresh access token. Throws a
    // clear "Your session has expired. Please log in again." if the
    // session was lost — better than silently no-op-ing.
    const token = await requireSession();
    const res = await fetch("/api/admin/video-products", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        kind: "influencer",
        videoId,
        productIds: attachedProducts.map((p) => p.id),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      const diagStr = body.diag ? ` (${JSON.stringify(body.diag)})` : "";
      throw new Error(`${body.error || "Failed to save attached products"}${diagStr}`);
    }
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
    setInfluencerName(r.influencer_name);
    setInfluencerHandle(r.influencer_handle ?? "");
    setCaption(r.caption ?? "");
    setViews(r.views ?? "");
    setPageScope(r.page_scope);
    setPosition(r.position);
    setActive(r.active);
    setStartsAt(isoToLocal(r.starts_at));
    setEndsAt(isoToLocal(r.ends_at));
    setInstagramLink(r.instagram_link ?? "");
    setVideoFile(null);
    setThumbFile(null);
    setAttachedProducts([]);
    setMsg("");
    setOpen(true);
    loadAttached(r.id).then(setAttachedProducts);
  }

  async function uploadPublic(path: string, file: File) {
    const { publicUrl } = await uploadMedia(BUCKET, path, file, { upsert: true });
    return publicUrl;
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this video card?")) return;
    try {
      await adminWrite({
        table: "home_influencer_videos",
        op: "delete",
        match: { id },
      });
    } catch (e: any) {
      return alert(e?.message || "Delete failed");
    }
    await fetchList();
  }

  async function handleToggle(r: Row) {
    try {
      await adminWrite({
        table: "home_influencer_videos",
        op: "update",
        data: { active: !r.active },
        match: { id: r.id },
      });
    } catch (e: any) {
      return alert(e?.message || "Update failed");
    }
    await fetchList();
  }

  async function swapPositions(a: Row, b: Row) {
    const temp = -Math.floor(Date.now() / 1000);
    // Sequenced to preserve the temp-slot dance: park `a` at a temp position,
    // move `b` into a's slot, then move `a` into b's slot.
    await adminWrite({
      table: "home_influencer_videos",
      op: "update",
      data: { position: temp },
      match: { id: a.id },
    });
    await adminWrite({
      table: "home_influencer_videos",
      op: "update",
      data: { position: a.position },
      match: { id: b.id },
    });
    await adminWrite({
      table: "home_influencer_videos",
      op: "update",
      data: { position: b.position },
      match: { id: a.id },
    });
  }

  async function move(id: string, dir: "up" | "down") {
    const idx = rows.findIndex((x) => x.id === id);
    const j = dir === "up" ? idx - 1 : idx + 1;
    if (j < 0 || j >= rows.length) return;
    try {
      await swapPositions(rows[idx], rows[j]);
      await fetchList();
    } catch (e: any) {
      alert(e?.message || "Reorder failed");
    }
  }

  async function save() {
    if (saving) return; // hard guard against double-clicks
    try {
      setMsg("");
      setSaving(true);
      if (!influencerName.trim())
        throw new Error("Influencer name is required.");

      if (mode === "create") {
        if (!videoFile) throw new Error("Please choose a video file.");

        // generate id first to upload under a stable folder
        const id =
          (globalThis.crypto as any)?.randomUUID?.() ||
          Math.random().toString(36).slice(2);

        // upload video (required)
        const vPath = videoPath(id, videoFile);
        const vUrl = await uploadPublic(vPath, videoFile);

        // upload thumbnail (optional)
        let tUrl: string | null = null;
        if (thumbFile) {
          const tPath = thumbPath(id, thumbFile);
          tUrl = await uploadPublic(tPath, thumbFile);
        }

        // insert row (note: we clear post_url so frontend uses <video>)
        await adminWrite({
          table: "home_influencer_videos",
          op: "insert",
          data: {
            id,
            influencer_name: influencerName.trim(),
            influencer_handle: influencerHandle.trim() || null,
            caption: caption.trim() || null,
            views: views === "" ? 0 : Number(views),
            video_url: vUrl,
            thumbnail_url: tUrl,
            post_url: null,
            embed_captioned: false,
            instagram_link: instagramLink.trim() || null,
            page_scope: pageScope,
            position,
            active,
            starts_at: localToIso(startsAt),
            ends_at: localToIso(endsAt),
          },
        });

        await persistAttached(id);
      } else {
        if (!editingId) throw new Error("Missing id");

        // base fields
        const base: any = {
          influencer_name: influencerName.trim(),
          influencer_handle: influencerHandle.trim() || null,
          caption: caption.trim() || null,
          views: views === "" ? 0 : Number(views),
          instagram_link: instagramLink.trim() || null,
          page_scope: pageScope,
          position,
          active,
          starts_at: localToIso(startsAt),
          ends_at: localToIso(endsAt),
        };

        // if a new video file is provided, upload and force <video> mode
        if (videoFile) {
          const vPath = videoPath(editingId, videoFile);
          const vUrl = await uploadPublic(vPath, videoFile);
          base.video_url = vUrl;
          base.post_url = null;
          base.embed_captioned = false;
        }

        // new thumbnail?
        if (thumbFile) {
          const tPath = thumbPath(editingId, thumbFile);
          const tUrl = await uploadPublic(tPath, thumbFile);
          base.thumbnail_url = tUrl;
        }

        await adminWrite({
          table: "home_influencer_videos",
          op: "update",
          data: base,
          match: { id: editingId },
        });

        await persistAttached(editingId);
      }

      setOpen(false);
      await fetchList();
      toast.success(mode === "create" ? "Video created" : "Video saved");
    } catch (err: any) {
      const message = err?.message || "Save failed";
      setMsg(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const list = useMemo(() => rows, [rows]);

  // Don't render the admin UI until the session check has resolved. If
  // there's no session, useAdminGate() bounces the user to /auth/login;
  // the brief "Checking session…" placeholder is what they see during
  // that redirect.
  if (!ready) {
    return (
      <div className="p-6 max-w-7xl mx-auto text-sm text-gray-500">
        Checking session…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/cms"
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            ← Back
          </Link>
          <h1 className="text-2xl font-semibold">Influencer Videos</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value="home">home</option>
          </select>
          <button
            onClick={fetchList}
            className="px-3 py-2 rounded border hover:bg-gray-50"
          >
            Refresh
          </button>
          <button
            onClick={openCreate}
            className="rounded bg-black text-white px-3 py-2 hover:opacity-90"
          >
            + Add Video
          </button>
        </div>
      </div>

      {/* table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">Preview</th>
              <th className="text-left px-3 py-2">Influencer</th>
              <th className="text-left px-3 py-2">Caption</th>
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
                  No videos yet.
                </td>
              </tr>
            )}

            {list.map((r, i) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="w-24 h-16 bg-gray-100 rounded overflow-hidden">
                    {r.thumbnail_url ? (
                      <img
                        src={r.thumbnail_url}
                        alt={r.caption ?? r.influencer_name}
                        className="w-full h-full object-cover"
                      />
                    ) : r.video_url ? (
                      // Fallback: when no separate thumbnail was uploaded,
                      // render a muted preview frame from the video itself
                      // so admins can identify the row visually. Same
                      // pattern the product-video admin uses.
                      <video
                        src={r.video_url}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-xs text-gray-500">
                        no media
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.influencer_name}</div>
                  <div className="text-xs text-gray-500">
                    {r.influencer_handle}
                  </div>
                </td>
                <td className="px-3 py-2 max-w-[360px]">
                  <span className="line-clamp-2 text-gray-600">
                    {r.caption}
                  </span>
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
                      onClick={() => i > 0 && move(r.id, "up")}
                      className="px-2 py-1 rounded border hover:bg-gray-50"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => i < list.length - 1 && move(r.id, "down")}
                      className="px-2 py-1 rounded border hover:bg-gray-50"
                      title="Move down"
                    >
                      ↓
                    </button>
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
            ))}
          </tbody>
        </table>
      </div>

      {/* modal */}
      {open && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-lg font-semibold">
                  {mode === "create" ? "Add Video" : "Edit Video"}
                </div>
                <div className="text-xs text-gray-500">
                  Upload video (mp4) and an optional thumbnail image.
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
                Influencer name
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={influencerName}
                  onChange={(e) => setInfluencerName(e.target.value)}
                />
              </label>

              <label className="text-sm">
                Handle (e.g. @someone)
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={influencerHandle}
                  onChange={(e) => setInfluencerHandle(e.target.value)}
                />
              </label>

              <label className="text-sm">
                Caption (optional)
                <textarea
                  className="mt-1 w-full border rounded px-2 py-1 min-h-[80px]"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Views (optional)
                  <input
                    type="number"
                    className="mt-1 w-full border rounded px-2 py-1"
                    value={views}
                    onChange={(e) =>
                      setViews(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                  />
                </label>
                <label className="text-sm">
                  Position
                  <input
                    type="number"
                    className="mt-1 w-full border rounded px-2 py-1"
                    value={position}
                    onChange={(e) => setPosition(Number(e.target.value) || 0)}
                  />
                </label>
              </div>

              <label className="text-sm">
                Video file * (mp4 recommended)
                <input
                  type="file"
                  accept="video/*"
                  className="mt-1 block w-full"
                  onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                />
                <p className="text-xs text-gray-500">
                  Saved to{" "}
                  <code>
                    {BUCKET}/influencer-videos/&lt;id&gt;/video.&lt;ext&gt;
                  </code>
                </p>
              </label>

              <label className="text-sm">
                Thumbnail (optional)
                <input
                  type="file"
                  accept="image/*"
                  className="mt-1 block w-full"
                  onChange={(e) => setThumbFile(e.target.files?.[0] || null)}
                />
                <p className="text-xs text-gray-500">
                  Saved to{" "}
                  <code>
                    {BUCKET}/influencer-videos/&lt;id&gt;/thumb.&lt;ext&gt;
                  </code>
                </p>
              </label>

              <label className="text-sm">
                Instagram link (optional)
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  placeholder="https://www.instagram.com/reel/..."
                  value={instagramLink}
                  onChange={(e) => setInstagramLink(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  Used only as an external link; playback uses your uploaded
                  file.
                </p>
              </label>

              <div className="text-sm">
                <div className="mb-1">Attached products</div>
                <ProductMultiPicker
                  value={attachedProducts}
                  onChange={setAttachedProducts}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Shown below the video when a customer opens this clip in the player.
                </p>
              </div>

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
                  Active
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                    />
                    <span className="text-sm">Visible</span>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Starts at
                  <input
                    type="datetime-local"
                    className="mt-1 w-full border rounded px-2 py-1"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Ends at
                  <input
                    type="datetime-local"
                    className="mt-1 w-full border rounded px-2 py-1"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </label>
              </div>

              {msg && <div className="text-sm text-red-600">{msg}</div>}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-3 py-2 rounded border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-3 py-2 rounded bg-black text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {saving && (
                  <span
                    aria-hidden
                    className="h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin"
                  />
                )}
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
  );
}
