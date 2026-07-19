// Client-safe business-identity types + default constants. This module has NO
// prisma / server-only import, so it is safe to import from client components
// (e.g. the contact page, which shows business/contact details). The
// Prisma-backed readers (getBusinessInfo / getBusinessProfile) live in
// lib/businessInfo.ts (server-only) and re-export these.

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
    countryCode: string | null;
    contactName: string | null;
    phone: string | null;
    whatsappNumber: string | null;
    supportEmail: string;
    businessHours: string;
    publicAddress: string | null;
  };
  marketplaceDisclosureEnabled: boolean;
};

// ---------- Default constants ----------

export const DEFAULT_PARTNER_ROLE = "Authorized Importer & Distribution Partner";
export const DEFAULT_SUPPORT_EMAIL = "info@bluderma.kr";
export const DEFAULT_BUSINESS_HOURS = "Mon-Fri 9AM - 6PM KST";

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
