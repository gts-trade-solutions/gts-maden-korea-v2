// app/api/me/payouts/request/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { prisma } from "@/lib/db/prisma";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { getAdminRecipientEmails } from "@/lib/notificationRecipients";

const ses = new SESClient({
  region: process.env.SES_REGION || "ap-south-1",
});

export async function POST(req: NextRequest) {
  const { user } = await getRouteAuth(req);

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // ---- Parse body from frontend ----
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const amount = Number(body.amount || 0);
  const method: string = body.method || "manual"; // e.g. "manual", "upi", "bank"
  const contact_email: string | null = body.contact_email || user.email || null;
  const request_note: string | null = body.request_note || null;

  if (!(amount > 0)) {
    return NextResponse.json(
      { ok: false, error: "Amount must be greater than 0." },
      { status: 400 }
    );
  }

  // ---- 1) Recalculate available wallet on the server ----
  // Same logic idea as /api/me/summary: available = approved commissions - payouts.
  let approvedTotal = 0;
  let debited = 0;
  try {
    const [approvedAgg, payoutAgg] = await Promise.all([
      // Only commissions that are actually unlocked / withdrawable.
      prisma.order_attributions.aggregate({
        _sum: { commission_amount: true },
        where: { influencer_id: user.id, status: "approved" },
      }),
      // Any payout that isn't failed/canceled is treated as debited.
      prisma.influencer_payouts.aggregate({
        _sum: { amount: true },
        where: {
          influencer_id: user.id,
          status: { in: ["initiated", "processing", "paid"] },
        },
      }),
    ]);
    approvedTotal = Number(approvedAgg._sum.commission_amount ?? 0);
    debited = Number(payoutAgg._sum.amount ?? 0);
  } catch (e) {
    console.error("payout balance read error", e);
    return NextResponse.json(
      { ok: false, error: "Failed to load earnings." },
      { status: 500 }
    );
  }

  const available = Math.max(0, approvedTotal - debited);

  if (amount > available + 0.0001) {
    return NextResponse.json(
      {
        ok: false,
        error: `You can request up to ${available.toFixed(2)} right now.`,
      },
      { status: 400 }
    );
  }

  // ---- 2) Insert payout row: this creates "Pending" in UI & debits wallet ----
  // NOTE: even though DB default is 'pending', we explicitly set 'initiated'
  // so it matches your frontend PayoutRow status & "Pending review" badge.
  // `covering_orders` is NOT NULL (json) in MySQL and has no Prisma-applied
  // default, so it is written explicitly.
  let inserted: { id: string };
  try {
    inserted = await prisma.influencer_payouts.create({
      data: {
        id: randomUUID(),
        influencer_id: user.id,
        amount,
        currency: "INR",
        status: "initiated", // <-- pending request in UI
        method,
        contact_email,
        notes: request_note, // JSON string with UPI/bank details from frontend
        covering_orders: [],
      },
      select: { id: true },
    });
  } catch (e) {
    console.error("insert payout error", e);
    return NextResponse.json(
      { ok: false, error: "Could not create payout request." },
      { status: 500 }
    );
  }

  // ---- 3) Send AWS SES email to admin with payout details ----
  // Recipients are admin-managed at /admin/settings/notification-emails.
  // First entry becomes the primary "to"; the rest go on CC. If the
  // table is empty we skip the email — the payout row was already
  // inserted, so admin can pick it up from the dashboard.
  const fromEmail = "info@madenkorea.com";
  const recipients = await getAdminRecipientEmails();

  if (recipients.length > 0 && fromEmail) {
    try {
      const textLines = [
        "New payout request",
        "",
        `Influencer ID: ${user.id}`,
        `Email: ${user.email || "N/A"}`,
        `Requested amount: ₹${amount.toFixed(2)}`,
        `Method: ${method}`,
        `Contact email: ${contact_email || "N/A"}`,
        "",
        "Raw request note (JSON):",
        request_note || "(none)",
      ];

      const [primaryTo, ...cc] = recipients;

      const cmd = new SendEmailCommand({
        Source: fromEmail,
        Destination: {
          ToAddresses: [primaryTo],
          ...(cc.length > 0 ? { CcAddresses: cc } : {}),
        },
        Message: {
          Subject: {
            Data: `New payout request: ₹${amount.toFixed(2)}`,
          },
          Body: {
            Text: {
              Data: textLines.join("\n"),
            },
          },
        },
      });

      await ses.send(cmd);
    } catch (err) {
      console.error("Failed to send payout SES email", err);
      // do NOT fail the API if email fails – the payout row is already created
    }
  } else {
    console.warn(
      "PAYOUT_ADMIN_EMAIL or SES_FROM_EMAIL not set, skipping SES email."
    );
  }

  // ---- 4) Done ----
  return NextResponse.json({ ok: true, payout_id: inserted.id });
}
