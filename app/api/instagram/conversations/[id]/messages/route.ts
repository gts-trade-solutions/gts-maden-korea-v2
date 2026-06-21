// app/api/instagram/conversations/[id]/messages/route.ts
import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

export async function GET(
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

  // Optional: verify ownership via join
  const { data: conv, error: convErr } = await sb
    .from("instagram_conversations")
    .select("id, instagram_account_id")
    .eq("id", convDbId)
    .maybeSingle();

  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: igAccount, error: igErr } = await sb
    .from("instagram_accounts")
    .select("id, owner_id")
    .eq("id", conv.instagram_account_id)
    .maybeSingle();

  if (igErr || !igAccount || igAccount.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Not allowed to view messages for this conversation" },
      { status: 403 }
    );
  }

  const { data: messages, error } = await sb
    .from("instagram_messages")
    .select("*")
    .eq("ig_conversation_id", conv.ig_conversation_id)
    .order("sent_at", { ascending: true });

  if (error) {
    console.error("Load messages error:", error);
    return NextResponse.json(
      { error: "Failed to load messages" },
      { status: 500 }
    );
  }

  return NextResponse.json({ messages: messages || [] });
}

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

  const body = await req.json();
  const { text } = body;

  if (!text) {
    return NextResponse.json(
      { error: "Message text is required" },
      { status: 400 }
    );
  }

  // 1) Load conversation + IG account
  const { data: conv, error: convErr } = await sb
    .from("instagram_conversations")
    .select("id, ig_conversation_id, instagram_account_id, participant_ig_user_id")
    .eq("id", convDbId)
    .maybeSingle();

  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: igAccount, error: igErr } = await sb
    .from("instagram_accounts")
    .select("id, owner_id, ig_business_account_id, facebook_page_id, access_token, page_access_token, username")
    .eq("id", conv.instagram_account_id)
    .maybeSingle();

  if (igErr || !igAccount) {
    return NextResponse.json({ error: "Instagram account not found" }, { status: 404 });
  }

  if (igAccount.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Not allowed to send from this account" },
      { status: 403 }
    );
  }

  const recipientId = conv.participant_ig_user_id;
  if (!recipientId) {
    return NextResponse.json(
      { error: "Conversation does not have participant_ig_user_id stored" },
      { status: 400 }
    );
  }

  // For Send API you can use either:
  // - IG user id + user/system access token (Instagram API with Instagram Login) :contentReference[oaicite:6]{index=6}
  // - or Page-based Send API; here we'll use IG user id + access_token
  const tokenForSend = igAccount.access_token || igAccount.page_access_token;
  if (!tokenForSend) {
    return NextResponse.json(
      { error: "No valid access token on instagram_accounts for sending" },
      { status: 400 }
    );
  }

  try {
    // 2) Call Send API (path shape based on Meta Send API docs; confirm exact path in your app)
    const sendUrl = `${GRAPH_BASE}/${igAccount.ig_business_account_id}/messages`;

    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        // Some setups also require "messaging_type": "RESPONSE"
      }),
    });

    const sendJson = await sendRes.json();

    if (!sendRes.ok || !sendJson.id) {
      console.error("Send API error:", sendJson);
      throw new Error(sendJson.error?.message || "Failed to send message");
    }

    const igMessageId = sendJson.id as string;
    const nowIso = new Date().toISOString();

    // 3) Insert outbound message row
    const { data: inserted, error: insertErr } = await sb
      .from("instagram_messages")
      .insert({
        ig_message_id: igMessageId,
        ig_conversation_id: conv.ig_conversation_id,
        instagram_account_id: igAccount.id,
        platform: "instagram",
        sender_type: "business",
        sender_ig_user_id: igAccount.ig_business_account_id,
        sender_username: igAccount.username || null,
        text,
        sent_at: nowIso,
      })
      .select("*")
      .single();

    if (insertErr) {
      console.error("Insert outbound message error:", insertErr);
      throw new Error("Sent on Instagram but failed to save in DB");
    }

    // 4) Update conversation last_message
    await sb
      .from("instagram_conversations")
      .update({
        last_message: text,
        last_message_at: nowIso,
      })
      .eq("id", conv.id);

    return NextResponse.json({ message: inserted });
  } catch (err: any) {
    console.error("Send DM error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to send message" },
      { status: 500 }
    );
  }
}
