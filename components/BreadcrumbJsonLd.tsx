// Renders a BreadcrumbList JSON-LD `<script>` for a given trail. Drop
// alongside any page that wants to surface its hierarchy in Google
// SERPs — the visible breadcrumb component (if any) and this schema
// emitter are independent.

export type BreadcrumbCrumb = {
  name: string;
  // Absolute URL preferred; relative paths are resolved against the
  // canonical site root inside this component.
  url: string;
};

const SITE = "https://madenkorea.com";

function abs(u: string) {
  if (/^https?:\/\//i.test(u)) return u;
  return `${SITE}${u.startsWith("/") ? u : `/${u}`}`;
}

export function BreadcrumbJsonLd({ items }: { items: BreadcrumbCrumb[] }) {
  if (!items.length) return null;
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: abs(c.url),
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
    />
  );
}
