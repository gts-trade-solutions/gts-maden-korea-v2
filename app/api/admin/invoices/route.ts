export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin invoices read endpoint. Under NextAuth the browser anon Supabase client
// gets 0 rows from `invoices` (RLS), so the admin list/detail/edit pages saw an
// empty list / "invoice not found". This routes those reads through the
// SERVICE-ROLE client (bypasses RLS), admin-gated. Mirrors the selects the
// pages used to issue directly. `invoice_companies` reads fine via anon and is
// left untouched in the pages (the company dropdown in the edit page stays as-is).
//   GET            -> list (invoices + invoice_companies.display_name)
//   GET?id=<uuid>  -> single invoice (+ invoice_companies + invoice_items)
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

  const sb = admin();
  const id = new URL(req.url).searchParams.get("id");

  // Single invoice. Includes BOTH joins so the detail page (needs
  // invoice_companies + invoice_items) and the edit page (needs invoice_items;
  // ignores the extra company join) are both served unchanged.
  if (id) {
    const { data, error: e } = await sb
      .from("invoices")
      .select(
        `
        *,
        invoice_companies:invoice_companies(*),
        invoice_items:invoice_items(*)
      `
      )
      .eq("id", id)
      .single();
    if (e) return json({ ok: false, error: e.message }, 500);
    return json({ ok: true, data });
  }

  // List. Same select + order the list page used.
  const { data, error: e } = await sb
    .from("invoices")
    .select(
      `
      id,
      invoice_number,
      invoice_date,
      customer_name,
      total_amount,
      invoice_companies:invoice_companies(display_name)
    `
    )
    .order("created_at", { ascending: false });
  if (e) return json({ ok: false, error: e.message }, 500);
  return json({ ok: true, data });
}
