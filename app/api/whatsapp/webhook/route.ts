export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { verifyWebhookSignature } from "@/lib/whatsappMeta";

// Meta WhatsApp Cloud API webhook.
//
//   GET  -> subscription handshake. Meta calls with ?hub.mode=subscribe&
//           hub.verify_token=<token>&hub.challenge=<n>; we echo the challenge
//           iff the token matches WHATSAPP_WEBHOOK_VERIFY_TOKEN.
//   POST -> delivery/read status + inbound customer replies. Verified against
//           X-Hub-Signature-256 (HMAC-SHA256 of the raw body with META_APP_SECRET).
//
// This is the piece that makes the campaign tool "live": outbound sends already
// store provider_message_id (wamid) on whatsapp_campaign_messages; Meta's status
// callbacks key off that same id to flip queued -> sent -> delivered -> read,
// and inbound messages land in whatsapp_inbound_messages.

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "";

const digits = (s: string) => (s || "").replace(/[^\d]/g, "");
const tsToDate = (t: any) =>
  t ? new Date(Number(t) * 1000) : new Date();

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = p.get("hub.verify_token");
  const challenge = p.get("hub.challenge") || "";
  if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  // Raw body is required for a correct signature check.
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature(raw, sig)) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  let payload: any = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // ack malformed to stop retries
  }

  try {
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        const value = change?.value || {};
        await handleStatuses(value?.statuses || []);
        await handleInbound(value?.messages || []);
      }
    }
  } catch (e) {
    // Never 500 the webhook (Meta would retry aggressively). Log + ack.
    console.error("WA webhook processing error:", (e as any)?.message || e);
  }

  return NextResponse.json({ ok: true });
}

// sent -> delivered -> read; failed is terminal. Guards prevent an out-of-order
// callback from downgrading a message (e.g. a late "delivered" after "read").
async function handleStatuses(statuses: any[]) {
  for (const st of statuses) {
    const wamid = String(st?.id || "");
    if (!wamid) continue;
    const when = tsToDate(st?.timestamp);
    const kind = String(st?.status || "");

    if (kind === "sent") {
      await prisma.whatsapp_campaign_messages.updateMany({
        where: { provider_message_id: wamid, status: { in: ["queued", "sent"] } },
        data: { status: "sent", sent_at: when },
      });
    } else if (kind === "delivered") {
      await prisma.whatsapp_campaign_messages.updateMany({
        where: { provider_message_id: wamid, status: { notIn: ["read"] } },
        data: { status: "delivered", delivered_at: when },
      });
    } else if (kind === "read") {
      await prisma.whatsapp_campaign_messages.updateMany({
        where: { provider_message_id: wamid },
        data: { status: "read", read_at: when },
      });
    } else if (kind === "failed") {
      const err =
        st?.errors?.[0]?.title ||
        st?.errors?.[0]?.message ||
        st?.errors?.[0]?.error_data?.details ||
        "failed";
      await prisma.whatsapp_campaign_messages.updateMany({
        where: { provider_message_id: wamid },
        data: { status: "failed", error_message: String(err) },
      });
    }
  }
}

// Store inbound replies. Idempotent on wa_message_id (Meta re-delivers on retry).
// Best-effort link to a known contact by phone.
async function handleInbound(messages: any[]) {
  for (const m of messages) {
    const wamid = String(m?.id || "");
    if (!wamid) continue;
    const from = String(m?.from || "");
    const type = String(m?.type || "text");
    const body =
      m?.text?.body ??
      m?.button?.text ??
      m?.interactive?.button_reply?.title ??
      m?.interactive?.list_reply?.title ??
      null;

    const fromDigits = digits(from);
    const contact = await prisma.whatsapp_contacts.findFirst({
      where: { phone_e164: { in: [from, "+" + fromDigits, fromDigits] } },
      select: { id: true },
    });

    await prisma.whatsapp_inbound_messages.upsert({
      where: { wa_message_id: wamid },
      update: {}, // already stored -> no-op (idempotent)
      create: {
        id: randomUUID(),
        wa_message_id: wamid,
        from_phone: from,
        contact_id: contact?.id ?? null,
        type,
        text_body: body ? String(body) : null,
        raw: m,
        received_at: tsToDate(m?.timestamp),
      },
    });
  }
}
