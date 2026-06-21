export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { STORAGE_BACKEND, resolveMediaUrl } from "@/lib/storage/backend";

// POST /api/uploads/presign  { bucket, key, contentType }
//
// Backend-aware upload broker for the client uploaders (which cannot hold AWS
// creds). Re-implements the authz that Supabase Storage RLS provided:
//   - admin buckets (product-media, site-assets, product-story-media,
//     facebook-media) require an admin (requireAdmin).
//   - review-media allows any authenticated user (PDP review photos), and the
//     key must be under "uploads/".
//
// When STORAGE_BACKEND=s3 it returns an S3 presigned PUT URL the browser PUTs to.
// When STORAGE_BACKEND=supabase it returns { mode: "supabase" } so the client
// keeps its existing supabase-js .upload path (zero behavior change pre-flip).
const ADMIN_BUCKETS = new Set(["product-media", "site-assets", "product-story-media", "facebook-media"]);
const USER_BUCKETS = new Set(["review-media"]);

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const bucket = String(body?.bucket || "");
  const key = String(body?.key || "").replace(/^\/+/, "");
  const contentType = String(body?.contentType || "application/octet-stream");

  if (!bucket || !key) {
    return NextResponse.json({ error: "bucket and key are required" }, { status: 400 });
  }
  if (!ADMIN_BUCKETS.has(bucket) && !USER_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "unknown bucket" }, { status: 400 });
  }

  // Authz gate.
  if (ADMIN_BUCKETS.has(bucket)) {
    const { requireAdmin } = await import("@/lib/auth/adminGuard");
    const { error } = await requireAdmin(req);
    if (error) return error;
  } else {
    const { getRouteUser } = await import("@/lib/auth/routeUser");
    const user = await getRouteUser(req);
    if (!user?.id) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    if (!key.startsWith("uploads/")) {
      return NextResponse.json({ error: "review media key must be under uploads/" }, { status: 400 });
    }
  }

  // Pre-flip: keep the existing Supabase upload path on the client.
  if (STORAGE_BACKEND !== "s3") {
    return NextResponse.json({ mode: "supabase" });
  }

  const { presignPutUrl } = await import("@/lib/storage/s3");
  const s3Key = `${bucket}/${key}`;
  const uploadUrl = await presignPutUrl(s3Key, contentType);

  return NextResponse.json({
    mode: "s3",
    uploadUrl,
    key, // relative key — store in *_path columns exactly as before
    publicUrl: resolveMediaUrl(bucket, key), // full URL — store in *_url columns / preview
  });
}
