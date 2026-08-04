// lib/whatsappMeta.ts

import crypto from "node:crypto";

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const API_VERSION = process.env.WHATSAPP_API_VERSION || "v22.0";
// WhatsApp Business Account id — needed to pull approved templates from Meta.
const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
// App secret — used to verify X-Hub-Signature-256 on inbound webhook calls.
const APP_SECRET = process.env.META_APP_SECRET || "";

export function getWhatsAppMetaConfigStatus() {
  const missing = [
    !PHONE_NUMBER_ID ? "WHATSAPP_PHONE_NUMBER_ID" : null,
    !ACCESS_TOKEN ? "WHATSAPP_ACCESS_TOKEN" : null,
  ].filter(Boolean) as string[];

  return {
    configured: missing.length === 0,
    apiVersion: API_VERSION,
    phoneNumberId: PHONE_NUMBER_ID || null,
    missing,
  };
}

export type MetaTemplateSendOptions = {
  toPhone: string;        // e.g. "+9198..." or "9198..."
  templateName: string;   // exact template name in Meta
  languageCode: string;   // e.g. "en_US"
  bodyVariables?: string[];
};

export type MetaTemplateSendResult =
  | { success: true; providerMessageId: string }
  | { success: false; error: string };

function normalizePhone(raw: string): string {
  // Meta sample uses digits only: "91744..."
  return (raw || "").replace(/[^\d]/g, "");
}

export async function sendWhatsAppTemplate(
  opts: MetaTemplateSendOptions
): Promise<MetaTemplateSendResult> {
  const config = getWhatsAppMetaConfigStatus();
  if (!config.configured) {
    return {
      success: false,
      error: `Missing WhatsApp Meta config: ${config.missing.join(", ")}`,
    };
  }

  const { templateName, languageCode, bodyVariables = [] } = opts;
  const to = normalizePhone(opts.toPhone);

  const components =
    bodyVariables.length > 0
      ? [
          {
            type: "body",
            parameters: bodyVariables.map((val) => ({
              type: "text",
              text: val,
            })),
          },
        ]
      : [];

  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload: any = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  };

  if (components.length > 0) {
    payload.template.components = components;
  }

  console.log("WA DEBUG request =>", JSON.stringify(payload));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log("WA DEBUG response status:", res.status);
  console.log("WA DEBUG response body:", text);

  if (!res.ok) {
    return { success: false, error: text };
  }

  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    // ignore
  }

  const providerMessageId = data?.messages?.[0]?.id || "";

  if (!providerMessageId) {
    return {
      success: false,
      error: "No message id returned by Meta: " + text,
    };
  }

  return { success: true, providerMessageId };
}

// ---------------------------------------------------------------------------
// Direct-Meta-connect helpers (template sync + webhook)
// ---------------------------------------------------------------------------

export type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string; // APPROVED | PENDING | REJECTED | ...
  components: any[];
};

export type FetchTemplatesResult =
  | { success: true; templates: MetaTemplate[] }
  | { success: false; error: string };

/**
 * Pull the WhatsApp Business Account's message templates straight from Meta
 * (GET /{WABA_ID}/message_templates), following pagination. This is the
 * "direct connect" source of truth — the local whatsapp_templates table is a
 * cache of what Meta has approved.
 */
export async function fetchMetaTemplates(): Promise<FetchTemplatesResult> {
  if (!WABA_ID) {
    return { success: false, error: "WHATSAPP_BUSINESS_ACCOUNT_ID is not set" };
  }
  const out: MetaTemplate[] = [];
  let url =
    `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/message_templates` +
    `?limit=100&fields=id,name,language,category,status,components`;
  try {
    for (let guard = 0; guard < 25 && url; guard++) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      });
      const text = await res.text();
      if (!res.ok) return { success: false, error: text };
      const data = JSON.parse(text);
      for (const t of data?.data || []) {
        out.push({
          id: String(t.id ?? ""),
          name: String(t.name ?? ""),
          language: String(t.language ?? "en"),
          category: String(t.category ?? ""),
          status: String(t.status ?? ""),
          components: Array.isArray(t.components) ? t.components : [],
        });
      }
      url = data?.paging?.next || "";
    }
    return { success: true, templates: out };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/**
 * Verify Meta's X-Hub-Signature-256 over the RAW request body using the app
 * secret. Constant-time compare. Returns false (reject) whenever the secret or
 * header is missing so an unconfigured webhook fails closed.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined
): boolean {
  if (!APP_SECRET || !signatureHeader) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", APP_SECRET).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Flatten a Meta template `components` array into the shape our
 * whatsapp_templates columns use (header text, body text, a masked preview,
 * and the {{n}} variable count).
 */
export function parseTemplateComponents(components: any[]): {
  header: string | null;
  body: string | null;
  bodyPreview: string | null;
  variableCount: number;
} {
  let header: string | null = null;
  let body: string | null = null;
  for (const c of components || []) {
    const type = String(c?.type || "").toUpperCase();
    if (type === "HEADER" && c?.format === "TEXT" && c?.text) header = String(c.text);
    if (type === "BODY" && c?.text) body = String(c.text);
  }
  const varRe = /\{\{\s*\d+\s*\}\}/g;
  return {
    header,
    body,
    bodyPreview: body ? body.replace(varRe, "___") : null,
    variableCount: body ? (body.match(varRe) || []).length : 0,
  };
}
