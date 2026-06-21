import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Public endpoint: returns the active currency rate table for the
// client `useCurrency()` hook. Anon-key access is fine — the data is
// public by design (it's what visitors see on every price tag).
//
// Cached for 5 minutes (Cache-Control) so subsequent visits hit the
// edge cache instead of the DB. The daily refresh job and admin
// "Refresh now" button both bust this when they update rates.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function GET() {
  const { data, error } = await supabase
    .from("currency_rates")
    .select("code, name, symbol, decimals, rate_from_inr, active, last_updated_at")
    .eq("active", true)
    .order("code", { ascending: true });

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "no_rates" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { ok: true, rates: data },
    {
      headers: {
        // Edge cache 5 minutes, stale-while-revalidate 1 hour.
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    }
  );
}
