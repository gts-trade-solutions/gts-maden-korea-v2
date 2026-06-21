import { createClient } from "@supabase/supabase-js";

// NOTE: this module deliberately has NO `server-only` import. It's
// pulled into the server-rendered footer (which gets bundled as a
// client component when used inside CustomerLayout from a `'use client'`
// page like the PDP), so any server-only side effects in here would
// break compilation. The data we read is public-by-design (entity name,
// address, support contacts, GO details), so anon-key read is correct
// — no service role needed.
//
// Three-layer business identity (introduced 2026-05-25):
//   1. Brand company        — global. Korean parent. `store_settings.brand_*`.
//   2. Distribution partner — global. Indian importer/distributor. Existing
//      `store_settings` partner-side columns (legal_entity_name etc.).
//   3. Contact details      — PER COUNTRY. `country_contacts` rows override
//      the global defaults from `store_settings`. Falls back column-by-column.
//
// Two exports:
//   - `getBusinessInfo(country?)` returns the legacy flat shape. Phone /
//     email / hours fields are country-resolved automatically so existing
//     consumers (FAQ, Terms, Privacy, etc.) get country awareness for free.
//   - `getBusinessProfile(country?)` returns the structured `{ brand,
//     partner, contact }` shape. Use this on the Contact page, order email
//     and any new surface that needs the two-company split.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Stand-alone anon client. We don't import the project singleton from
// `lib/supabaseClient.ts` because that one persists sessions to
// localStorage and would noisy-warn in server contexts where there's no
// window object.
function client() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------- Types ----------

/** Backwards-compatible flat shape — kept for existing consumers. */
export type BusinessInfo = {
  legalEntityName: string | null;
  registeredAddress: string | null;
  publicPhone: string | null;
  supportEmail: string;
  businessHours: string;
  grievanceOfficerName: string | null;
  grievanceOfficerDesignation: string | null;
  grievanceOfficerEmail: string | null;
  gstin: string | null;
  cdscoRegistration: string | null;
  jurisdictionCity: string | null;
  marketplaceDisclosureEnabled: boolean;
};

/** Structured shape with brand / partner / contact separation. */
export type BusinessProfile = {
  brand: {
    legalEntityName: string | null;
    registeredAddress: string | null;
    countryCode: string | null;
    /** Public email for the brand company (manufacturer). Surfaced on
     *  the Contact page brand card. Optional — leave null to hide. */
    email: string | null;
  };
  partner: {
    roleLabel: string;
    legalEntityName: string | null;
    registeredAddress: string | null;
    gstin: string | null;
    cdscoRegistration: string | null;
    jurisdictionCity: string | null;
    grievanceOfficer: {
      name: string | null;
      designation: string | null;
      email: string | null;
    };
  };
  contact: {
    /** ISO-2 of the country this contact was resolved for, or null if no row matched. */
    countryCode: string | null;
    /** Optional human contact name (person or department) shown alongside
     *  the phone / email. Per-country only — no global default. */
    contactName: string | null;
    phone: string | null;
    whatsappNumber: string | null;
    supportEmail: string;
    businessHours: string;
    publicAddress: string | null;
  };
  marketplaceDisclosureEnabled: boolean;
};

const DEFAULT_PARTNER_ROLE = "Authorized Importer & Distribution Partner";
const DEFAULT_SUPPORT_EMAIL = "info@madenkorea.com";
const DEFAULT_BUSINESS_HOURS = "Mon-Fri 9AM - 6PM IST";

export const DEFAULT_BUSINESS_INFO: BusinessInfo = {
  legalEntityName: null,
  registeredAddress: null,
  publicPhone: null,
  supportEmail: DEFAULT_SUPPORT_EMAIL,
  businessHours: DEFAULT_BUSINESS_HOURS,
  grievanceOfficerName: null,
  grievanceOfficerDesignation: null,
  grievanceOfficerEmail: null,
  gstin: null,
  cdscoRegistration: null,
  jurisdictionCity: null,
  marketplaceDisclosureEnabled: false,
};

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  brand: { legalEntityName: null, registeredAddress: null, countryCode: null, email: null },
  partner: {
    roleLabel: DEFAULT_PARTNER_ROLE,
    legalEntityName: null,
    registeredAddress: null,
    gstin: null,
    cdscoRegistration: null,
    jurisdictionCity: null,
    grievanceOfficer: { name: null, designation: null, email: null },
  },
  contact: {
    countryCode: null,
    contactName: null,
    phone: null,
    whatsappNumber: null,
    supportEmail: DEFAULT_SUPPORT_EMAIL,
    businessHours: DEFAULT_BUSINESS_HOURS,
    publicAddress: null,
  },
  marketplaceDisclosureEnabled: false,
};

// Ultimate WhatsApp fallback when no `country_contacts.whatsapp_number`
// is set and the visitor's country has no override. Kept as an env var so
// the existing deployment continues to surface the +91 number without
// requiring an admin to populate the DB before this code ships.
const ENV_WHATSAPP_FALLBACK =
  process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER?.trim() || null;

// ---------- Cache ----------

type Snapshot = {
  store: any | null;
  contacts: Map<string, any>;
};

const CACHE_TTL_MS = 60 * 1000;
let cached: { value: Snapshot; expiresAt: number } | null = null;

async function loadSnapshot(): Promise<Snapshot> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  const empty: Snapshot = { store: null, contacts: new Map() };

  try {
    const sb = client();
    const [storeRes, contactsRes] = await Promise.all([
      sb
        .from("store_settings")
        .select(
          "legal_entity_name, registered_address, public_phone, support_email, business_hours, grievance_officer_name, grievance_officer_designation, grievance_officer_email, gstin, cdsco_registration, jurisdiction_city, marketplace_disclosure_enabled, brand_legal_entity_name, brand_registered_address, brand_country_code, brand_email, partner_role_label"
        )
        .eq("id", 1)
        .maybeSingle(),
      sb
        .from("country_contacts")
        .select(
          "country_code, contact_name, public_phone, whatsapp_number, support_email, business_hours, public_address, is_active"
        )
        .eq("is_active", true),
    ]);

    const snap: Snapshot = {
      store: storeRes.data ?? null,
      contacts: new Map(),
    };
    for (const row of contactsRes.data ?? []) {
      const code = (row as any).country_code;
      if (typeof code === "string" && code.length > 0) {
        snap.contacts.set(code.toUpperCase(), row);
      }
    }
    cached = { value: snap, expiresAt: now + CACHE_TTL_MS };
    return snap;
  } catch {
    cached = { value: empty, expiresAt: now + CACHE_TTL_MS };
    return empty;
  }
}

// First non-empty wins. Treats empty strings as missing so blank
// override columns fall through to the global default.
function firstNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return null;
}

// ---------- Resolvers ----------

export async function getBusinessInfo(country?: string): Promise<BusinessInfo> {
  const snap = await loadSnapshot();
  if (!snap.store) return DEFAULT_BUSINESS_INFO;
  const s = snap.store;
  const cc = country ? snap.contacts.get(country.toUpperCase()) ?? null : null;

  return {
    legalEntityName: (s.legal_entity_name as string | null) ?? null,
    registeredAddress: (s.registered_address as string | null) ?? null,
    publicPhone:
      firstNonEmpty(cc?.public_phone, s.public_phone as string | null) ?? null,
    supportEmail:
      firstNonEmpty(cc?.support_email, s.support_email as string | null) ??
      DEFAULT_SUPPORT_EMAIL,
    businessHours:
      firstNonEmpty(cc?.business_hours, s.business_hours as string | null) ??
      DEFAULT_BUSINESS_HOURS,
    grievanceOfficerName: (s.grievance_officer_name as string | null) ?? null,
    grievanceOfficerDesignation:
      (s.grievance_officer_designation as string | null) ?? null,
    grievanceOfficerEmail: (s.grievance_officer_email as string | null) ?? null,
    gstin: (s.gstin as string | null) ?? null,
    cdscoRegistration: (s.cdsco_registration as string | null) ?? null,
    jurisdictionCity: (s.jurisdiction_city as string | null) ?? null,
    marketplaceDisclosureEnabled:
      (s.marketplace_disclosure_enabled as boolean | null) ?? false,
  };
}

export async function getBusinessProfile(
  country?: string
): Promise<BusinessProfile> {
  const snap = await loadSnapshot();
  if (!snap.store) return DEFAULT_BUSINESS_PROFILE;
  const s = snap.store;
  const upperCountry = country ? country.toUpperCase() : null;
  const cc = upperCountry ? snap.contacts.get(upperCountry) ?? null : null;

  return {
    brand: {
      legalEntityName: (s.brand_legal_entity_name as string | null) ?? null,
      registeredAddress: (s.brand_registered_address as string | null) ?? null,
      countryCode: (s.brand_country_code as string | null) ?? null,
      email: firstNonEmpty(s.brand_email as string | null),
    },
    partner: {
      roleLabel:
        firstNonEmpty(s.partner_role_label as string | null) ??
        DEFAULT_PARTNER_ROLE,
      legalEntityName: (s.legal_entity_name as string | null) ?? null,
      registeredAddress: (s.registered_address as string | null) ?? null,
      gstin: (s.gstin as string | null) ?? null,
      cdscoRegistration: (s.cdsco_registration as string | null) ?? null,
      jurisdictionCity: (s.jurisdiction_city as string | null) ?? null,
      grievanceOfficer: {
        name: (s.grievance_officer_name as string | null) ?? null,
        designation: (s.grievance_officer_designation as string | null) ?? null,
        email: (s.grievance_officer_email as string | null) ?? null,
      },
    },
    contact: {
      countryCode: cc ? upperCountry : null,
      contactName: firstNonEmpty(cc?.contact_name),
      phone:
        firstNonEmpty(cc?.public_phone, s.public_phone as string | null),
      whatsappNumber:
        firstNonEmpty(cc?.whatsapp_number, ENV_WHATSAPP_FALLBACK),
      supportEmail:
        firstNonEmpty(cc?.support_email, s.support_email as string | null) ??
        DEFAULT_SUPPORT_EMAIL,
      businessHours:
        firstNonEmpty(cc?.business_hours, s.business_hours as string | null) ??
        DEFAULT_BUSINESS_HOURS,
      publicAddress: firstNonEmpty(cc?.public_address),
    },
    marketplaceDisclosureEnabled:
      (s.marketplace_disclosure_enabled as boolean | null) ?? false,
  };
}

/** All configured country_contacts rows (admin-facing). Cached alongside
 *  the main snapshot so we don't make a separate round-trip when the
 *  admin form loads. */
export async function listCountryContacts(): Promise<
  Array<{
    countryCode: string;
    contactName: string | null;
    publicPhone: string | null;
    whatsappNumber: string | null;
    supportEmail: string | null;
    businessHours: string | null;
    publicAddress: string | null;
    isActive: boolean;
  }>
> {
  const snap = await loadSnapshot();
  const out = Array.from(snap.contacts.values()).map((r: any) => ({
    countryCode: String(r.country_code).toUpperCase(),
    contactName: (r.contact_name as string | null) ?? null,
    publicPhone: (r.public_phone as string | null) ?? null,
    whatsappNumber: (r.whatsapp_number as string | null) ?? null,
    supportEmail: (r.support_email as string | null) ?? null,
    businessHours: (r.business_hours as string | null) ?? null,
    publicAddress: (r.public_address as string | null) ?? null,
    isActive: (r.is_active as boolean | null) ?? false,
  }));
  out.sort((a, b) => a.countryCode.localeCompare(b.countryCode));
  return out;
}

export function bustBusinessInfoCache() {
  cached = null;
}
