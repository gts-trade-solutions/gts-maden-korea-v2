export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin-only single-vendor read + actions. Backend-aware admin check
// (requireAdmin) + service-role data access so it works without a Supabase
// session under NextAuth.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

// GET /api/admin/vendors/[id] — vendor + up to 25 of its products.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = admin();
  const { data: vendor, error: vErr } = await sb
    .from("vendors")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (vErr) return json({ ok: false, error: vErr.message }, 500);
  if (!vendor) return json({ ok: false, error: "NOT_FOUND" }, 404);

  const { data: products } = await sb
    .from("products")
    .select("id, name, slug, price, currency, is_published")
    .eq("vendor_id", params.id)
    .order("updated_at", { ascending: false })
    .limit(25);

  return json({ ok: true, vendor, products: products ?? [] });
}

// PATCH /api/admin/vendors/[id] — { action: "approve" | "suspend" | "commission", ... }
//   approve     → status=approved, approved_by = the acting admin
//   suspend     → status=disabled|rejected + rejected_reason
//   commission  → commission_rate (0..100)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({} as any));
  let patch: Record<string, any> = {};

  if (body.action === "approve") {
    patch = {
      status: "approved",
      rejected_reason: null,
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
    };
  } else if (body.action === "suspend") {
    const to = body.status === "rejected" ? "rejected" : "disabled";
    const reason = String(body.reason || "").trim();
    if (!reason) return json({ ok: false, error: "Reason required" }, 400);
    patch = { status: to, rejected_reason: reason };
  } else if (body.action === "commission") {
    const rate = Math.max(0, Math.min(100, Number(body.commission_rate) || 0));
    patch = { commission_rate: rate };
  } else {
    return json({ ok: false, error: "BAD_ACTION" }, 400);
  }

  const sb = admin();
  const { error: upErr } = await sb.from("vendors").update(patch).eq("id", params.id);
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  return json({ ok: true, patch });
}
