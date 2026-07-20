// app/api/uploads/social/route.js
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
// Admin-gated: this endpoint writes to the media store server-side (S3
// PutObject), so it must not be an open write. Called from the admin marketing
// tools (Facebook/Instagram composer), which carry the admin session.

// ✅ Use the existing Facebook bucket prefix for both Facebook + Instagram
const BUCKET_NAME = "facebook-media";

export async function POST(req) {
  try {
    const { error: authErr } = await requireAdmin(req);
    if (authErr) return authErr;

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      );
    }

    // Optional subfolder, default "instagram"
    const folder = formData.get("folder") || "instagram";

    // Convert File → Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeName = String(file.name).replace(/[^\w.\-]+/g, "_");
    const path = `${folder}/${Date.now()}-${safeName}`;

    // S3 backend: server-side PutObject via AWS creds.
    const { s3PutObject, s3PublicUrl } = await import("@/lib/storage/s3");
    const key = `${BUCKET_NAME}/${path}`;
    await s3PutObject(key, buffer, file.type || "application/octet-stream");
    const publicUrl = s3PublicUrl(key);

    return NextResponse.json({ publicUrl }, { status: 200 });
  } catch (err) {
    console.error("POST /api/uploads/social error", err);
    return NextResponse.json(
      { error: "Upload failed", details: String(err) },
      { status: 500 }
    );
  }
}
