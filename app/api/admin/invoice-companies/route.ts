export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin invoice-companies read (service-role). Replaces the browser anon
// Supabase read in the invoice "new" / "edit" dropdowns so RLS can be enabled
// on `invoice_companies`. Read-only; admin-gated.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  try {
    const { data, error: e } = await admin()
      .from("invoice_companies")
      .select("id, key, display_name, address, gst_number, email")
      .order("display_name", { ascending: true });
    if (e) return json({ ok: false, error: e.message }, 500);
    return json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
