import type { Metadata } from "next";
import Link from "next/link";
import { Cookie, Settings, ShieldCheck, ListChecks } from "lucide-react";
import { CustomerLayout } from "@/components/CustomerLayout";
import { PolicyHero } from "@/components/PolicyHero";
import {
  PolicyShell,
  PolicyQuickJump,
  PolicySection,
  PolicyDivider,
  PolicyCta,
  PolicyMeta,
  type TocItem,
} from "@/components/PolicyLayout";
import { ManageCookiesButton } from "@/components/ManageCookiesButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cookie Policy | MadenKorea",
  description:
    "Which cookies MadenKorea sets, what each one does, how long it lasts, and how to manage your preferences.",
  alternates: { canonical: "https://madenkorea.com/policies/cookies" },
  robots: { index: true, follow: true },
};

type CookieRow = {
  name: string;
  category: "Necessary" | "Functional" | "Analytics" | "Marketing";
  purpose: string;
  duration: string;
  thirdParty?: string;
};

const COOKIES: CookieRow[] = [
  { name: "sb-*-auth-token", category: "Necessary", purpose: "Keeps you signed in.", duration: "Until sign-out (or 30 days idle)", thirdParty: "Supabase Auth" },
  { name: "guest_cart_v1", category: "Necessary", purpose: "Stores your cart contents while you shop without an account.", duration: "Until cleared (LocalStorage)" },
  { name: "mik_anon_id", category: "Necessary", purpose: "Anonymous ID used to keep cart and session continuity across pages.", duration: "13 months" },
  { name: "mik_session_id", category: "Necessary", purpose: "Identifies your current visit for cart and checkout flows.", duration: "30 minutes of inactivity" },
  { name: "mik_cookie_consent_v1", category: "Necessary", purpose: "Records your cookie-banner choices so we don't ask again.", duration: "12 months" },
  { name: "madenkorea-theme", category: "Functional", purpose: "Remembers your colour-scheme preference.", duration: "Until cleared (LocalStorage)" },
  { name: "_ga, _ga_*", category: "Analytics", purpose: "Anonymous usage statistics — page views, traffic sources, bounce rate.", duration: "2 years", thirdParty: "Google Analytics 4" },
  { name: "events table (first-party)", category: "Analytics", purpose: "Our own event log — page views, add-to-cart, purchases.", duration: "Server-side row, kept 24 months" },
  { name: "fbp / fbc", category: "Marketing", purpose: "Used by Meta (Facebook/Instagram) to measure ad performance and attribute conversions.", duration: "90 days", thirdParty: "Meta Platforms" },
];

const TOC: TocItem[] = [
  { id: "what", label: "What are cookies?" },
  { id: "categories", label: "The four categories" },
  { id: "list", label: "Full cookie list" },
  { id: "manage", label: "Managing preferences" },
];

export default function CookiePolicyPage() {
  const grouped: Record<CookieRow["category"], CookieRow[]> = {
    Necessary: [],
    Functional: [],
    Analytics: [],
    Marketing: [],
  };
  for (const c of COOKIES) grouped[c.category].push(c);

  return (
    <CustomerLayout>
      <PolicyHero
        eyebrow="Privacy"
        title="Cookie Policy"
        description="What we mean by “cookies”, what each cookie or tracker on this site does, and how to change your mind any time."
      />

      <PolicyShell toc={TOC}>
        <PolicyMeta updated="May 7, 2026" readingTime="3 min read" />
        <PolicyQuickJump items={TOC} />

        <PolicySection id="what" icon={Cookie} title="What are cookies?">
          <p>
            Cookies are small text files saved on your device when you visit a
            website. They let the site remember things between page loads or
            visits &mdash; like that you&apos;re signed in, what&apos;s in
            your cart, or what theme you prefer.
          </p>
          <p>
            We also use other browser-storage mechanisms with the same
            practical purpose &mdash; <strong>localStorage</strong> and{" "}
            <strong>sessionStorage</strong> &mdash; and we treat them as
            cookies for the purposes of this policy. Some
            &ldquo;cookies&rdquo; below are technically localStorage entries.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="categories"
          icon={ShieldCheck}
          title="The four categories we use"
        >
          <ul>
            <li>
              <strong>Necessary.</strong> The site can&apos;t work without
              these. Sign-in tokens, cart contents, security IDs. Always on.
              You can&apos;t disable these and still use the site.
            </li>
            <li>
              <strong>Functional.</strong> Comfort features that don&apos;t
              identify you &mdash; like remembering your delivery pincode or
              your theme preference. You can disable these.
            </li>
            <li>
              <strong>Analytics.</strong> Anonymous statistics that help us
              understand how the site is being used (page views, traffic
              sources, bounce rate). Includes Google Analytics 4 and our own
              first-party event log.
            </li>
            <li>
              <strong>Marketing.</strong> Used by Meta (Facebook / Instagram)
              and similar platforms to measure how our ads are performing and
              to show you more relevant ads on those platforms. Off until you
              opt in.
            </li>
          </ul>
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="list" icon={ListChecks} title="The full list">
          {(["Necessary", "Functional", "Analytics", "Marketing"] as const).map(
            (cat) =>
              grouped[cat].length > 0 && (
                <div key={cat} className="not-prose mb-8 last:mb-0">
                  <h3 className="text-base font-semibold mb-3">{cat}</h3>
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-sm border rounded-lg overflow-hidden">
                      <thead className="bg-muted text-left">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Name</th>
                          <th className="px-4 py-2.5 font-medium">Purpose</th>
                          <th className="px-4 py-2.5 font-medium">Duration</th>
                          <th className="px-4 py-2.5 font-medium">Third party</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {grouped[cat].map((c) => (
                          <tr key={c.name}>
                            <td className="px-4 py-2.5 font-mono text-xs">
                              {c.name}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {c.purpose}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                              {c.duration}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {c.thirdParty ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
          )}
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="manage" icon={Settings} title="Managing your preferences">
          <p>
            When you first visit the site you&apos;ll see a banner with{" "}
            <em>Accept all</em>, <em>Only necessary</em>, and{" "}
            <em>Customize</em> options. <em>Only necessary</em> keeps the
            cookies the site needs to function (sign-in, cart, security) and
            turns the rest off &mdash; the site keeps working normally either
            way. You can change your choice any time by clicking the button
            below or the &ldquo;Manage cookies&rdquo; link in the footer. Your
            decision is stored locally; if you sign in, we sync your analytics
            preference to your profile so it follows you across devices.
          </p>
          <div className="not-prose mt-6">
            <ManageCookiesButton />
          </div>
          <p>
            You can also clear cookies through your browser&apos;s privacy
            settings. Doing so will sign you out and reset the banner.
          </p>
        </PolicySection>

        <p className="text-sm text-muted-foreground mt-12">
          Read the full <Link href="/privacy" className="underline">Privacy Policy</Link>{" "}
          for the broader picture of how we handle your data.
        </p>
      </PolicyShell>
    </CustomerLayout>
  );
}
