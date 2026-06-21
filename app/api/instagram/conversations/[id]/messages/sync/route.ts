// app/api/instagram/conversations/[id]/messages/sync/route.ts
import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { user, sb } = await getRouteAuth();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const convDbId = Number(params.id);
  if (Number.isNaN(convDbId)) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }

  // 1) Load conversation
  const { data: conversation, error: convErr } = await sb
    .from("instagram_conversations")
    .select("id, ig_conversation_id, instagram_account_id")
    .eq("id", convDbId)
    .maybeSingle();

  if (convErr || !conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  // 2) Load IG account + owner
  const { data: igAccount, error: igErr } = await sb
    .from("instagram_accounts")
    .select("id, owner_id, facebook_page_id, page_access_token, ig_business_account_id, username")
    .eq("id", conversation.instagram_account_id)
    .maybeSingle();

  if (igErr || !igAccount) {
    return NextResponse.json(
      { error: "Instagram account not found" },
      { status: 404 }
    );
  }

  if (igAccount.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Not allowed to sync messages for this conversation" },
      { status: 403 }
    );
  }

  const pageId = igAccount.facebook_page_id;
  const pageToken = igAccount.page_access_token;

  if (!pageId || !pageToken) {
    return NextResponse.json(
      { error: "facebook_page_id or page_access_token missing on instagram_accounts" },
      { status: 400 }
    );
  }

  const igConversationId = conversation.ig_conversation_id as string;

  try {
    // 3) Fetch messages for this conversation
    const url = new URL(`${GRAPH_BASE}/${igConversationId}/messages`);
    url.searchParams.set("fields", "id,from,to,message,created_time");
    url.searchParams.set("limit", "100");
    url.searchParams.set("access_token", pageToken);

    const res = await fetch(url.toString());
    const json = await res.json();

    if (!res.ok) {
      console.error("Messages fetch error:", json);
      throw new Error(json.error?.message || "Failed to fetch messages");
    }

    const msgs = (json.data || []) as any[];

    const rows = msgs.map((m) => {
      const from = m.from || {};
      const isBusiness = from.id === pageId;

      return {
        ig_message_id: m.id,
        ig_conversation_id: igConversationId,
        instagram_account_id: igAccount.id,
        platform: "instagram",
        sender_type: isBusiness ? "business" : "user",
        sender_ig_user_id: from.id || null,
        sender_username: from.name || null,
        text: m.message || "",
        sent_at: m.created_time
          ? new Date(m.created_time).toISOString()
          : new Date().toISOString(),
      };
    });

    if (rows.length > 0) {
      const { error: upsertErr } = await sb
        .from("instagram_messages")
        .upsert(rows as any, { onConflict: "ig_message_id" });

      if (upsertErr) {
        console.error("Messages upsert error:", upsertErr);
        throw new Error("Failed to save messages");
      }
    }

    return NextResponse.json({ synced_count: rows.length });
  } catch (err: any) {
    console.error("Sync messages error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to sync messages" },
      { status: 500 }
    );
  }
}
