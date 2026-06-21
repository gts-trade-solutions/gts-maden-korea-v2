import { NextResponse } from "next/server";

// DEPRECATED / DISABLED. This was a stub that never wrote anything (it parsed a
// referral cookie and returned { ok: true } with a "TODO: write your cart
// storage" left in place). It has no callers — the real cart write path is
// POST /api/cart/mutate (add_to_cart), and referral attribution happens at order
// time via order_attributions. Hard-disabled so a stray call fails loudly
// instead of silently no-opping an "add to cart".
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "GONE", hint: "use POST /api/cart/mutate { action: 'add', product_id, qty }" },
    { status: 410 }
  );
}
