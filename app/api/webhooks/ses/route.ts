// app/api/webhooks/ses/route.ts
//
// SES bounce/complaint/delivery/open/click webhook, delivered via SNS.
// Port of the old Supabase `ses-webhook` edge function to a Next route
// backed by MySQL (Prisma). Handles the SNS SubscriptionConfirmation
// handshake, unwraps the SES event out of the SNS envelope, maps event
// types onto `email_campaign_recipient` columns, and auto-unsubscribes
// bounced / complained addresses in `email_unsubscribe`.
//
// NOTE (human action required): repoint the AWS SNS topic subscription
// (SES event notifications) at this route's public URL —
//   https://<your-domain>/api/webhooks/ses
// — replacing the old Supabase edge-function URL. On first delivery SNS
// sends a SubscriptionConfirmation, which this route auto-confirms.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SnsMessageType =
  | "SubscriptionConfirmation"
  | "Notification"
  | "UnsubscribeConfirmation";

const DEBUG = true;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function log(...args: any[]) {
  if (DEBUG) {
    console.log("[SES-WEBHOOK]", ...args);
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: corsHeaders,
  });
}

async function autoUnsubscribe(email: string, source: string) {
  try {
    log("Auto-unsubscribe:", email, "source:", source);
    await prisma.email_unsubscribe.upsert({
      where: { email },
      update: { source },
      create: { id: randomUUID(), email, source },
    });
  } catch (err) {
    console.error("[SES-WEBHOOK] autoUnsubscribe error:", err);
  }
}

export async function OPTIONS() {
  return new NextResponse("ok", { status: 200, headers: corsHeaders });
}

export async function POST(req: Request) {
  const bodyText = await req.text();
  log("Incoming request body:", bodyText);

  let message: any;
  try {
    message = JSON.parse(bodyText);
  } catch (err) {
    console.error("[SES-WEBHOOK] Invalid JSON body", err, bodyText);
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const messageType = message.Type as SnsMessageType | undefined;
  log("message.Type =", messageType);

  // 1) SNS subscription confirmation
  if (messageType === "SubscriptionConfirmation") {
    const subscribeUrl = message.SubscribeURL as string | undefined;
    log("Handling SubscriptionConfirmation, URL:", subscribeUrl);
    if (subscribeUrl) {
      try {
        await fetch(subscribeUrl);
        log("Subscription confirmed.");
      } catch (err) {
        console.error("[SES-WEBHOOK] Failed to confirm SNS subscription:", err);
      }
    }
    return json({ ok: true }, 200);
  }

  // 2) Extract SES event:
  //    - SNS (Type=Notification) with SES JSON inside `Message`
  //    - Or a direct SES/SNS raw event (no Type field)
  let sesEvent: any;

  if (messageType === "Notification" && typeof message.Message === "string") {
    log("Detected SNS envelope; parsing message.Message as SES event");
    try {
      sesEvent = JSON.parse(message.Message);
    } catch (err) {
      console.error(
        "[SES-WEBHOOK] Invalid SES event JSON inside SNS Message",
        err,
        message.Message
      );
      return json(
        { ok: false, error: "Invalid SES JSON inside SNS Message" },
        400
      );
    }
  } else {
    log("No SNS envelope; treating body as SES event directly");
    sesEvent = message;
  }

  // 3) Get eventType and messageId from the SES event
  const rawEventType = sesEvent.notificationType || sesEvent.eventType;
  const eventType =
    typeof rawEventType === "string" ? rawEventType.toLowerCase() : undefined;

  const mail = sesEvent.mail || {};
  const messageId = mail.messageId as string | undefined;
  const destination = (mail.destination || []) as string[];
  const firstEmail = destination.length > 0 ? destination[0] : undefined;

  log("Parsed SES eventType =", rawEventType, "->", eventType);
  log("SES mail.messageId =", messageId);
  log("SES mail.destination =", destination);

  if (!messageId || !eventType) {
    console.warn("[SES-WEBHOOK] Missing messageId or eventType in SES event", {
      messageId,
      eventType,
      sesEvent,
    });
    return json({ ok: true }, 200);
  }

  const now = new Date();
  const updates: Record<string, any> = {};

  try {
    // 4) Map SES event types → email_campaign_recipient columns
    if (eventType === "delivery") {
      updates.delivery_event = "delivered";
      updates.delivery_event_at = now;
      updates.delivery_event_payload = sesEvent;
      log("Mapped delivery event -> updates:", updates);
    } else if (eventType === "bounce") {
      updates.delivery_event = "bounce";
      updates.delivery_event_at = now;
      updates.delivery_event_payload = sesEvent;
      log("Mapped bounce event -> updates:", updates);

      if (firstEmail) {
        await autoUnsubscribe(firstEmail.toLowerCase(), "ses_bounce");
      }
    } else if (eventType === "complaint") {
      updates.delivery_event = "complaint";
      updates.delivery_event_at = now;
      updates.delivery_event_payload = sesEvent;
      log("Mapped complaint event -> updates:", updates);

      if (firstEmail) {
        await autoUnsubscribe(firstEmail.toLowerCase(), "ses_complaint");
      }
    } else if (eventType === "open") {
      updates.has_opened = true;
      updates.opened_at = now;
      updates.last_engagement_payload = sesEvent;
      log("Mapped open event -> updates:", updates);
    } else if (eventType === "click") {
      updates.has_clicked = true;
      updates.clicked_at = now;
      updates.last_engagement_payload = sesEvent;
      log("Mapped click event -> updates:", updates);
    } else {
      log("Unhandled eventType; storing in last_engagement_payload only");
      updates.last_engagement_payload = sesEvent;
    }

    if (!updates.last_engagement_payload) {
      updates.last_engagement_payload = sesEvent;
    }

    // 5) Apply updates by SES message id and report how many rows matched
    log("Running DB update with messageId =", messageId, "updates =", updates);

    const result = await prisma.email_campaign_recipient.updateMany({
      where: { ses_message_id: messageId },
      data: updates,
    });

    log("DB update complete. Updated rows count =", result.count);

    return json({ ok: true, updated: result.count }, 200);
  } catch (err) {
    console.error("[SES-WEBHOOK] Unexpected error handling SES event:", err);
    return json({ ok: false, error: "Unexpected error" }, 500);
  }
}
