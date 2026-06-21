// app/api/promo/apply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { setPromoCookie } from "@/lib/promo-cookie";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

export async function POST(req: NextRequest) {
  const { code } = await req.json().catch(() => ({ code: "" }));
  const normalized = String(code || "").toUpperCase().trim();
  if (!normalized) return NextResponse.json({ ok: false, error: "CODE_REQUIRED" }, { status: 400 });

  const sb = createAdminClient();
  const { data, error } = await sb.rpc("get_promo_details", { p_code: normalized });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const row = (Array.isArray(data) ? data[0] : data) as any;
  if (!row) return NextResponse.json({ ok: false, error: "INVALID_OR_INACTIVE" }, { status: 404 });

  // Region restriction. If the influencer who owns the code has
  // narrowed their applicable_countries list, refuse to attach the
  // promo when the buyer's cookie country isn't in it. Empty list =
  // applies everywhere (current default for all 27 legacy creators).
  if (row.influencer_id) {
    const { data: prof } = await sb
      .from("influencer_profiles")
      .select("applicable_countries")
      .eq("user_id", row.influencer_id)
      .maybeSingle();
    const regions = Array.isArray((prof as any)?.applicable_countries)
      ? ((prof as any).applicable_countries as string[])
      : [];
    if (regions.length > 0) {
      const rawCountry = cookies().get("mik_country")?.value;
      const country = isSupportedCountry(rawCountry) ? rawCountry : DEFAULT_COUNTRY;
      if (!regions.includes(country)) {
        return NextResponse.json(
          {
            ok: false,
            code: "PROMO_NOT_AVAILABLE_IN_REGION",
            error: "PROMO_NOT_AVAILABLE_IN_REGION",
          },
          { status: 400 }
        );
      }
    }
  }

  setPromoCookie(normalized);
  return NextResponse.json({ ok: true, promo: row });
}
