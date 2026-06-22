export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin-only service-role READ endpoint for the WhatsApp marketing pages.
//
// These admin pages used to read whatsapp_* tables directly with the browser
// anon Supabase client. That only worked because RLS was OFF on those tables.
// To let us enable RLS (closing the anon-read leak) WITHOUT breaking the UI,
// every read is moved here behind requireAdmin + the service-role client.
// Writes already go through adminWrite (/api/admin/catalog/write) — untouched.
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

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const url = new URL(req.url);
  const resource = url.searchParams.get("resource") || "";
  const sb = admin();

  try {
    if (resource === "stats") {
      // Dashboard: aggregate counts + 5 most recent campaigns.
      const [
        contactsRes,
        templatesRes,
        campaignsCountRes,
        runningCampaignsRes,
        recentCampaignsRes,
      ] = await Promise.all([
        sb.from("whatsapp_contacts").select("id", { count: "exact", head: true }),
        sb
          .from("whatsapp_templates")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
        sb.from("whatsapp_campaigns").select("id", { count: "exact", head: true }),
        sb
          .from("whatsapp_campaigns")
          .select("id", { count: "exact", head: true })
          .eq("status", "running"),
        sb
          .from("whatsapp_campaigns")
          .select("id, name, status, total_target_count, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (recentCampaignsRes.error)
        return json({ ok: false, error: recentCampaignsRes.error.message }, 500);

      return json({
        ok: true,
        stats: {
          totalContacts: contactsRes.count ?? 0,
          activeTemplates: templatesRes.count ?? 0,
          totalCampaigns: campaignsCountRes.count ?? 0,
          runningCampaigns: runningCampaignsRes.count ?? 0,
        },
        recentCampaigns: recentCampaignsRes.data ?? [],
      });
    }

    if (resource === "contacts") {
      // Full contacts list (contacts page).
      const { data, error: e } = await sb
        .from("whatsapp_contacts")
        .select("*")
        .order("created_at", { ascending: false });
      if (e) return json({ ok: false, error: e.message }, 500);
      return json({ ok: true, contacts: data ?? [] });
    }

    if (resource === "templates") {
      // Templates list. activeOnly=1 mirrors the campaigns/new page read.
      const activeOnly = url.searchParams.get("activeOnly") === "1";
      const select = activeOnly
        ? "id, name, provider_template_name, category, language_code, body_preview"
        : "id, name, provider_template_name, category, language_code, body_preview, is_active, created_at";
      let q = sb.from("whatsapp_templates").select(select);
      if (activeOnly) q = q.eq("is_active", true);
      q = q.order("created_at", { ascending: false });
      const { data, error: e } = await q;
      if (e) return json({ ok: false, error: e.message }, 500);
      return json({ ok: true, templates: data ?? [] });
    }

    if (resource === "tags") {
      // Distinct tags across all contacts (campaigns/new audience picker).
      const { data, error: e } = await sb
        .from("whatsapp_contacts")
        .select("tags");
      if (e) return json({ ok: false, error: e.message }, 500);
      const set = new Set<string>();
      (data || []).forEach((c: any) => {
        (c.tags || []).forEach((t: string) => set.add(t));
      });
      return json({ ok: true, tags: Array.from(set).sort() });
    }

    if (resource === "campaigns") {
      // Campaigns list page.
      const { data, error: e } = await sb
        .from("whatsapp_campaigns")
        .select(
          "id, name, status, scheduled_at, started_at, completed_at, total_target_count, created_at"
        )
        .order("created_at", { ascending: false });
      if (e) return json({ ok: false, error: e.message }, 500);
      return json({ ok: true, campaigns: data ?? [] });
    }

    if (resource === "campaign") {
      // Single campaign detail page: campaign + its template + message stats.
      const id = url.searchParams.get("id") || "";
      if (!id) return json({ ok: false, error: "MISSING_ID" }, 400);

      const { data: campaign, error: campErr } = await sb
        .from("whatsapp_campaigns")
        .select(
          "id, name, status, template_id, scheduled_at, started_at, completed_at, total_target_count, created_at"
        )
        .eq("id", id)
        .single();
      if (campErr || !campaign)
        return json({ ok: false, error: campErr?.message || "NOT_FOUND" }, 404);

      let template: any = null;
      if (campaign.template_id) {
        const { data: tpl } = await sb
          .from("whatsapp_templates")
          .select("id, name, provider_template_name, language_code")
          .eq("id", campaign.template_id)
          .single();
        if (tpl) template = tpl;
      }

      const [queuedRes, sentRes, failedRes] = await Promise.all([
        sb
          .from("whatsapp_campaign_messages")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", id)
          .eq("status", "queued"),
        sb
          .from("whatsapp_campaign_messages")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", id)
          .eq("status", "sent"),
        sb
          .from("whatsapp_campaign_messages")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", id)
          .eq("status", "failed"),
      ]);

      return json({
        ok: true,
        campaign,
        template,
        stats: {
          queued: queuedRes.count || 0,
          sent: sentRes.count || 0,
          failed: failedRes.count || 0,
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

      let q = sb.from("whatsapp_contacts").select("id, phone_e164");
      if (tags.length > 0) q = q.overlaps("tags", tags);
      const { data, error: e } = await q;
      if (e) return json({ ok: false, error: e.message }, 500);
      return json({ ok: true, contacts: data ?? [] });
    }

    return json({ ok: false, error: "BAD_RESOURCE" }, 400);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
