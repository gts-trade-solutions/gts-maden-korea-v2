// app/(checkout)/actions/applyPromo.ts
'use server';

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { PROMO_COOKIE, ATTRIBUTION_DAYS } from "@/lib/referral/constants";

export async function applyPromo(code: string) {
  if (!code?.trim()) throw new Error("Promo code required");

  const supabase = createClient();
  const { data, error } = await supabase.rpc("validate_promo", { p_code: code });
  if (error) throw error;

  const hit = Array.isArray(data) ? data[0] : data;
  if (!hit) throw new Error("Invalid or expired promo");

  // Persist promo for the session (HTTP-only)
  const maxAge = ATTRIBUTION_DAYS * 24 * 60 * 60;
  cookies().set({
    name: PROMO_COOKIE,
    value: code.trim().toUpperCase(),
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  return { ok: true, promo: { product_id: hit.product_id, discount_percent: Number(hit.discount_percent) } };
}
