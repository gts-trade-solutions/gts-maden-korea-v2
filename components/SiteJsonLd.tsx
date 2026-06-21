// Sitewide structured data — Organization + WebSite. Emitted once per
// page via `app/layout.tsx`. Two distinct schemas are bundled into a
// single `@graph` array so we render only one `<script>` tag.
//
//  - Organization (storefront, MadenKorea): tells Google who runs the
//    domain. Drives the Knowledge-panel + sitelinks + favicon SERP
//    treatment, and connects the domain to its social profiles via
//    `sameAs`.
//  - Optional Organization (brand): the brand owner, expressed as
//    `parentOrganization` of the storefront. Pulled live from
//    store_settings so the markup tracks admin changes.
//  - WebSite + SearchAction: makes Google eligible to render the
//    sitelinks search box for branded queries.
//
// Social URLs are hardcoded here to mirror what the footer renders. If
// the footer URLs change, update both.

import { getBusinessProfile } from "@/lib/businessInfo";

const SITE = "https://madenkorea.com";

export async function SiteJsonLd() {
  const profile = await getBusinessProfile().catch(() => null);

  const brandNode = profile?.brand.legalEntityName
    ? {
        "@type": "Organization",
        "@id": `${SITE}#brand`,
        name: profile.brand.legalEntityName,
        ...(profile.brand.email ? { email: profile.brand.email } : {}),
        ...(profile.brand.registeredAddress
          ? {
              address: {
                "@type": "PostalAddress",
                streetAddress: profile.brand.registeredAddress,
                ...(profile.brand.countryCode
                  ? { addressCountry: profile.brand.countryCode }
                  : {}),
              },
            }
          : {}),
      }
    : null;

  const storefrontPartnerName =
    profile?.partner.legalEntityName ?? null;

  const organization: any = {
    "@type": "Organization",
    "@id": `${SITE}#organization`,
    name: "MadenKorea",
    alternateName: "Maden Korea",
    url: SITE,
    logo: `${SITE}/logo-md.png`,
    // Social profiles — keep in sync with components/Footer.tsx.
    sameAs: [
      "https://www.facebook.com/profile.php?id=61582921345960",
      "https://www.instagram.com/madenkorea_/",
      "https://www.youtube.com/channel/UChrgxiWdyhQpt-RICbWjfbg",
      "https://www.threads.com/@madenkorea_",
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email:
          profile?.contact.supportEmail ?? "info@madenkorea.com",
        ...(profile?.contact.phone
          ? { telephone: profile.contact.phone }
          : { telephone: "+91-9384857587" }),
        availableLanguage: ["English", "Hindi"],
        areaServed: "IN",
      },
    ],
    ...(brandNode ? { parentOrganization: { "@id": `${SITE}#brand` } } : {}),
    ...(storefrontPartnerName
      ? {
          subOrganization: {
            "@type": "Organization",
            name: storefrontPartnerName,
            ...(profile?.partner.registeredAddress
              ? {
                  address: {
                    "@type": "PostalAddress",
                    streetAddress: profile.partner.registeredAddress,
                  },
                }
              : {}),
            ...(profile?.partner.gstin ? { taxID: profile.partner.gstin } : {}),
          },
        }
      : {}),
  };

  const website = {
    "@type": "WebSite",
    "@id": `${SITE}#website`,
    name: "MadenKorea",
    url: SITE,
    publisher: { "@id": `${SITE}#organization` },
    inLanguage: "en-IN",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      ...(brandNode ? [brandNode] : []),
      organization,
      website,
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Server-rendered, no user input — safe to inline as JSON. Use
      // dangerouslySetInnerHTML so React doesn't escape the curly
      // braces and break the JSON parser.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
