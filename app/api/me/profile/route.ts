import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

// Returns the current user's profile (from MySQL) for the NextAuth session.
// The rewritten AuthContext calls this to hydrate role / preferred_country /
// name / avatar, replacing the direct Supabase `profiles` read.
export async function GET() {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ user: null });

  const profile = await prisma.profiles.findUnique({
    where: { id: u.id },
    select: {
      id: true, full_name: true, avatar_url: true, role: true,
      preferred_country: true, preferred_locale: true,
    },
  });

  return NextResponse.json({
    user: { id: u.id, email: u.email, ...jsonSafe(profile) },
  });
}
