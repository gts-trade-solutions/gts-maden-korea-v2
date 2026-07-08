"use client";

// Client upload helper (S3 backend). Drop-in replacement for the per-site
// `supabase.storage.from(bucket).upload(key, file)` calls:
//
//   const { path, publicUrl } = await uploadMedia(bucket, key, file, { upsert });
//
// It asks /api/uploads/presign (which authorizes the caller server-side,
// replacing Supabase RLS) for a presigned PUT and uploads directly to S3.
// Returns the relative `path` (store in *_path columns, unchanged) and the
// full `publicUrl` (store in *_url columns / preview).

export type UploadResult = { path: string; publicUrl: string };

export async function uploadMedia(
  bucket: string,
  key: string,
  file: File | Blob,
  _opts: { upsert?: boolean } = {}
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

  const put = await fetch(broker.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "content-type": contentType },
  });
  if (!put.ok) throw new Error(`S3 upload failed (${put.status})`);
  return { path: broker.key as string, publicUrl: broker.publicUrl as string };
}

// Best-effort delete (replacing old assets). Never throws — deletes should not
// block the UI; an orphaned object is harmless. The server route performs the
// actual S3 delete after authorizing the caller.
export async function deleteMedia(bucket: string, key: string): Promise<void> {
  try {
    await fetch("/api/uploads/delete", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bucket, key }),
    });
  } catch {
    /* ignore */
  }
}
