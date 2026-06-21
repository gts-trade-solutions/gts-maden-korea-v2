export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPPORTED_COUNTRIES, isSupportedCountry } from "@/lib/countries";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin-only CRUD for per-country offer prices on a single product.
//
// Backs the "Country offers" panel on /admin/products/[id]. Phase 1 of
// the country-aware pricing rollout — see Plan in chat history. The
// table this writes (`product_country_prices`) is read by
// `effectivePriceForCountry()` everywhere in the storefront.
//
// PUT semantics are REPLACE-ALL: the client sends the full set of
// offers it wants the product to have. Anything not in the payload is
// deleted. Makes the admin UI a single Save without per-row save/delete
// gymnastics.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });


function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type IncomingOffer = {
  country_code: string;
  offer_price: number;
  is_active?: boolean;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const productId = params.id;
  if (!UUID_RE.test(productId)) {
    return json({ ok: false, error: "BAD_PRODUCT_ID" }, 400);
  }

  const sb = admin();
  const [{ data: product, error: pErr }, { data: offers, error: oErr }] =
    await Promise.all([
      sb
        .from("products")
        .select("id, name, price, sale_price, compare_at_price, currency")
        .eq("id", productId)
        .maybeSingle(),
      sb
        .from("product_country_prices")
        .select("country_code, offer_price, is_active, updated_at")
        .eq("product_id", productId)
        .order("country_code"),
    ]);

  if (pErr) return json({ ok: false, error: pErr.message }, 500);
  if (oErr) return json({ ok: false, error: oErr.message }, 500);
  if (!product) return json({ ok: false, error: "PRODUCT_NOT_FOUND" }, 404);

  return json({
    ok: true,
    product: {
      id: product.id,
      name: product.name,
      compare_at_price: product.compare_at_price,
      price: product.price,
      sale_price: product.sale_price,
      currency: product.currency ?? "INR",
    },
    offers: offers ?? [],
    supported_countries: SUPPORTED_COUNTRIES,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const productId = params.id;
  if (!UUID_RE.test(productId)) {
    return json({ ok: false, error: "BAD_PRODUCT_ID" }, 400);
  }

  const body = await req.json().catch(() => ({}));
  const incoming: IncomingOffer[] = Array.isArray(body?.offers) ? body.offers : [];

  // Per-row validation. We collect the full list of issues before
  // failing so the admin sees every bad row in one toast, not one at
  // a time.
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const row of incoming) {
    const cc = String(row.country_code ?? "").toUpperCase();
    const price = Number(row.offer_price);
    if (!isSupportedCountry(cc)) {
      issues.push(`Unsupported country: ${row.country_code}`);
      continue;
    }
    if (seen.has(cc)) {
      issues.push(`Duplicate row for ${cc}`);
      continue;
    }
    seen.add(cc);
    if (!Number.isFinite(price) || price <= 0) {
      issues.push(`${cc}: offer price must be > 0`);
    }
  }
  if (issues.length > 0) {
    return json({ ok: false, error: "VALIDATION_FAILED", issues }, 400);
  }

  const sb = admin();

  // Need MRP for the < MRP check. If null we skip the upper-bound
  // validation (matches the rule confirmed in the plan).
  const { data: product, error: pErr } = await sb
    .from("products")
    .select("id, compare_at_price")
    .eq("id", productId)
    .maybeSingle();
  if (pErr) return json({ ok: false, error: pErr.message }, 500);
  if (!product) return json({ ok: false, error: "PRODUCT_NOT_FOUND" }, 404);

  const mrp = product.compare_at_price == null ? null : Number(product.compare_at_price);
  if (mrp != null) {
    const overMrp: string[] = [];
    for (const row of incoming) {
      const cc = String(row.country_code).toUpperCase();
      const price = Number(row.offer_price);
      if (price >= mrp) overMrp.push(`${cc}: offer ${price} must be < MRP ${mrp}`);
    }
    if (overMrp.length > 0) {
      return json(
        { ok: false, error: "OFFER_EXCEEDS_MRP", issues: overMrp },
        400
      );
    }
  }

  // REPLACE-ALL: upsert what's in the payload, delete rows for
  // countries not in the payload. Run in one transaction-like sequence
  // — Supabase JS doesn't expose a SQL transaction, but each step is
  // idempotent so a partial failure is safe to retry by re-submitting.
  const incomingCodes = incoming.map((r) => String(r.country_code).toUpperCase());

  if (incoming.length > 0) {
    const rows = incoming.map((r) => ({
      product_id: productId,
      country_code: String(r.country_code).toUpperCase(),
      offer_price: Number(r.offer_price),
      is_active: r.is_active === false ? false : true,
    }));
    const { error: upErr } = await sb
      .from("product_country_prices")
      .upsert(rows, { onConflict: "product_id,country_code" });
    if (upErr) return json({ ok: false, error: upErr.message }, 500);
  }

  // Delete anything not in the incoming list. When `incomingCodes` is
  // empty (admin cleared everything) this deletes ALL rows for the
  // product, which is the desired "remove all offers" behavior.
  let delQ = sb
    .from("product_country_prices")
    .delete()
    .eq("product_id", productId);
  if (incomingCodes.length > 0) {
    delQ = delQ.not("country_code", "in", `(${incomingCodes.map((c) => `"${c}"`).join(",")})`);
  }
  const { error: delErr } = await delQ;
  if (delErr) return json({ ok: false, error: delErr.message }, 500);

  // Return the fresh state so the form can reconcile without a
  // second GET.
  const { data: fresh } = await sb
    .from("product_country_prices")
    .select("id, country_code, offer_price, is_active, updated_at")
    .eq("product_id", productId)
    .order("country_code");

  // Dual-write: mirror the final offer set into MySQL. The storefront reads
  // product_country_prices from MySQL (CATALOG_BACKEND=mysql), so without this
  // mirror an admin edit leaves MySQL stale — the bug that surfaced as a
  // ₹399-vs-₹499 cart mismatch. Best-effort; never block the admin save.
  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.product_country_prices.deleteMany({ where: { product_id: productId } });
    const rows = (fresh ?? []).map((r: any) => ({
      id: r.id,
      product_id: productId,
      country_code: r.country_code,
      offer_price: r.offer_price,
      is_active: r.is_active,
      updated_at: r.updated_at ? new Date(r.updated_at) : new Date(),
    }));
    if (rows.length) await prisma.product_country_prices.createMany({ data: rows });
  } catch (e) {
    console.error("[dual-write] product_country_prices MySQL mirror failed:", e);
  }

  return json({ ok: true, offers: fresh ?? [] });
}
