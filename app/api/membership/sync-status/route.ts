import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId();

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const now = new Date();

    const expiredRows = await prisma.user_memberships.findMany({
      where: { user_id: userId, status: "active", ends_at: { lte: now } },
      select: { id: true },
    });

    if (!expiredRows || expiredRows.length === 0) {
      return NextResponse.json({
        ok: true,
        updated: 0,
      });
    }

    const ids = expiredRows.map((row) => row.id);

    await prisma.user_memberships.updateMany({
      where: { id: { in: ids } },
      data: { status: "expired", updated_at: new Date() },
    });

    return NextResponse.json({
      ok: true,
      updated: ids.length,
    });
  } catch (error: any) {
    console.error("Membership sync status error:", error);

    return NextResponse.json(
      { ok: false, error: error.message || "Failed to sync membership status" },
      { status: 500 }
    );
  }
}
