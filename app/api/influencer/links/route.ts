import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { supabaseForUser } from "@/lib/supabaseRoute";

export async function GET() {
  const { user } = await getRouteAuth();
  if (!user) return NextResponse.json({ ok:false }, { status:401 });
  // referral_links is RLS-gated; under NextAuth use the service-role seam by user.id.
  const sb = supabaseForUser(user.id);

  // Assuming referral_links has (id uuid, influencer_id uuid, slug text null, product_id uuid null, note text null)
  const { data, error } = await sb
    .from("referral_links")
    .select("id, slug, product_id, note")
    .eq("influencer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok:false, error: error.message }, { status:400 });
  return NextResponse.json({ ok:true, links: data });
}
