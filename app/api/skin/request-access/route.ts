import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getAccessState } from "@/lib/integrations/skinEntitlement";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// User asks for another analysis once their free scan is used. Mirrors the
// analyzer's request→grant pattern, but approval happens in the MadeNKorea
// admin (/admin/skin-analysis/requests). Full admin UI lands in M4.
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const state = await getAccessState(user.id);
  if (state.status === "ready" || state.status === "reserved") {
    return NextResponse.json(
      { error: "already_have_access", message: "You already have a scan available." },
      { status: 400 },
    );
  }

  const pending = await prisma.skinAccessRequest.findFirst({
    where: { userId: user.id, status: "pending" },
  });
  if (pending) return NextResponse.json({ ok: true, alreadyPending: true });

  await prisma.skinAccessRequest.create({
    data: { userId: user.id, status: "pending" },
  });
  return NextResponse.json({ ok: true });
}
