// app/api/admin/email/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/ses";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TargetType = "category" | "registered_users" | "upload_only";

type UploadRecipient = {
  email: string;
  name?: string | null;
};

type Body = {
  subject: string;
  bodyHtml: string;
  targetType: TargetType;
  categoryIds?: string[];
  uploadRecipients?: UploadRecipient[];
  selectedEmails?: string[]; // for registered_users
};

function buildUnsubscribeUrl(campaignId: string, email: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000";

  const params = new URLSearchParams({
    cid: campaignId,
    email,
  });

  return `${base}/api/email/unsubscribe?${params.toString()}`;
}

function applyUnsubscribePlaceholder(
  html: string,
  campaignId: string,
  email: string
) {
  const url = buildUnsubscribeUrl(campaignId, email);
  return html.replace(/{{\s*unsubscribe_url\s*}}/gi, url);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const supabase = createServiceClient();
  const body: Body = await req.json();

  const {
    subject,
    bodyHtml,
    targetType,
    categoryIds,
    uploadRecipients,
    selectedEmails,
  } = body;

  if (!subject || !bodyHtml || !targetType) {
    return NextResponse.json(
      { error: "subject, bodyHtml, targetType are required" },
      { status: 400 }
    );
  }

  // 1) Create campaign
  const { data: campaign, error: campErr } = await supabase
    .from("email_campaign")
    .insert({
      subject,
      body_html: bodyHtml,
      target_type: targetType,
      status: "queued",
    })
    .select("*")
    .single();

  if (campErr || !campaign) {
    console.error(campErr);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }

  const campaignId = campaign.id as string;

  // 2) Build recipients list (before unsubscribe filtering)
  let recipients: {
    contact_id: string | null;
    email: string;
    name: string | null;
    is_registered: boolean;
  }[] = [];

  // ---------- CATEGORY ----------
  if (targetType === "category") {
    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return NextResponse.json(
        { error: "categoryIds must be a non-empty array for category target" },
        { status: 400 }
      );
    }

    // Link categories to this campaign
    const rows = categoryIds.map((catId) => ({
      campaign_id: campaignId,
      category_id: catId,
    }));

    const { error: campCatErr } = await supabase
      .from("email_campaign_category")
      .insert(rows);

    if (campCatErr) {
      console.error(campCatErr);
      return NextResponse.json(
        { error: "Failed to link categories to campaign" },
        { status: 500 }
      );
    }

    // Fetch contacts for selected categories
    const { data: contactCats, error: ccErr } = await supabase
      .from("email_contact_category")
      .select("contact:email_contact (id, email, name, is_registered)")
      .in("category_id", categoryIds);

    if (ccErr) {
      console.error(ccErr);
      return NextResponse.json(
        { error: "Failed to fetch contacts for categories" },
        { status: 500 }
      );
    }

    const seen = new Set<string>();

    for (const row of contactCats || []) {
      const c = (row as any).contact;
      if (!c || !c.id || !c.email) continue;
      if (seen.has(c.id)) continue;
      seen.add(c.id);

      recipients.push({
        contact_id: c.id,
        email: c.email,
        name: c.name ?? null,
        is_registered: c.is_registered ?? false,
      });
    }

    // ---------- REGISTERED USERS (Supabase Auth) ----------
  } else if (targetType === "registered_users") {
    // Fetch all auth users from Supabase
    let page = 1;
    const perPage = 1000;
    const allUsers: any[] = [];

    while (true) {
      const { data, error } = await (supabase as any).auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        console.error("Error listing auth users:", error);
        return NextResponse.json(
          { error: "Failed to fetch registered users from auth" },
          { status: 500 }
        );
      }

      const users = data?.users || [];
      allUsers.push(...users);

      if (users.length < perPage) break;
      page += 1;
    }

    const selectedSet =
      Array.isArray(selectedEmails) && selectedEmails.length > 0
        ? new Set(selectedEmails.map((e) => e.toLowerCase()))
        : null;

    for (const u of allUsers) {
      const email = (u.email as string | null)?.trim();
      if (!email) continue;

      const emailLower = email.toLowerCase();
      if (selectedSet && !selectedSet.has(emailLower)) {
        // Admin did not select this user
        continue;
      }

      const name =
        (u.user_metadata && u.user_metadata.full_name) ||
        (u.user_metadata && u.user_metadata.name) ||
        null;

      recipients.push({
        contact_id: null, // not tied to email_contact
        email,
        name,
        is_registered: true,
      });
    }

    // ---------- UPLOAD-ONLY ----------
  } else if (targetType === "upload_only") {
    if (!Array.isArray(uploadRecipients) || uploadRecipients.length === 0) {
      return NextResponse.json(
        { error: "uploadRecipients must be a non-empty array for upload_only" },
        { status: 400 }
      );
    }

    const seen = new Set<string>();
    for (const r of uploadRecipients) {
      if (!r.email) continue;
      const email = r.email.trim();
      const emailLower = email.toLowerCase();
      if (seen.has(emailLower)) continue;
      seen.add(emailLower);

      recipients.push({
        contact_id: null,
        email,
        name: r.name ?? null,
        is_registered: false,
      });
    }
  }

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "No recipients found for this campaign" },
      { status: 400 }
    );
  }

  // 3) Filter out unsubscribed emails
  const emailsLower = Array.from(
    new Set(
      recipients
        .map((r) => r.email?.trim().toLowerCase())
        .filter(Boolean) as string[]
    )
  );

  const { data: unsubRows, error: unsubErr } = await supabase
    .from("email_unsubscribe")
    .select("email")
    .in("email", emailsLower);

  if (unsubErr) {
    console.error(unsubErr);
    return NextResponse.json(
      { error: "Failed to check unsubscribe list" },
      { status: 500 }
    );
  }

  const unsubSet = new Set(
    (unsubRows || []).map((r: any) => r.email.toLowerCase())
  );

  recipients = recipients.filter(
    (r) => !unsubSet.has(r.email.trim().toLowerCase())
  );

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "All recipients are unsubscribed." },
      { status: 400 }
    );
  }

  // 4) Insert recipients
  const recipientsToInsert = recipients.map((r) => ({
    campaign_id: campaignId,
    contact_id: r.contact_id,
    email: r.email,
    name: r.name,
    is_registered: r.is_registered,
    status: "pending",
  }));

  const { error: recErr } = await supabase
    .from("email_campaign_recipient")
    .insert(recipientsToInsert);

  if (recErr) {
    console.error(recErr);
    return NextResponse.json(
      { error: "Failed to insert campaign recipients" },
      { status: 500 }
    );
  }

  // 5) Mark campaign as sending
  await supabase
    .from("email_campaign")
    .update({
      status: "sending",
      send_started_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  // 6) Send emails and store SES messageId
  const { data: recsToSend, error: fetchRecErr } = await supabase
    .from("email_campaign_recipient")
    .select("id, email, name")
    .eq("campaign_id", campaignId)
    .eq("status", "pending");

  if (fetchRecErr) {
    console.error(fetchRecErr);
    return NextResponse.json(
      { error: "Failed to fetch recipients to send" },
      { status: 500 }
    );
  }

  for (const rec of recsToSend || []) {
    try {
      const finalHtml = applyUnsubscribePlaceholder(
        bodyHtml,
        campaignId,
        rec.email
      );

      const messageId = await sendEmail({
        to: rec.email,
        subject,
        html: finalHtml,
      });

      await supabase
        .from("email_campaign_recipient")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error: null,
          ses_message_id: messageId || null,
        })
        .eq("id", rec.id);
    } catch (err: any) {
      console.error("Failed to send to", rec.email, err);

      await supabase
        .from("email_campaign_recipient")
        .update({
          status: "failed",
          error: err?.message ?? "Unknown error",
        })
        .eq("id", rec.id);
    }
  }

  // 7) Mark campaign completed
  await supabase
    .from("email_campaign")
    .update({
      status: "completed",
      send_completed_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  return NextResponse.json({
    success: true,
    campaignId,
    recipientsCount: recipients.length,
  });
}
