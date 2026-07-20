import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getRouteUser } from "@/lib/auth/routeUser";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Resolve the user via the backend-aware seam — the bare cookie client's
  // auth.getUser() returns null under NextAuth (no Supabase session).
  const user = await getRouteUser(req);

  // Not logged-in → send to Register-as-Influencer
  if (!user) {
    const u = new URL(req.url);
    u.pathname = "/auth/register";
    u.searchParams.set("mode", "influencer");
    return NextResponse.redirect(u);
  }

  // Logged-in → ensure there is a pending request (idempotent). Port of the
  // request_influencer RPC: influencer_requests.user_id is UNIQUE, so a create
  // that races an existing row is simply skipped (an already-approved or
  // pending application must not be reset to pending here).
  try {
    const existing = await prisma.influencer_requests.findUnique({
      where: { user_id: user.id },
      select: { id: true },
    });
    if (!existing) {
      await prisma.influencer_requests.create({
        data: {
          id: randomUUID(),
          user_id: user.id,
          handle: null,
          note: null,
          social: {},
          status: "pending",
        },
      });
    }
  } catch (e) {
    // Ignore errors like a duplicate race — the portal gate decides.
    console.error("[start] influencer request failed (continuing to portal):", e);
  }

  const to = new URL("/influencer", req.url);
  return NextResponse.redirect(to);
}
