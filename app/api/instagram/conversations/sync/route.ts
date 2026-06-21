// app/api/instagram/conversations/sync/route.ts
import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

export async function POST(req: Request) {
  const { user, sb } = await getRouteAuth();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const instagramAccountId = searchParams.get("instagram_account_id");

  // 1) Resolve which IG account we’re syncing for
  const { data: igAccount, error: igErr } = await sb
    .from("instagram_accounts")
    .select("id, owner_id, ig_business_account_id, facebook_page_id, access_token, page_access_token, username")
    .eq("id", instagramAccountId)
    .maybeSingle();

  if (igErr || !igAccount) {
    return NextResponse.json(
      { error: "Instagram account not found" },
      { status: 404 }
    );
  }

  if (igAccount.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Not allowed to sync this account" },
      { status: 403 }
    );
  }

  const pageId = igAccount.facebook_page_id;
  const pageToken = igAccount.page_access_token;

  if (!pageId || !pageToken) {
    return NextResponse.json(
      {
        error:
          "facebook_page_id or page_access_token missing on instagram_accounts (needed for DM sync)",
      },
      { status: 400 }
    );
  }

  try {
    // 2) Call Graph API: list conversations for this Page, Instagram only
    // Docs pattern: /{page-id}/conversations?platform=instagram&fields=... :contentReference[oaicite:2]{index=2}
    const url = new URL(`${GRAPH_BASE}/${pageId}/conversations`);
    url.searchParams.set("platform", "instagram");
    url.searchParams.set(
      "fields",
      "id,updated_time,participants,messages.limit(1){message,from,created_time}"
    );
    url.searchParams.set("limit", "50");
    url.searchParams.set("access_token", pageToken);

    const res = await fetch(url.toString());
    const json = await res.json();

    if (!res.ok) {
      console.error("Conversations fetch error:", json);
      throw new Error(json.error?.message || "Failed to fetch conversations");
    }

    const conversations = (json.data || []) as any[];

    const rows = conversations.map((conv) => {
      const participants = conv.participants?.data || [];
      // Try to find the non-page participant as the user
      const other = participants.find(
        (p: any) => p.id !== pageId
      ) || participants[0];

      const lastMsg = conv.messages?.data?.[0];

      return {
        ig_conversation_id: conv.id,
        // you can also store pageId here if you add a column
        instagram_account_id: igAccount.id,
        platform: "instagram",
        participant_ig_user_id: other?.id || null,
        participant_username: other?.name || null,
        last_message: lastMsg?.message || null,
        last_message_at: lastMsg?.created_time
          ? new Date(lastMsg.created_time).toISOString()
          : conv.updated_time
          ? new Date(conv.updated_time).toISOString()
          : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    if (rows.length > 0) {
      const { error: upsertErr } = await sb
        .from("instagram_conversations")
        .upsert(rows, {
          onConflict: "ig_conversation_id",
        });

      if (upsertErr) {
        console.error("Conversations upsert error:", upsertErr);
        throw new Error("Failed to save conversations");
      }
    }

    return NextResponse.json({ synced_count: rows.length });
  } catch (err: any) {
    console.error("Sync conversations error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to sync conversations" },
      { status: 500 }
    );
  }
}
