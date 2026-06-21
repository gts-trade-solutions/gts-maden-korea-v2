import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export default async function RL({ params, searchParams }:{ params:{ id:string }, searchParams: { to?: string } }) {
  const h = headers();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get:()=>undefined, set:()=>{}, remove:()=>{} } }
  );

  const ua = h.get("user-agent") || null;
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;

  // You likely already log click via DB trigger; if not, insert here:
  await sb.from("referral_clicks").insert({
    referral_id: params.id,
    user_agent: ua,
    ip_hash: ip ? ip : null, // optionally hash ip before storing
  }).catch(()=>null);

  const to = searchParams?.to || "/";
  redirect(to);
}
