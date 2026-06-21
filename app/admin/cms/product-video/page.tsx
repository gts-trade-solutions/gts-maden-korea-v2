'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from "next/link";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { uploadMedia } from "@/lib/storage/upload-client";
import { resolveMediaUrl } from "@/lib/storage/backend";
import { ProductMultiPicker, type PickerProduct } from "@/components/admin/ProductMultiPicker";
import { useAdminGate } from "@/lib/hooks/useAdminGate";
import { adminWrite } from "@/lib/admin/catalog-write";

const JOIN_TABLE = "home_product_video_products";

// DB row type
type Row = {
  id: string;
  product_id: string | null;
  title: string;
  description: string | null;
  page_scope: string;
  position: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  video_path: string | null;
  video_url: string | null;         // stored public URL (convenience)
  thumbnail_path: string | null;
  thumbnail_url: string | null;     // stored public URL (convenience)
  created_at: string;
  updated_at: string;
};

type Mode = 'create' | 'edit';

export default function AdminProductVideosPage() {
  const { ready, requireSession } = useAdminGate();

  // list state
  const [scope, setScope] = useState('home');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  // modal + form
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pageScope, setPageScope] = useState('home');
  const [position, setPosition] = useState(10);
  const [active, setActive] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [productSlug, setProductSlug] = useState(''); // resolve to product_id on save

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);

  // Multi-attached products for the open form. Replaces the old single
  // product_id slug field; the legacy column is left untouched.
  const [attachedProducts, setAttachedProducts] = useState<PickerProduct[]>([]);

  const [msg, setMsg] = useState('');

  // Save flow state — disables buttons + shows in-flight label so admins
  // can't double-click and trigger a duplicate upload.
  const [saving, setSaving] = useState(false);

  // ── Home carousel cap ───────────────────────────────────────────────
  // Persisted in `store_settings.home_video_limit`. Loaded on mount via
  // /api/admin/settings/home-video-limit so admins see the live value;
  // edited inline with a single Save click.
  const [homeVideoLimit, setHomeVideoLimit] = useState<number>(16);
  const [limitBounds, setLimitBounds] = useState<{
    min: number;
    max: number;
    default: number;
  }>({ min: 1, max: 50, default: 16 });
  const [limitDirty, setLimitDirty] = useState(false);
  const [savingLimit, setSavingLimit] = useState(false);

  const toPublicUrl = (bucket: string, path?: string | null) =>
    path ? resolveMediaUrl(bucket, path) : undefined;

  const isoToLocal = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const localToIso = (v?: string) => (v ? new Date(v).toISOString() : null);

  async function fetchList() {
    setLoading(true);
    const { data, error } = await supabase
      .from('home_product_videos')
      .select('id, product_id, title, description, page_scope, position, active, starts_at, ends_at, video_path, video_url, thumbnail_path, thumbnail_url, created_at, updated_at')
      .eq('page_scope', scope)
      .order('position', { ascending: true });

    if (error) alert(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // Load the current home-carousel cap on mount. Best-effort —
  // failures fall through to the seeded default and a save will still
  // work because the PATCH endpoint clamps server-side.
  useEffect(() => {
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch("/api/admin/settings/home-video-limit", {
          credentials: "include",
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body?.ok) {
          setHomeVideoLimit(Number(body.limit) || 16);
          if (body.bounds) setLimitBounds(body.bounds);
        }
      } catch {
        // ignore — default state is fine
      }
    })();
  }, []);

  async function saveLimit() {
    const value = Math.floor(Number(homeVideoLimit));
    if (
      !Number.isFinite(value) ||
      value < limitBounds.min ||
      value > limitBounds.max
    ) {
      toast.error(
        `Limit must be between ${limitBounds.min} and ${limitBounds.max}`
      );
      return;
    }
    setSavingLimit(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/admin/settings/home-video-limit", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ limit: value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        toast.error(body?.error || "Failed to save limit");
        return;
      }
      toast.success(`Home carousel cap set to ${value}`);
      setLimitDirty(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save limit");
    } finally {
      setSavingLimit(false);
    }
  }

  function resetForm() {
    setTitle('');
    setDescription('');
    setPageScope(scope);
    setPosition(rows.length ? (rows[rows.length - 1]?.position ?? 0) + 10 : 10);
    setActive(true);
    setStartsAt('');
    setEndsAt('');
    setProductSlug('');
    setVideoFile(null);
    setThumbFile(null);
    setAttachedProducts([]);
    setMsg('');
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

  // Replace-all via server route. Bypasses RLS on the join table (the
  // route does its own admin auth check) so a flaky client-side session
  // can't fail the write while parent-row writes succeed.
  async function persistAttached(videoId: string) {
    // Asserts a live session; throws "Your session has expired…" if not.
    const token = await requireSession();
    const res = await fetch("/api/admin/video-products", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        kind: "product",
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
    setMode('create');
    setEditingId(null);
    resetForm();
    setOpen(true);
  }

  function openEdit(r: Row) {
    setMode('edit');
    setEditingId(r.id);
    setTitle(r.title);
    setDescription(r.description ?? '');
    setPageScope(r.page_scope);
    setPosition(r.position);
    setActive(r.active);
    setStartsAt(isoToLocal(r.starts_at));
    setEndsAt(isoToLocal(r.ends_at));
    setProductSlug(''); // optional: user can enter to change
    setVideoFile(null);
    setThumbFile(null);
    setAttachedProducts([]);
    setMsg('');
    setOpen(true);
    // Hydrate attached products in the background — don't block modal open.
    loadAttached(r.id).then(setAttachedProducts);
  }

  function safeExt(name: string, fallback: string) {
    const raw = (name.split('.').pop() || fallback).toLowerCase();
    return raw.replace(/[^a-z0-9]/g, '') || fallback;
  }

  async function uploadTo(bucket: string, path: string, file: File) {
    const { publicUrl } = await uploadMedia(bucket, path, file, { upsert: true });
    return publicUrl;
  }

  async function resolveProductIdBySlug(slug: string) {
    if (!slug.trim()) return null;
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .eq('slug', slug.trim())
      .limit(1)
      .single();
    if (error) throw new Error(`Product not found for slug "${slug}"`);
    return (data as { id: string }).id;
  }

  // Tells the home route to drop its cached video-section data and
  // re-render. Best-effort: we never block the admin action on this
  // network call, and never surface its failure — the next ISR tick
  // will catch up anyway. Same posture as the banner admin's
  // `revalidateHome()` helper.
  async function revalidateHome() {
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      await fetch("/api/admin/product-videos/revalidate", {
        method: "POST",
        credentials: "include",
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      // ignore — non-critical
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this video card?')) return;
    try {
      await adminWrite({ table: 'home_product_videos', op: 'delete', match: { id } });
    } catch (e: any) {
      return alert(e?.message || 'Delete failed');
    }
    await fetchList();
    revalidateHome();
  }

  async function handleToggle(r: Row) {
    try {
      await adminWrite({ table: 'home_product_videos', op: 'update', data: { active: !r.active }, match: { id: r.id } });
    } catch (e: any) {
      return alert(e?.message || 'Update failed');
    }
    await fetchList();
    revalidateHome();
  }

  async function swapPositions(a: Row, b: Row) {
    const temp = -Math.floor(Date.now() / 1000);
    await adminWrite({ table: 'home_product_videos', op: 'update', data: { position: temp }, match: { id: a.id } });
    await adminWrite({ table: 'home_product_videos', op: 'update', data: { position: a.position }, match: { id: b.id } });
    await adminWrite({ table: 'home_product_videos', op: 'update', data: { position: b.position }, match: { id: a.id } });
  }

  async function move(id: string, dir: 'up' | 'down') {
    const idx = rows.findIndex((x) => x.id === id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= rows.length) return;
    try {
      await swapPositions(rows[idx], rows[swapIdx]);
      await fetchList();
      revalidateHome();
    } catch (e: any) {
      alert(e?.message || 'Reorder failed');
    }
  }

  async function save() {
    if (saving) return; // hard guard against double-clicks
    try {
      setMsg('');
      setSaving(true);
      if (!title.trim()) throw new Error('Title is required.');
      if (mode === 'create' && !videoFile) throw new Error('Please select a video file.');

      // Optional: resolve product id from slug if provided
      let productId: string | null = null;
      if (productSlug.trim()) {
        productId = await resolveProductIdBySlug(productSlug.trim());
      }

      const BUCKET = 'product-media';

      if (mode === 'create') {
        // pre-generate id so we can upload first
        const id = (globalThis.crypto as any)?.randomUUID?.() || Math.random().toString(36).slice(2);

        // 1) upload required video
        let videoPath: string | null = null;
        let videoUrl: string | null = null;
        if (videoFile) {
          const vidExt = safeExt(videoFile.name, 'mp4');
          videoPath = `product-videos/${id}/video.${vidExt}`;
          videoUrl = await uploadTo(BUCKET, videoPath, videoFile);
        }

        // 2) upload optional thumbnail
        let thumbPath: string | null = null;
        let thumbUrl: string | null = null;
        if (thumbFile) {
          const imgExt = safeExt(thumbFile.name, 'jpg');
          thumbPath = `product-videos/${id}/thumb.${imgExt}`;
          thumbUrl = await uploadTo(BUCKET, thumbPath, thumbFile);
        }

        // 3) insert
        await adminWrite({
          table: 'home_product_videos',
          op: 'insert',
          data: {
            id,
            product_id: productId,
            title,
            description: description || null,
            page_scope: pageScope,
            position,
            active,
            starts_at: localToIso(startsAt),
            ends_at: localToIso(endsAt),
            video_path: videoPath,
            video_url: videoUrl,
            thumbnail_path: thumbPath,
            thumbnail_url: thumbUrl,
          },
        });

        // 4) replace attached products for this video
        await persistAttached(id);

      } else {
        if (!editingId) throw new Error('Missing id');
        // 1) update base fields
        const base: any = {
          title,
          description: description || null,
          page_scope: pageScope,
          position,
          active,
          starts_at: localToIso(startsAt),
          ends_at: localToIso(endsAt),
        };
        if (productSlug.trim()) {
          base.product_id = productId;
        }
        await adminWrite({ table: 'home_product_videos', op: 'update', data: base, match: { id: editingId } });

        // 2) uploads patch
        const patch: any = {};
        if (videoFile) {
          const vidExt = safeExt(videoFile.name, 'mp4');
          const videoPath = `product-videos/${editingId}/video.${vidExt}`;
          const videoUrl = await uploadTo(BUCKET, videoPath, videoFile);
          patch.video_path = videoPath;
          patch.video_url = videoUrl;
        }
        if (thumbFile) {
          const imgExt = safeExt(thumbFile.name, 'jpg');
          const thumbPath = `product-videos/${editingId}/thumb.${imgExt}`;
          const thumbUrl = await uploadTo(BUCKET, thumbPath, thumbFile);
          patch.thumbnail_path = thumbPath;
          patch.thumbnail_url = thumbUrl;
        }
        if (Object.keys(patch).length) {
          await adminWrite({ table: 'home_product_videos', op: 'update', data: patch, match: { id: editingId } });
        }

        // 3) replace attached products for this video
        await persistAttached(editingId);
      }

      setOpen(false);
      await fetchList();
      revalidateHome();
      toast.success(mode === 'create' ? 'Video created' : 'Video saved');
    } catch (err: any) {
      const message = err?.message || 'Save failed';
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/cms"
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            ← Back
          </Link>
          <h1 className="text-2xl font-semibold">Product Video Carousel</h1>
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
            onClick={openCreate}
            className="rounded bg-black text-white px-3 py-2 hover:opacity-90"
          >
            + Add Video
          </button>
        </div>
      </div>

      {/* Home carousel cap. Lives in store_settings.home_video_limit;
          driving this from the same page that manages the videos means
          admins don't have to hunt for it under generic Settings. */}
      <div className="rounded-xl border bg-gray-50 px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="text-sm font-medium text-gray-900">
            Home carousel cap
          </div>
          <div className="text-xs text-gray-500">
            Maximum number of videos rendered on the home page. Active videos beyond this rank by{" "}
            <code>position</code> get hidden until the cap is raised or
            another video is removed. Range {limitBounds.min}–{limitBounds.max}.
          </div>
        </div>
        <input
          type="number"
          min={limitBounds.min}
          max={limitBounds.max}
          step={1}
          value={homeVideoLimit}
          onChange={(e) => {
            setHomeVideoLimit(Number(e.target.value));
            setLimitDirty(true);
          }}
          className="border rounded px-2 py-1 w-20 text-right"
        />
        <button
          onClick={saveLimit}
          disabled={savingLimit || !limitDirty}
          className="rounded bg-black text-white px-3 py-2 text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {savingLimit ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">Preview</th>
              <th className="text-left px-3 py-2">Title</th>
              <th className="text-left px-3 py-2">Scope</th>
              <th className="text-left px-3 py-2">Position</th>
              <th className="text-left px-3 py-2">Active</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">Loading…</td></tr>
            )}
            {!loading && list.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No videos yet.</td></tr>
            )}
            {list.map((r, i) => {
              const thumb = r.thumbnail_url ?? toPublicUrl('product-media', r.thumbnail_path);
              const vid = r.video_url ?? toPublicUrl('product-media', r.video_path);
              return (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="w-36 h-16 bg-gray-100 rounded overflow-hidden">
                      {thumb ? (
                        <img src={thumb} alt={r.title} className="w-full h-full object-cover" />
                      ) : vid ? (
                        <video src={vid} muted playsInline className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-xs text-gray-400">no media</div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.title}</td>
                  <td className="px-3 py-2">{r.page_scope}</td>
                  <td className="px-3 py-2">{r.position}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleToggle(r)}
                      className={`px-2 py-1 rounded text-xs ${r.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {r.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => i > 0 && move(r.id, 'up')}
                        className="px-2 py-1 rounded border hover:bg-gray-50"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => i < list.length - 1 && move(r.id, 'down')}
                        className="px-2 py-1 rounded border hover:bg-gray-50"
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button onClick={() => openEdit(r)} className="px-3 py-1 rounded border hover:bg-gray-50">
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
          <div className="bg-white rounded-2xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-lg font-semibold">{mode === 'create' ? 'Add Video' : 'Edit Video'}</div>
                <div className="text-xs text-gray-500">Upload a video (required) and an optional thumbnail.</div>
              </div>
              <button className="text-gray-500 hover:text-black" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="grid gap-3">
              <label className="text-sm">
                Title
                <input className="mt-1 w-full border rounded px-2 py-1" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>

              <label className="text-sm">
                Description (optional)
                <textarea className="mt-1 w-full border rounded px-2 py-1 min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Page scope
                  <select className="mt-1 w-full border rounded px-2 py-1" value={pageScope} onChange={(e) => setPageScope(e.target.value)}>
                    <option value="home">home</option>
                  </select>
                </label>
                <label className="text-sm">
                  Position
                  <input type="number" className="mt-1 w-full border rounded px-2 py-1" value={position} onChange={(e) => setPosition(Number(e.target.value) || 0)} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Starts at (optional)
                  <input type="datetime-local" className="mt-1 w-full border rounded px-2 py-1" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </label>
                <label className="text-sm">
                  Ends at (optional)
                  <input type="datetime-local" className="mt-1 w-full border rounded px-2 py-1" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </label>
              </div>

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

              <label className="text-sm">
                <span className="text-gray-500">Legacy single-product slug (deprecated, optional)</span>
                <input className="mt-1 w-full border rounded px-2 py-1" value={productSlug} onChange={(e) => setProductSlug(e.target.value)} placeholder="leave blank — use Attached products above" />
              </label>

              <label className="text-sm">
                Video (required on create)
                <input type="file" accept="video/*" className="mt-1 block w-full" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
                <span className="text-xs text-gray-500">Saved to <code>product-media/product-videos/&lt;id&gt;/video.&lt;ext&gt;</code></span>
              </label>

              <label className="text-sm">
                Thumbnail (optional)
                <input type="file" accept="image/*" className="mt-1 block w-full" onChange={(e) => setThumbFile(e.target.files?.[0] || null)} />
                <span className="text-xs text-gray-500">Saved to <code>product-media/product-videos/&lt;id&gt;/thumb.&lt;ext&gt;</code></span>
              </label>

              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Active
              </label>

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
                  ? mode === 'create'
                    ? 'Creating…'
                    : 'Saving…'
                  : mode === 'create'
                  ? 'Create'
                  : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
