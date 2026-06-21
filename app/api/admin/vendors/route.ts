export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// GET /api/admin/vendors — admin-only vendor list. Backend-aware admin check via
// requireAdmin (Supabase session or NextAuth JWT role); data via service-role so
// it works without a Supabase session under NextAuth.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = admin();
  const { data, error: dbErr } = await sb
    .from("vendors")
    .select(
      "id, display_name, legal_name, slug, email, phone, gstin, status, commission_rate, created_at, approved_at"
    )
    .order("created_at", { ascending: false });
  if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });

  return NextResponse.json(
    { ok: true, vendors: data ?? [] },
    { headers: { "cache-control": "no-store" } }
  );
}
