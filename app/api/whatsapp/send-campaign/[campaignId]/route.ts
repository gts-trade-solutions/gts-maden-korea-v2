import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import {
  sendWhatsAppTemplate,
  MetaTemplateSendResult,
} from "@/lib/whatsappMeta";

export async function POST(
  _req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const campaignId = params.campaignId;
  console.log("WA SEND-CAMPAIGN: start", campaignId);

  // 1) Load campaign with template_id
  const { data: campaign, error: campErr } = await supabaseAdmin
    .from("whatsapp_campaigns")
    .select("id, name, template_id")
    .eq("id", campaignId)
    .single();

  if (campErr || !campaign) {
    console.error("WA SEND-CAMPAIGN: campaign not found", campErr);
    return NextResponse.json(
      { message: "Campaign not found" },
      { status: 404 }
    );
  }

  if (!campaign.template_id) {
    console.error("WA SEND-CAMPAIGN: template_id missing");
    return NextResponse.json(
      { message: "Campaign has no template_id" },
      { status: 400 }
    );
  }

  // 2) Load template details
  const { data: template, error: tplErr } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("provider_template_name, language_code")
    .eq("id", campaign.template_id)
    .single();

  if (tplErr || !template) {
    console.error("WA SEND-CAMPAIGN: template not found", tplErr);
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
  const { data: messages, error: msgErr } = await supabaseAdmin
    .from("whatsapp_campaign_messages")
    .select(
      `
      id,
      to_phone,
      status,
      contact:whatsapp_contacts (
        full_name
      )
    `
    )
    .eq("campaign_id", campaignId)
    .eq("status", "queued");

  if (msgErr) {
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
  for (const msg of messages as any[]) {
    const msgId = msg.id as string;
    const toPhone = msg.to_phone as string;
    const contactName = msg.contact?.full_name || "";

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
      await supabaseAdmin
        .from("whatsapp_campaign_messages")
        .update({
          status: "sent",
          provider_message_id: result.providerMessageId,
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", msgId);
    } else {
      failedCount++;
      await supabaseAdmin
        .from("whatsapp_campaign_messages")
        .update({
          status: "failed",
          error_message: result.error,
        })
        .eq("id", msgId);
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
