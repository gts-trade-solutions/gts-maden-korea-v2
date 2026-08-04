export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/adminGuard";
import {
  fetchMetaTemplates,
  parseTemplateComponents,
} from "@/lib/whatsappMeta";

// POST /api/admin/whatsapp/templates/sync
// Pull the WhatsApp Business Account's message templates from Meta and upsert
// them into whatsapp_templates. Existing rows are matched first by Meta's
// template id, then by (provider_template_name + language_code) so the very
// first sync links up hand-entered templates instead of duplicating them.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const result = await fetchMetaTemplates();
  if (!result.success) {
    return json({ ok: false, error: result.error }, 502);
  }

  let created = 0;
  let updated = 0;
  const byStatus: Record<string, number> = {};

  for (const t of result.templates) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    const parsed = parseTemplateComponents(t.components);
    const bodyComp = (t.components || []).find(
      (c: any) => String(c?.type || "").toUpperCase() === "BODY"
    );
    const example: string[] = Array.isArray(bodyComp?.example?.body_text?.[0])
      ? bodyComp.example.body_text[0].map((x: any) => String(x))
      : [];

    const existing = await prisma.whatsapp_templates.findFirst({
      where: {
        OR: [
          ...(t.id ? [{ provider_template_id: t.id }] : []),
          { provider_template_name: t.name, language_code: t.language },
        ],
      },
      select: { id: true },
    });

    const common = {
      provider_template_name: t.name,
      category: t.category || "",
      language_code: t.language || "en",
      status: t.status,
      provider_template_id: t.id || null,
      components: t.components as any,
      header: parsed.header,
      body: parsed.body,
      body_preview: parsed.bodyPreview,
      example_variables: example as any,
      is_active: t.status === "APPROVED",
      synced_at: new Date(),
    };

    if (existing) {
      await prisma.whatsapp_templates.update({
        where: { id: existing.id },
        data: common, // note: does not touch the admin-facing `name`
      });
      updated++;
    } else {
      await prisma.whatsapp_templates.create({
        data: { id: randomUUID(), name: t.name, ...common },
      });
      created++;
    }
  }

  return json({
    ok: true,
    total: result.templates.length,
    created,
    updated,
    byStatus,
    syncedAt: new Date().toISOString(),
  });
}
