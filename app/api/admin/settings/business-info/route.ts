export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { bustBusinessInfoCache, getBusinessInfo } from "@/lib/businessInfo";
import { requireAdmin } from "@/lib/auth/adminGuard";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const supabase = createAdminClient();
  // Legacy flat shape consumed by the existing settings page state. Brand
  // + partner_role_label come from the raw store_settings row so the admin
  // form can edit them — they're not part of the BusinessInfo type today.
  const info = await getBusinessInfo();
  const { data: raw } = await supabase
    .from("store_settings")
    .select(
      "brand_legal_entity_name, brand_registered_address, brand_country_code, brand_email, partner_role_label"
    )
    .eq("id", 1)
    .maybeSingle();
  const brand = {
    brandLegalEntityName: (raw?.brand_legal_entity_name as string | null) ?? null,
    brandRegisteredAddress:
      (raw?.brand_registered_address as string | null) ?? null,
    brandCountryCode: (raw?.brand_country_code as string | null) ?? null,
    brandEmail: (raw?.brand_email as string | null) ?? null,
    partnerRoleLabel:
      (raw?.partner_role_label as string | null) ??
      "Authorized Importer & Distribution Partner",
  };
  return json({ ok: true, info: { ...info, ...brand } });
}

// Trim a string field to null when empty so the DB stores meaningful data
// only — empty input shouldn't shadow the row with empty strings.
function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function POST(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));

  const update: Record<string, any> = {
    legal_entity_name: clean(body.legalEntityName),
    registered_address: clean(body.registeredAddress),
    public_phone: clean(body.publicPhone),
    support_email: clean(body.supportEmail),
    business_hours: clean(body.businessHours),
    grievance_officer_name: clean(body.grievanceOfficerName),
    grievance_officer_designation: clean(body.grievanceOfficerDesignation),
    grievance_officer_email: clean(body.grievanceOfficerEmail),
    gstin: clean(body.gstin),
    cdsco_registration: clean(body.cdscoRegistration),
    jurisdiction_city: clean(body.jurisdictionCity),
    marketplace_disclosure_enabled: !!body.marketplaceDisclosureEnabled,
    updated_at: new Date().toISOString(),
    updated_by: user!.id,
  };

  // Brand-side fields are optional in the payload — only update them when
  // the admin form submits them. The brand role label is always present
  // because it has a non-null DB default, but we still allow a blank
  // submission to reset to the default.
  if ("brandLegalEntityName" in body)
    update.brand_legal_entity_name = clean(body.brandLegalEntityName);
  if ("brandRegisteredAddress" in body)
    update.brand_registered_address = clean(body.brandRegisteredAddress);
  if ("brandCountryCode" in body)
    update.brand_country_code = clean(body.brandCountryCode);
  if ("brandEmail" in body) update.brand_email = clean(body.brandEmail);
  if ("partnerRoleLabel" in body) {
    const v = clean(body.partnerRoleLabel);
    update.partner_role_label =
      v ?? "Authorized Importer & Distribution Partner";
  }

  const { error: upErr } = await supabase
    .from("store_settings")
    .update(update)
    .eq("id", 1);
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  bustBusinessInfoCache();

  const fresh = await getBusinessInfo();
  return json({ ok: true, info: fresh });
}
