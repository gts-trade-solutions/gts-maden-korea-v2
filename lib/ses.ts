// lib/ses.ts
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

function getSesConfig() {
  const region =
    process.env.AWS_SES_REGION ||
    process.env.SES_REGION ||
    process.env.AWS_REGION ||
    "";
  const accessKeyId = process.env.SES_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.SES_SECRET_ACCESS_KEY || "";
  const fromEmail = process.env.AWS_FROM_EMAIL || process.env.MAIL_FROM || "";

  const missing: string[] = [];
  if (!region) missing.push("AWS_SES_REGION or SES_REGION");
  if (!accessKeyId) missing.push("SES_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("SES_SECRET_ACCESS_KEY");
  if (!fromEmail) missing.push("AWS_FROM_EMAIL or MAIL_FROM");

  return { region, accessKeyId, secretAccessKey, fromEmail, missing };
}

export async function sendEmail({
  to,
  subject,
  html,
  from,
  cc,
}: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  /**
   * Optional CC recipients. Use for team-facing notifications where
   * we want a copy to land in multiple inboxes (e.g., info@ + ops@).
   * Customer-facing emails (password reset, order confirmation to
   * buyer, shipping updates) should NOT pass this — keeping internal
   * addresses off customer mail headers.
   */
  cc?: string | string[];
}) {
  const { region, accessKeyId, secretAccessKey, fromEmail, missing } =
    getSesConfig();
  if (missing.length > 0) {
    throw new Error(`SES config missing: ${missing.join(", ")}`);
  }
  const sender = (from || fromEmail || "").trim();
  if (!sender) {
    throw new Error("SES sender missing: provide from or set AWS_FROM_EMAIL/MAIL_FROM");
  }

  const sesClient = new SESClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  // Normalise cc to a clean string[]; SES rejects empty arrays so we
  // only set CcAddresses when at least one valid recipient is present.
  const ccList = (Array.isArray(cc) ? cc : cc ? [cc] : [])
    .map((s) => s.trim())
    .filter(Boolean);

  const command = new SendEmailCommand({
    Source: sender,
    Destination: {
      ToAddresses: [to],
      ...(ccList.length > 0 ? { CcAddresses: ccList } : {}),
    },
    Message: {
      Subject: { Data: subject, Charset: "UTF-8" },
      Body: { Html: { Data: html, Charset: "UTF-8" } },
    },
  });

  const res = await sesClient.send(command);
  return res.MessageId; // store this against recipient
}
