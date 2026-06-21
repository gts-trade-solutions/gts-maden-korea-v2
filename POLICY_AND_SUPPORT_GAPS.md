# Policy & Support Audit — Gap Register

**Last reviewed:** 2026-05-07
**Scope:** customer-facing documentation pages (privacy, terms, about, contact, shipping/returns), support touchpoints (contact form, WhatsApp, phone, email), and product-page disclosures.
**Compared against:** Indian e-commerce legal framework (Consumer Protection (E-Commerce) Rules 2020, DPDP Act 2023, Legal Metrology Rules 2011, Cosmetics Rules 2020) and major cosmetic e-commerce sites (Nykaa, Sephora India, Stylevana, YesStyle, Soko Glam, Glow Recipe).

---

## 1. Executive summary

The site has the **basics** in place (Privacy, Terms, About, Contact, Shipping & Returns). But several pages are stubs with generic copy, dates and email addresses are inconsistent across pages, **multiple legally-required disclosures for an Indian cosmetic e-commerce site are missing**, and customer support has no FAQ, help center, ticketing reference, live chat, guest order tracking, or self-serve return flow. Cosmetics-specific safety disclaimers (patch test, pregnancy advisory) are entirely absent on product pages.

The single highest-risk items are:

- No **Grievance Officer** disclosure (Consumer Protection Act 2019 — required).
- No **Cookie Consent banner** (DPDP Act 2023 + GDPR exposure for EU traffic).
- No standalone **Cancellation Policy** or **Refund Policy** page (E-Commerce Rules 2020 — required).
- No **GST invoice** download on orders.
- Phone number and physical address are **env-gated** and currently invisible on the live site.

---

## 2. Inventory of what exists today

| Page | Path | State |
|---|---|---|
| About Us | `/about` | Generic values + brand copy. Acceptable. |
| Contact Us | `/contact` | Form posts to `/api/contact`. Email + business hours visible. **Phone & address env-gated and currently hidden.** |
| Privacy Policy | `/privacy` | GDPR-flavored. Last updated **2026-04-20**. Phone/address are commented out in source. |
| Terms & Conditions | `/terms` | 12 short cards. Last updated **2025-10-09** (out of sync with Privacy). |
| Shipping, Returns & Trust | `/policies/shipping-returns` | Newer; reads `delivery_threshold` and `default_shipping_fee` dynamically from `store_settings`. The strongest of the policy pages. |
| Facebook Data Deletion | `/legal/facebook-data-deletion` | Stub for Meta integration requirement. |
| Footer support links | (in `Footer.tsx`) | Contact, About, Shipping & Returns, Privacy, Terms. **No** FAQ / Cancellation / Refund / Cookie Policy. |
| Customer support touchpoints | Contact form → email | Floating WhatsApp button. Env-gated phone. **No** live chat, FAQ, help center, public order-tracking page, ticket reference system, self-serve return UI. |

---

## 3. Gap register — grouped by category

### A. Legal / regulatory compliance (India + general)

| ID | Issue | Why it matters | Status |
|---|---|---|---|
| A1 | **Cancellation Policy** as its own page | Required by Consumer Protection (E-Commerce) Rules 2020. Must cover before-dispatch and post-dispatch scenarios, COD-specific rules, refund timelines. | **DONE 2026-05-07** &mdash; live at `/policies/cancellation`; linked from footer; Terms §7 updated to point at it. |
| A2 | **Refund Policy** standalone page | Currently buried inside Terms §7 and the shipping page. Should be a top-level URL like `/policies/refunds` with explicit timelines, methods, partial-refund cases. | **DONE 2026-05-07** &mdash; live at `/policies/refunds`, footer-linked, cross-references Cancellation and Shipping & Returns. |
| A3 | **Replacement / Exchange Policy** | The shipping page implies returns; nothing distinguishes refund vs exchange-for-replacement. Cosmetics often need this distinction. | **DONE 2026-05-07** &mdash; live at `/policies/replacements`. Replacements only (no exchanges) per business decision. |
| A4 | **Cookie Consent banner + Cookie Policy** | Privacy mentions cookies in one paragraph. No consent banner, no per-category opt-in (necessary / analytics / marketing), no cookie list. DPDP Act 2023 and GDPR (for EU visitors) both expect this. | **DONE 2026-05-07** &mdash; `CookieConsentProvider` + bottom-anchored banner with Accept all / Reject all / Customize, four-category preference dialog, `/policies/cookies` listing, "Manage cookies" link in footer. GA scripts are gated on consent (no requests until opted in). First-party event tracking gated on `profiles.tracking_consent` which the banner now syncs to for logged-in users. |
| A5 | **DPDP Act 2023 (India) compliance** | Privacy is GDPR-shaped. India's DPDP Act adds obligations: named **Data Fiduciary**, **Grievance Officer** (name, designation, email, response timeline), **Right to Nominate**, cross-border processor disclosures (Razorpay, AWS SES, Supabase, Meta), notices in English + an Indian language. | **DONE 2026-05-07** &mdash; Privacy page rewritten DPDP-aligned: Data Fiduciary block, processor table with jurisdictions (Supabase US / Razorpay India / AWS SES US / DTDC India / Meta US-Ireland / GA US / OpenAI US), 14 sections covering retention, rights (incl. Right to Nominate), children's data, breach notification, languages clause. Reads dynamic business info; admin fills in via Settings → Business tab. |
| A6 | **Grievance Redressal Officer** disclosure | **Consumer Protection (E-Commerce) Rules 2020, Rule 4(5)** explicitly requires every e-commerce entity to display the Grievance Officer's name, contact details, and timelines for handling complaints. The same officer must acknowledge a complaint within 48 hours and resolve it within one month. Where Indian sites place it varies (footer / Privacy / dedicated `/grievance` page / Help Center) — what's required is that it's findable and current. | **DONE 2026-05-07** &mdash; named GO block in Privacy §9, dynamic GO chip in footer (visible on every page), 48hr/1mo timelines stated. Admin populates name/designation/email via Settings → Business tab. Falls back to support email when fields are empty so the footer never shows placeholders. |
| A7 | **Returns of opened cosmetics + hygiene exception** is contradictory | Terms §7: "unopened and unused" with 7-day window. Shipping page: 7 days for damaged / defective / wrong items + hygiene exception for opened skincare. Two pages disagree. | **DONE 2026-05-07** &mdash; Terms §7 retitled "Cancellations, Returns and Refunds" and now defers to `/policies/cancellation` + `/policies/shipping-returns` as canonical sources; the new Refund/Replacement pages are consistent with both. |
| A8 | **"Last updated" dates inconsistent** | Privacy 2026-04-20 vs Terms 2025-10-09. Pick one cadence and rev together. | **DONE 2026-05-07** &mdash; all policy pages now stamped May 7, 2026. |
| A9 | **Email address inconsistent** | Privacy uses `info@`, Terms uses `support@`, Contact uses `info@`. Pick one. | **DONE 2026-05-07** &mdash; standardised on `info@madenkorea.com` across all customer-facing pages, email templates (~17 files), `lib/businessInfo.ts` default, and the `store_settings.support_email` DB row. Admin can override via Settings → Business tab; Privacy + Refund + Replacement read it dynamically from `getBusinessInfo()`. (Earlier this was set to `support@`; reverted to `info@` per business preference.) |
| A10 | **Force Majeure clause** absent in Terms | Courier strikes, weather, civil unrest, pandemic. Standard clause. | **DONE 2026-05-07** &mdash; new Terms §10 covering acts of God, war, civil unrest, public-health emergencies, courier strikes, utility/internet outages, customs delays. Pre-suit mediation clause added to §11 (Governing Law) per Mediation Act 2023. |
| A11 | **Dispute resolution / jurisdiction** under-specified | Terms §10 says "courts in India" without naming a city. Should specify (Chennai, given Tamil Nadu base) and offer pre-suit **mediation** under Mediation Act 2023. | **DONE 2026-05-07** &mdash; Terms §11 now reads dynamic `business.jurisdictionCity` from Settings → Business; pre-suit mediation clause already added under A10. Page converted to async server component. |
| A12 | **Account Termination & Data Retention** | What happens when a customer deletes their account? How long are billing records kept (GST: 7 years)? Currently absent. | **DONE 2026-05-07** &mdash; Privacy §6 expanded with retention-by-category list and account-deletion process (email-request, 48-hr ack, 30-day completion, what's deleted vs kept, fraud-investigation carve-out). Terms §8.1 ("Account termination") added covering termination by user and by us. Self-serve UI deferred to a follow-up. |
| A13 | **Children / age policy** | Privacy doesn't mention. Cosmetics are sometimes purchased by minors; need minimum-age statement or parental-consent clause. | **DONE 2026-05-07** &mdash; covered in Privacy §8 ("Children's data") during the DPDP rewrite. 18+ minimum, parental-consent requirement, deletion-on-request flow. |
| A14 | **SPDI Rules 2011 specific language** | IT (Reasonable Security Practices) Rules 2011 still apply alongside DPDP. Specific clauses required around encryption, breach notification. | **DONE 2026-05-07** &mdash; covered in Privacy §10 ("Security"): explicit reference to "IT (Reasonable Security Practices) Rules, 2011 and the DPDP Act", plus encryption-in-transit, encryption-at-rest, role-based access, breach notification to the Data Protection Board. |
| A15 | **Counterfeit / Authenticity Guarantee — formal terms** | The site promises authenticity but no contractual remedy stated (full refund + return shipping paid for counterfeit claims, named arbiter). | **DONE 2026-05-07** &mdash; formal block on `/policies/shipping-returns#authentic-products`: full refund + return-shipping reimbursed + replacement at our cost for counterfeit / tampered / expired-on-arrival products. 14-business-day resolution. Grievance Officer named as arbiter for unresolved claims (dynamic from Settings → Business). |
| A16 | **Marketplace / Vendor disclosure** | If vendors sell through MadenKorea (vendor role exists in DB), Indian rules require vendor's legal name, address, GSTIN displayed on each product page. | **DONE 2026-05-07** &mdash; new public view `vendors_public` exposes only the public-disclosure columns of approved vendors (legal_name, GSTIN, address, email, phone). PDP fetches it when `products.vendor_id` is set and renders a "Sold by" disclosure card next to the trust chips. Card auto-hides for first-party products. |
| A17 | **GST invoice availability** | Customers should be able to download a GST-compliant invoice with your GSTIN, HSN code, place of supply. Critical for B2B and many B2C buyers. Invoice template exists per CLAUDE.md but not exposed to customers as a downloadable per-order link. | Partially built |
| A18 | **Cosmetics-specific disclosures** | For imported cosmetics, **CDSCO registration number** under Cosmetics Rules 2020 should be displayed on PDP or in policy. | Missing |

### B. Product-page disclosures (Legal Metrology Rules 2011)

For every packaged commodity sold online, the rules require **prominent display** of:

| ID | Issue | Status |
|---|---|---|
| B1 | **Country of Origin** prominently visible | DB field `country_of_origin` exists; verify it's shown above the fold on the PDP, not inside an accordion tab. |
| B2 | **Manufacturer / Importer / Marketer name + complete address** | Currently absent on PDP. |
| B3 | **MRP label** (vs sale price) | `compare_at_price` is used as strikethrough; needs to be explicitly labelled "MRP" with the disclosure that selling above MRP is illegal. |
| B4 | **Net quantity** | DB has `volume_ml` and `net_weight_g`; verify visible. |
| B5 | **Best before / Mfg date / Batch number** | Not in DB. Add columns and admin field. |
| B6 | **Customer care email + phone** for the product | Should be on PDP, separate from your generic support. |
| B7 | **Ingredients list visibility** | `ingredients_md` is in a collapsed accordion. For cosmetics, ingredients are a regulated disclosure; consider always-open or above-the-fold. |

### C. Customer support gaps

| ID | Issue | Severity |
|---|---|---|
| C1 | **No FAQ / Help Center** | Major K-beauty competitors (Stylevana, YesStyle, Nykaa, Sephora India) all have 30+ categorized articles. Yours has zero. **DONE 2026-05-07** &mdash; live at `/faq`: 4 categories (Orders & Shipping, Returns & Refunds, Payments, Account), 15 Q&A items in shadcn accordions, dynamic content (free-shipping threshold, support email, business hours from `getBusinessInfo` / `getShippingConfig`), cross-links to all relevant policy pages, "Still need help?" CTA at the bottom. Footer-linked. Static page for now; can grow into an admin-editable knowledge base later. |
| C2 | **No order tracking page for guests** | `/account/orders` is account-gated; guest checkouts can't track their order without re-logging in. |
| C3 | **No self-serve return / replacement initiation UI** | Return policy says "email" or "go to Account → Orders". No "Request Return" button per order line opening a guided form (reason, photos, decision: refund vs replacement). |
| C4 | **No ticket reference / auto-acknowledgement** | Contact form returns a toast and silently emails support. Customers should get an auto-reply with a ticket number. |
| C5 | **No live chat** | Floating WhatsApp button exists but no real-time web chat (Intercom, Tawk.to, Tidio, Crisp free tier). |
| C6 | **Phone number env-gated** | Currently invisible on the live site. Major sites publish a number prominently. |
| C7 | **No physical address visible** | Required for legal compliance and trust. Must be in footer per Indian e-commerce rules. |
| C8 | **No multilingual support** | Hindi alongside English would be a major trust upgrade for India. None present. |
| C9 | **No accessibility statement** | Sephora, Ulta, Nykaa all publish one. Required for ADA-style claims (and increasingly for India). |
| C10 | **No newsletter compliance text** | Footer has a newsletter input; under it should be: *"By subscribing you agree to receive marketing emails from MadenKorea. Unsubscribe anytime."* + double-opt-in flow. |
| C11 | **Business hours have no holiday list / out-of-hours auto-responder** | Stated as "Mon-Fri 9AM–6PM IST" — but customers don't know what happens off-hours. |

### D. Trust / authenticity / safety

| ID | Issue | Status |
|---|---|---|
| D1 | **Skin allergy / patch test disclaimer** | Industry-standard convention for cosmetics on every PDP. Currently absent. |
| D2 | **Pregnancy / medical advisory** | For retinol, AHAs, BHAs, salicylic, hydroquinone products: "Consult a dermatologist if pregnant or breastfeeding." Industry-standard. Currently absent. |
| D3 | **Brand-partnership / authorized-retailer badges** | Authenticity is claimed in copy but no visual proof (brand-partnership / authorized-distributor logos, certificates). |
| D4 | **Customer reviews — third-party verification** | Trustpilot, Google Reviews, or REVIEWS.io badge in footer. Currently absent. |
| D5 | **Q&A on PDP** | Separate from reviews; "Ask a question about this product" section. Major K-beauty sites all have it. |
| D6 | **Skincare concern / quiz / ingredient glossary** | Glow Recipe, Soko Glam, Sephora all have one. Discovery + trust signal. Currently absent. |
| D7 | **Sustainability / packaging notice** | Increasingly expected; even a one-paragraph "we recycle / our packaging" is a starting point. Currently absent. |

### E. Documentation hygiene

| ID | Issue | Status |
|---|---|---|
| E1 | **Single source of truth for shipping / refund numbers** | Shipping page reads `store_settings` dynamically. Terms has its own static text ("dispatch within 2-3 business days", "7-10 business days for refunds") that won't auto-update. Either dynamic-fetch on Terms or eliminate the duplicate copy. |
| E2 | **No version control on policies** | When a policy changes, customers should be notified (banner, email). DPDP Act requires re-consent on material changes. |
| E3 | **No printable / PDF download of Terms / Privacy** | Some B2B customers and corporate buyers want this. |
| E4 | **No `/security.txt`** | Sephora-tier sites have a vulnerability-disclosure file. Not required but standard. |
| E5 | **Footer is missing entries** | Should include: FAQ, Cancellation, Refund, Cookie Policy, Grievance Officer. |

---

## 4. Prioritized implementation list

### P0 — Ship within a week (legal exposure or trust killer)

1. ~~**Grievance Officer** disclosure (name + email + designation) on Privacy page and footer. (A6)~~ &mdash; **DONE 2026-05-07**. Admin populates via Settings → Business tab.
2. ~~**Cancellation Policy** standalone page. (A1)~~ &mdash; **DONE 2026-05-07**.
3. ~~**Refund Policy** standalone page. (A2)~~ &mdash; **DONE 2026-05-07**.
4. ~~**Cookie Consent banner** + **Cookie Policy** page. (A4)~~ &mdash; **DONE 2026-05-07**.
5. ~~**DPDP-aligned Privacy rewrite**. (A5)~~ &mdash; **DONE 2026-05-07**.
6. **Make phone number and physical address visible** (now editable via Settings → Business tab; will appear automatically once admin fills them in). (C6, C7) &mdash; **WIRED 2026-05-07**, awaiting business data.
7. ~~**Reconcile email addresses and policy update dates.** (A8, A9)~~ &mdash; **DONE 2026-05-07** (`support@` standardised; all dates aligned).
8. **GST invoice download** for paid orders. GSTIN field added to Settings → Business; download UI on `/account/orders` is the remaining piece. (A17)
9. ~~**Resolve the Terms §7 vs Shipping page contradiction.** (A7)~~ &mdash; **DONE 2026-05-07**.
10. **PDP Legal-Metrology disclosure block**: visible MRP label, country of origin, importer/marketer name+address, batch/MFD/best-before fields. (B1, B2, B3, B5)

### P1 — Ship within a month

11. **FAQ / Help Center** with 25–40 articles in 4–6 categories (Orders, Shipping, Returns, Payments, Account, Product Concerns). (C1)
12. **Self-serve "Request Return / Replacement" flow** per order in `/account/orders`. (C3)
13. **Guest order tracking** page with order number + email lookup (no login required). (C2)
14. **Auto-acknowledgement email** with ticket reference for contact form. (C4)
15. ~~**Replacement / Exchange Policy** page. (A3)~~ &mdash; **DONE 2026-05-07** (replacements only).
16. **Skin allergy / patch-test disclaimer** + **pregnancy advisory** as a small block on every PDP. (D1, D2)
17. **Newsletter compliance text** + double opt-in. (C10)
18. **Vendor / Marketplace disclosure** on PDP for vendor-supplied products (legal name, address, GSTIN). (A16)
19. **Authenticity Guarantee — formal terms** (full refund + return-shipping covered for counterfeit claims, named arbiter). (A15)
20. **Live chat** (Tawk.to free tier as a low-friction start; upgrade to Intercom later). (C5)
21. **Footer polish** — add FAQ, Cancellation, Refund, Cookie, Grievance Officer links. (E5)

### P2 — Nice-to-have within a quarter

22. **Accessibility statement** + WCAG 2.1 AA pass on the storefront. (C9)
23. **Hindi translation** of policy pages (start with Privacy + Terms + Shipping + Refund). (C8)
24. **Q&A section** on each PDP. (D5)
25. **Skin-concern quiz / ingredient glossary** (Glow Recipe / Soko Glam style). (D6)
26. **Sustainability statement** (one-pager). (D7)
27. **Trustpilot / Google Reviews** integration in footer. (D4)
28. **PDF download** of Privacy / Terms / Refund. (E3)
29. **`/security.txt`** for responsible disclosure. (E4)
30. ~~**Force Majeure clause** in Terms. (A10)~~ &mdash; **DONE 2026-05-07** (Terms §10).
31. **Dispute resolution clarification** — name Chennai jurisdiction + pre-suit mediation. (A11)
32. **Account termination / data-retention** clause in Privacy. (A12)
33. **Age / children clause** in Privacy. (A13)
34. **SPDI Rules language** in Privacy. (A14)
35. **CDSCO registration number** display on imported-cosmetic PDPs. (A18)
36. **Brand-partnership badges** on the storefront. (D3)
37. **Customer-care email + phone block** on every PDP. (B6)
38. **Ingredients always-visible** on PDP (currently in collapsed accordion). (B7)
39. **Holiday list + out-of-hours auto-responder** on Contact. (C11)
40. **Single-source-of-truth fix** for shipping/refund numbers in Terms. (E1)
41. **Policy version-control + change notification flow.** (E2)

---

## 5. Reference points from competitor sites

> **Note on this section:** the bullets below describe broad patterns I have seen on competitor sites historically. They have **not** been re-verified against each site's current live state during this audit. Use them as directional inspiration, not as feature-by-feature claims about any specific competitor today.

- **Nykaa** — separate Cancellation, Refund/Return, and Shipping pages; GST-compliant invoices; Hindi storefront; COD and EMI terms typically called out as their own surfaces.
- **Stylevana** — large categorized FAQ / Help Center; multi-language storefront; explicit per-product disclosure block (Country of Origin, ingredients) on every PDP.
- **YesStyle** — guest order tracking by order number + email; refund-status page; per-region customer-care hours; return-label generator.
- **Sephora India** — formal Authenticity Guarantee; step-by-step return-process page; Skin Concern landing pages; structured help center.
- **Soko Glam / Glow Recipe** — ingredient glossary; skincare-concern quiz; expert blog; named customer-care contact.

The recommendations in this audit are anchored to **Indian regulation** (Consumer Protection (E-Commerce) Rules 2020, DPDP Act 2023, Legal Metrology Rules 2011, Cosmetics Rules 2020) — not to the presence of a feature on any one competitor.

---

## 6. How to use this doc

- This is a **gap register**, not a plan. Items here become tickets, not direct work.
- When an item ships, mark it **DONE** with the date and PR/commit reference. Don't delete; the audit trail matters for compliance review.
- Re-run the audit every quarter, or whenever a policy is updated, or whenever Indian e-commerce / DPDP regulations change.
- Cross-reference with `ISSUE_REGISTER.md` (technical issues) and `CODEBASE_REFERENCE.md` (live code map). This file is the **content / policy / support** angle.
- The P0 list closes the biggest legal exposure with relatively small engineering effort. The P1 list builds the "trustworthy beauty store" experience competitors already have. P2 is upmarket polish.

---

## 7. Open questions for the business

Before executing on the P0 list, the following decisions need to come from product/legal:

1. Who is the **Grievance Officer**? (Name + email.)
2. What is the **registered office address** to publish?
3. What is the **public phone number**?
4. Is MadenKorea registered as a marketplace (selling third-party products) or only as a direct seller? Affects vendor-disclosure requirements.
5. Do you have a **GSTIN** to display on invoices?
6. Are imported cosmetics **CDSCO-registered**? (Per-product registration number list.)
7. What is the **legal name** of the entity (sole prop / private ltd / etc.) for inclusion in policy pages?
8. Are you operating in the **EU / UK** (any traffic from there)? Affects GDPR scope and cookie consent requirements.

Until these are answered, the P0 work can start drafting templates with `[PLACEHOLDER]` markers, but cannot go live.
