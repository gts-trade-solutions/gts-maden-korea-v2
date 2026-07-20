// app/api/instagram/conversations/route.ts
import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

export async function GET(req: Request) {
  const { user } = await getRouteAuth();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const instagramAccountId = searchParams.get("instagram_account_id");

  try {
    const data = await prisma.instagram_conversations.findMany({
      where: instagramAccountId
        ? { instagram_account_id: instagramAccountId }
        : {},
      select: {
        id: true,
        ig_conversation_id: true,
        participant_username: true,
        last_message: true,
        last_message_at: true,
        platform: true,
        instagram_account_id: true,
      },
      orderBy: { last_message_at: "desc" },
    });

    return NextResponse.json({ conversations: jsonSafe(data) });
  } catch (error) {
    console.error("Load conversations error:", error);
    return NextResponse.json(
      { error: "Failed to load conversations" },
      { status: 500 }
    );
  }
}
