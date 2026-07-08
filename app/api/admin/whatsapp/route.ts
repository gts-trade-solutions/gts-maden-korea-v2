export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin-only READ endpoint for the WhatsApp marketing pages (MySQL/Prisma).
//
// One route, dispatched by ?resource=... so each page's exact
// select/filter/order is replicated and the UI is unchanged:
//   stats           -> dashboard counts + recent campaigns
//   contacts        -> full contacts list
//   templates       -> templates list (optional ?activeOnly=1)
//   campaigns       -> campaigns list
//   campaign        -> single campaign + its template + message stats (?id=)
//   audience-resolve-> contacts matching tags (?tags=a,b ; omit => all)
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const url = new URL(req.url);
  const resource = url.searchParams.get("resource") || "";

  try {
    if (resource === "stats") {
      // Dashboard: aggregate counts + 5 most recent campaigns.
      const [
        totalContacts,
        activeTemplates,
        totalCampaigns,
        runningCampaigns,
        recentCampaigns,
      ] = await Promise.all([
        prisma.whatsapp_contacts.count(),
        prisma.whatsapp_templates.count({ where: { is_active: true } }),
        prisma.whatsapp_campaigns.count(),
        prisma.whatsapp_campaigns.count({ where: { status: "running" } }),
        prisma.whatsapp_campaigns.findMany({
          select: {
            id: true,
            name: true,
            status: true,
            total_target_count: true,
            created_at: true,
          },
          orderBy: { created_at: "desc" },
          take: 5,
        }),
      ]);

      return json({
        ok: true,
        stats: {
          totalContacts: totalContacts ?? 0,
          activeTemplates: activeTemplates ?? 0,
          totalCampaigns: totalCampaigns ?? 0,
          runningCampaigns: runningCampaigns ?? 0,
        },
        recentCampaigns: jsonSafe(recentCampaigns ?? []),
      });
    }

    if (resource === "contacts") {
      // Full contacts list (contacts page).
      const data = await prisma.whatsapp_contacts.findMany({
        orderBy: { created_at: "desc" },
      });
      return json({ ok: true, contacts: jsonSafe(data ?? []) });
    }

    if (resource === "templates") {
      // Templates list. activeOnly=1 mirrors the campaigns/new page read.
      const activeOnly = url.searchParams.get("activeOnly") === "1";
      const data = await prisma.whatsapp_templates.findMany({
        where: activeOnly ? { is_active: true } : undefined,
        select: activeOnly
          ? {
              id: true,
              name: true,
              provider_template_name: true,
              category: true,
              language_code: true,
              body_preview: true,
            }
          : {
              id: true,
              name: true,
              provider_template_name: true,
              category: true,
              language_code: true,
              body_preview: true,
              is_active: true,
              created_at: true,
            },
        orderBy: { created_at: "desc" },
      });
      return json({ ok: true, templates: jsonSafe(data ?? []) });
    }

    if (resource === "tags") {
      // Distinct tags across all contacts (campaigns/new audience picker).
      const data = await prisma.whatsapp_contacts.findMany({
        select: { tags: true },
      });
      const set = new Set<string>();
      (data || []).forEach((c: any) => {
        ((c.tags as any[]) || []).forEach((t: string) => set.add(t));
      });
      return json({ ok: true, tags: Array.from(set).sort() });
    }

    if (resource === "campaigns") {
      // Campaigns list page.
      const data = await prisma.whatsapp_campaigns.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          scheduled_at: true,
          started_at: true,
          completed_at: true,
          total_target_count: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
      });
      return json({ ok: true, campaigns: jsonSafe(data ?? []) });
    }

    if (resource === "campaign") {
      // Single campaign detail page: campaign + its template + message stats.
      const id = url.searchParams.get("id") || "";
      if (!id) return json({ ok: false, error: "MISSING_ID" }, 400);

      const campaign = await prisma.whatsapp_campaigns.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          status: true,
          template_id: true,
          scheduled_at: true,
          started_at: true,
          completed_at: true,
          total_target_count: true,
          created_at: true,
        },
      });
      if (!campaign) return json({ ok: false, error: "NOT_FOUND" }, 404);

      let template: any = null;
      if (campaign.template_id) {
        const tpl = await prisma.whatsapp_templates.findUnique({
          where: { id: campaign.template_id },
          select: {
            id: true,
            name: true,
            provider_template_name: true,
            language_code: true,
          },
        });
        if (tpl) template = tpl;
      }

      const [queued, sent, failed] = await Promise.all([
        prisma.whatsapp_campaign_messages.count({
          where: { campaign_id: id, status: "queued" },
        }),
        prisma.whatsapp_campaign_messages.count({
          where: { campaign_id: id, status: "sent" },
        }),
        prisma.whatsapp_campaign_messages.count({
          where: { campaign_id: id, status: "failed" },
        }),
      ]);

      return json({
        ok: true,
        campaign: jsonSafe(campaign),
        template: jsonSafe(template),
        stats: {
          queued: queued || 0,
          sent: sent || 0,
          failed: failed || 0,
        },
      });
    }

    if (resource === "audience-resolve") {
      // Resolve the audience for campaign creation (campaigns/new). When tags
      // are supplied we match contacts whose tags overlap the supplied set;
      // otherwise return all contacts. This GATES campaign creation.
      const tagsParam = url.searchParams.get("tags") || "";
      const tags = tagsParam
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const data =
        tags.length > 0
          ? await prisma.whatsapp_contacts.findMany({
              where: { OR: tags.map((t) => ({ tags: { array_contains: t } })) },
              select: { id: true, phone_e164: true },
            })
          : await prisma.whatsapp_contacts.findMany({
              select: { id: true, phone_e164: true },
            });
      return json({ ok: true, contacts: jsonSafe(data ?? []) });
    }

    return json({ ok: false, error: "BAD_RESOURCE" }, 400);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
