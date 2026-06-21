import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") || 20), 50);

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  // Return only published products; adjust select fields as you like
  let query = supabase
    .from("products")
    .select("id,name,slug,price,currency,is_published")
    .eq("is_published", true)
    .order("name", { ascending: true })
    .limit(limit);

  if (q) {
    // name ILIKE or slug ILIKE
    query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, products: data });
}
