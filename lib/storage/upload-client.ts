"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

// Backend-aware client upload helper. Drop-in replacement for the per-site
// `supabase.storage.from(bucket).upload(key, file)` calls:
//
//   const { path, publicUrl } = await uploadMedia(bucket, key, file, { upsert });
//
// Under STORAGE_BACKEND=s3 it asks /api/uploads/presign (which authorizes the
// caller server-side, replacing Supabase RLS) for a presigned PUT and uploads
// directly to S3. Under supabase it keeps the existing session-bound .upload so
// flip-back is seamless. Returns the relative `path` (store in *_path columns,
// unchanged) and the full `publicUrl` (store in *_url columns / preview).

export type UploadResult = { path: string; publicUrl: string };

export async function uploadMedia(
  bucket: string,
  key: string,
  file: File | Blob,
  opts: { upsert?: boolean } = {}
): Promise<UploadResult> {
  const contentType = (file as any)?.type || "application/octet-stream";

  const res = await fetch("/api/uploads/presign", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bucket, key, contentType }),
  });
  const broker = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(broker?.error || "Upload authorization failed");

  if (broker.mode === "s3") {
    const put = await fetch(broker.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "content-type": contentType },
    });
    if (!put.ok) throw new Error(`S3 upload failed (${put.status})`);
    return { path: broker.key as string, publicUrl: broker.publicUrl as string };
  }

  // Supabase backend (default / flip-back): session-bound client for RLS.
  const sb = createClientComponentClient();
  const { error } = await sb.storage.from(bucket).upload(key, file, {
    upsert: opts.upsert ?? false,
    contentType,
  });
  if (error) throw error;
  const { data } = sb.storage.from(bucket).getPublicUrl(key);
  return { path: key, publicUrl: data.publicUrl };
}

// Best-effort delete (replacing old assets). Never throws — deletes should not
// block the UI; an orphaned object is harmless.
export async function deleteMedia(bucket: string, key: string): Promise<void> {
  try {
    const res = await fetch("/api/uploads/delete", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bucket, key }),
    });
    const j = await res.json().catch(() => ({} as any));
    if (res.ok && j?.mode === "supabase") {
      const sb = createClientComponentClient();
      await sb.storage.from(bucket).remove([key]).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}
