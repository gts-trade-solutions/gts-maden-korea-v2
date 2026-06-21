// Shared layout primitives used across every customer-facing policy /
// help page. Goal: a consistent editorial feel — generous whitespace,
// sticky TOC on desktop, iconified section headers, prose-style body
// content, and a "still need help?" CTA at the end.
//
// Used by:
//   /policies/cancellation, /policies/refunds, /policies/replacements,
//   /policies/shipping-returns, /policies/cookies, /privacy, /terms,
//   /faq, /about (selectively)

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Mail, MessageCircle } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TocItem = {
  id: string;
  label: string;
};

/**
 * Sticky table-of-contents sidebar. Hidden on mobile (where the page
 * is short enough to scroll, and the in-page quick-jump nav handles
 * navigation if needed). On desktop, sits to the left of the content
 * and provides a stable orientation point for long policy pages.
 */
export function PolicyToc({ items }: { items: TocItem[] }) {
  return (
    <nav
      aria-label="On this page"
      className="sticky top-32 self-start"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-4">
        On this page
      </p>
      <ul className="space-y-0.5">
        {items.map(({ id, label }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="
                block py-1.5 pl-3 text-sm text-muted-foreground
                border-l-2 border-transparent
                hover:text-foreground hover:border-primary
                transition-colors
              "
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Two-column wrapper used by long-form policy pages: TOC on the left,
 * article content on the right. Mobile collapses to a single column
 * (TOC is hidden — quick-jump pills inside the article handle that
 * device).
 */
export function PolicyShell({
  toc,
  children,
}: {
  toc?: TocItem[];
  children: ReactNode;
}) {
  return (
    <div className="container mx-auto py-10 sm:py-14">
      <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-12 lg:gap-12">
        {toc && toc.length > 0 && (
          <aside className="hidden lg:block lg:col-span-3">
            <PolicyToc items={toc} />
          </aside>
        )}
        <article
          className={cn(
            "min-w-0",
            toc && toc.length > 0 ? "lg:col-span-9" : "lg:col-span-12 max-w-3xl mx-auto"
          )}
        >
          {children}
        </article>
      </div>
    </div>
  );
}

/**
 * Mobile-only quick-jump pill row. Renders horizontally scrollable on
 * narrow viewports. Hidden on lg+ where the sidebar TOC takes over.
 */
export function PolicyQuickJump({ items }: { items: TocItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Jump to section"
      className="lg:hidden -mx-4 px-4 mb-8 overflow-x-auto"
    >
      <ul className="flex gap-2 pb-2 min-w-max">
        {items.map(({ id, label }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="
                inline-block whitespace-nowrap rounded-full
                border bg-background px-4 py-1.5 text-sm font-medium
                text-muted-foreground hover:text-foreground hover:bg-muted
                transition-colors
              "
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Editorial-style section block. Replaces the heavy-Card pattern that
 * was previously wrapped around every chunk of policy text. Section
 * starts with an iconified circle + heading, followed by content
 * (children) which is typically a `<div className="prose ...">` block.
 */
export function PolicySection({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id?: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32 mb-12">
      <div className="flex items-start gap-4 mb-5">
        <div className="rounded-full bg-primary/10 ring-1 ring-primary/20 p-2.5 flex-shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 pt-1">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div
        className="
          prose prose-neutral max-w-none
          prose-p:text-muted-foreground prose-p:leading-relaxed
          prose-li:text-muted-foreground
          prose-strong:text-foreground
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          prose-headings:tracking-tight prose-headings:text-foreground
        "
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Subtle horizontal divider used between PolicySections. Slightly
 * fancier than a plain hr — a centered dot accent reads as
 * intentional rather than default-browser.
 */
export function PolicyDivider() {
  return (
    <div className="my-12 flex items-center gap-3" aria-hidden>
      <div className="h-px flex-1 bg-border" />
      <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Closing CTA used on every policy / help page. "Still have questions?"
 * with a contact-form link and the support email. Reads as a calm
 * payoff to the reader's scroll.
 */
export function PolicyCta({ supportEmail }: { supportEmail: string }) {
  return (
    <div className="mt-16 rounded-2xl border bg-muted/40 p-8 sm:p-10 text-center">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
        <MessageCircle className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-xl sm:text-2xl font-semibold tracking-tight mb-2">
        Still have questions?
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
        Our team typically responds within 24 hours during business hours.
        Reach us via the contact form or just email us.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/contact">Contact us</Link>
        </Button>
        <a
          href={`mailto:${supportEmail}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          <Mail className="h-4 w-4" />
          {supportEmail}
        </a>
      </div>
    </div>
  );
}

/**
 * Small "last updated" pill rendered just under the hero on long-form
 * pages. Optional reading-time can be passed if the page wants to
 * surface it.
 */
export function PolicyMeta({
  updated,
  readingTime,
}: {
  updated: string;
  readingTime?: string;
}) {
  return (
    <p className="text-xs text-muted-foreground mb-10 inline-flex items-center gap-3 rounded-full border bg-muted/40 px-3 py-1">
      <span>Last updated: {updated}</span>
      {readingTime && (
        <>
          <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
          <span>{readingTime}</span>
        </>
      )}
    </p>
  );
}
