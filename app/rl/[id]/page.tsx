import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";

export default async function RL({ params, searchParams }:{ params:{ id:string }, searchParams: { to?: string } }) {
  const h = headers();

  const ua = h.get("user-agent") || null;
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;

  // Best-effort referral click log (was Supabase, now MySQL via Prisma).
  // Wrapped in try/catch so a bad id / FK miss never blocks the redirect.
  try {
    await prisma.referral_clicks.create({
      data: {
        referral_id: params.id,
        user_agent: ua,
        ip_hash: ip, // optionally hash ip before storing
      },
    });
  } catch {
    /* swallow — never block redirect */
  }

  const to = searchParams?.to || "/";
  redirect(to);
}
