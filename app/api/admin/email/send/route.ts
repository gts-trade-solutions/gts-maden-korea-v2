// app/api/admin/email/send/route.ts
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
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
  const campaignId = randomUUID();
  try {
    await prisma.email_campaign.create({
      data: {
        id: campaignId,
        subject,
        body_html: bodyHtml,
        target_type: targetType,
        status: "queued",
      },
    });
  } catch (campErr) {
    console.error(campErr);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }

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

    try {
      await prisma.email_campaign_category.createMany({ data: rows });
    } catch (campCatErr) {
      console.error(campCatErr);
      return NextResponse.json(
        { error: "Failed to link categories to campaign" },
        { status: 500 }
      );
    }

    // Fetch contacts for selected categories
    let contactCats;
    try {
      contactCats = await prisma.email_contact_category.findMany({
        where: { category_id: { in: categoryIds } },
        select: {
          email_contact: {
            select: { id: true, email: true, name: true, is_registered: true },
          },
        },
      });
    } catch (ccErr) {
      console.error(ccErr);
      return NextResponse.json(
        { error: "Failed to fetch contacts for categories" },
        { status: 500 }
      );
    }

    const seen = new Set<string>();

    for (const row of contactCats || []) {
      const c = (row as any).email_contact;
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

    // ---------- REGISTERED USERS (auth users) ----------
  } else if (targetType === "registered_users") {
    let allUsers;
    try {
      allUsers = await prisma.user.findMany({
        where: { email: { not: null } },
        select: { id: true, email: true, name: true },
      });
    } catch (err) {
      console.error("Error listing auth users:", err);
      return NextResponse.json(
        { error: "Failed to fetch registered users from auth" },
        { status: 500 }
      );
    }

    const selectedSet =
      Array.isArray(selectedEmails) && selectedEmails.length > 0
        ? new Set(selectedEmails.map((e) => e.toLowerCase()))
        : null;

    const chosen = allUsers.filter((u) => {
      const email = (u.email as string | null)?.trim();
      if (!email) return false;
      // Admin did not select this user
      if (selectedSet && !selectedSet.has(email.toLowerCase())) return false;
      return true;
    });

    // Prefer the canonical profile name (profiles.full_name); fall back to the
    // NextAuth auth-user name.
    const ids = chosen.map((u) => u.id);
    const profs =
      ids.length > 0
        ? await prisma.profiles.findMany({
            where: { id: { in: ids } },
            select: { id: true, full_name: true },
          })
        : [];
    const nameMap = new Map<string, string | null>();
    for (const p of profs) nameMap.set(p.id, p.full_name ?? null);

    for (const u of chosen) {
      const email = (u.email as string).trim();
      const name = nameMap.get(u.id) ?? u.name ?? null;

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

  let unsubRows;
  try {
    unsubRows = await prisma.email_unsubscribe.findMany({
      where: { email: { in: emailsLower } },
      select: { email: true },
    });
  } catch (unsubErr) {
    console.error(unsubErr);
    return NextResponse.json(
      { error: "Failed to check unsubscribe list" },
      { status: 500 }
    );
  }

  const unsubSet = new Set(
    (unsubRows || []).map((r) => r.email.toLowerCase())
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
    id: randomUUID(),
    campaign_id: campaignId,
    contact_id: r.contact_id,
    email: r.email,
    name: r.name,
    is_registered: r.is_registered,
    status: "pending",
  }));

  try {
    await prisma.email_campaign_recipient.createMany({
      data: recipientsToInsert,
    });
  } catch (recErr) {
    console.error(recErr);
    return NextResponse.json(
      { error: "Failed to insert campaign recipients" },
      { status: 500 }
    );
  }

  // 5) Mark campaign as sending
  await prisma.email_campaign.update({
    where: { id: campaignId },
    data: {
      status: "sending",
      send_started_at: new Date(),
    },
  });

  // 6) Send emails and store SES messageId
  let recsToSend;
  try {
    recsToSend = await prisma.email_campaign_recipient.findMany({
      where: { campaign_id: campaignId, status: "pending" },
      select: { id: true, email: true, name: true },
    });
  } catch (fetchRecErr) {
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

      await prisma.email_campaign_recipient.update({
        where: { id: rec.id },
        data: {
          status: "sent",
          sent_at: new Date(),
          error: null,
          ses_message_id: messageId || null,
        },
      });
    } catch (err: any) {
      console.error("Failed to send to", rec.email, err);

      await prisma.email_campaign_recipient.update({
        where: { id: rec.id },
        data: {
          status: "failed",
          error: err?.message ?? "Unknown error",
        },
      });
    }
  }

  // 7) Mark campaign completed
  await prisma.email_campaign.update({
    where: { id: campaignId },
    data: {
      status: "completed",
      send_completed_at: new Date(),
    },
  });

  return NextResponse.json(
    jsonSafe({
      success: true,
      campaignId,
      recipientsCount: recipients.length,
    })
  );
}
