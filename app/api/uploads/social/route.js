// app/api/uploads/social/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { STORAGE_BACKEND } from "@/lib/storage/backend";
import { requireAdmin } from "@/lib/auth/adminGuard";
// Admin-gated: this endpoint writes to the media store via the service role
// (Supabase upload / S3 PutObject), so it must not be an open write. Called from
// the admin marketing tools (Facebook/Instagram composer), which carry the admin
// session — requireAdmin is backend-aware (NextAuth JWT or Supabase).

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only key

// ✅ Use the existing Facebook bucket for both Facebook + Instagram
const BUCKET_NAME = "facebook-media";

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    "[uploads/social] Missing SUPABASE env (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)"
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

export async function POST(req) {
  try {
    const { error: authErr } = await requireAdmin(req);
    if (authErr) return authErr;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase env missing on server" },
        { status: 500 }
      );
    }

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

    let publicUrl;
    if (STORAGE_BACKEND === "s3") {
      // S3 backend: server-side PutObject (service-role-equivalent via AWS creds).
      const { s3PutObject, s3PublicUrl } = await import("@/lib/storage/s3");
      const key = `${BUCKET_NAME}/${path}`;
      await s3PutObject(key, buffer, file.type || "application/octet-stream");
      publicUrl = s3PublicUrl(key);
    } else {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME) // 👈 fixed to "facebook-media"
        .upload(path, buffer, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return NextResponse.json(
          { error: "Failed to upload file" },
          { status: 500 }
        );
      }

      publicUrl = supabase.storage.from(BUCKET_NAME).getPublicUrl(path).data.publicUrl;
    }

    return NextResponse.json({ publicUrl }, { status: 200 });
  } catch (err) {
    console.error("POST /api/uploads/social error", err);
    return NextResponse.json(
      { error: "Upload failed", details: String(err) },
      { status: 500 }
    );
  }
}
