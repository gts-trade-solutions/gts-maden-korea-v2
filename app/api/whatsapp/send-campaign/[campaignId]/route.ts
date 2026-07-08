import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  sendWhatsAppTemplate,
  MetaTemplateSendResult,
} from "@/lib/whatsappMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const campaignId = params.campaignId;
  console.log("WA SEND-CAMPAIGN: start", campaignId);

  // 1) Load campaign with template_id
  const campaign = await prisma.whatsapp_campaigns.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, template_id: true },
  });

  if (!campaign) {
    console.error("WA SEND-CAMPAIGN: campaign not found");
    return NextResponse.json({ message: "Campaign not found" }, { status: 404 });
  }

  if (!campaign.template_id) {
    console.error("WA SEND-CAMPAIGN: template_id missing");
    return NextResponse.json(
      { message: "Campaign has no template_id" },
      { status: 400 }
    );
  }

  // 2) Load template details
  const template = await prisma.whatsapp_templates.findUnique({
    where: { id: campaign.template_id },
    select: { provider_template_name: true, language_code: true },
  });

  if (!template) {
    console.error("WA SEND-CAMPAIGN: template not found");
    return NextResponse.json(
      { message: "Template not found for this campaign" },
      { status: 400 }
    );
  }

  const templateName = template.provider_template_name as string;
  const languageCode = template.language_code as string;

  console.log(
    "WA SEND-CAMPAIGN: template",
    templateName,
    "lang",
    languageCode
  );

  // 3) Load queued messages
  let messages: any[];
  try {
    messages = await prisma.whatsapp_campaign_messages.findMany({
      where: { campaign_id: campaignId, status: "queued" },
      select: {
        id: true,
        to_phone: true,
        status: true,
        whatsapp_contacts: {
          select: { full_name: true },
        },
      },
    });
  } catch (msgErr) {
    console.error("WA SEND-CAMPAIGN: load messages error", msgErr);
    return NextResponse.json(
      { message: "Failed to load queued messages" },
      { status: 500 }
    );
  }

  if (!messages || messages.length === 0) {
    console.log("WA SEND-CAMPAIGN: no queued messages");
    return NextResponse.json({
      message: "No queued messages to send",
      sent: 0,
      failed: 0,
    });
  }

  let sentCount = 0;
  let failedCount = 0;

  // 4) Loop through messages and send to Meta
  for (const msg of messages) {
    const msgId = msg.id as string;
    const toPhone = msg.to_phone as string;
    const contactName = msg.whatsapp_contacts?.full_name || "";

    // Decide body variables based on template
    let bodyVars: string[] = [];

    // hello_world has 0 params → do NOT send any body variables
    if (templateName === "hello_world") {
      bodyVars = [];
    } else {
      // for templates like "race_test_hello" with {{1}} in body
      bodyVars = contactName ? [contactName] : ["Friend"];
    }

    let result: MetaTemplateSendResult;

    try {
      result = await sendWhatsAppTemplate({
        toPhone,
        templateName,
        languageCode,
        bodyVariables: bodyVars,
      });
    } catch (err: any) {
      console.error("WA SEND-CAMPAIGN: unexpected", msgId, err);
      result = { success: false, error: err?.message || "Unknown error" };
    }

    if (result.success) {
      sentCount++;
      await prisma.whatsapp_campaign_messages.update({
        where: { id: msgId },
        data: {
          status: "sent",
          provider_message_id: result.providerMessageId,
          sent_at: new Date(),
          error_message: null,
        },
      });
    } else {
      failedCount++;
      await prisma.whatsapp_campaign_messages.update({
        where: { id: msgId },
        data: {
          status: "failed",
          error_message: result.error,
        },
      });
    }
  }

  console.log(
    "WA SEND-CAMPAIGN: finished",
    campaignId,
    "sent:",
    sentCount,
    "failed:",
    failedCount
  );

  return NextResponse.json({
    message: "Campaign send finished",
    sent: sentCount,
    failed: failedCount,
  });
}
