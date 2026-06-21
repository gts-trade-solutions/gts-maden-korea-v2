// Shared hero band used at the top of every help / policy / about
// page. Keeps the visual treatment consistent across:
//  - /contact, /about, /faq
//  - /policies/* (cancellation, refunds, replacements, shipping-returns, cookies)
//  - /privacy, /terms
//
// Sits FULL-WIDTH outside the container so the muted background spans
// edge-to-edge. The actual content of each page lives below it inside
// a normal container.

type Props = {
  /**
   * Tiny uppercase eyebrow above the heading. Categorises the page
   * (e.g. "Help", "Legal", "About"). Kept short.
   */
  eyebrow: string;
  title: string;
  description?: string;
};

export function PolicyHero({ eyebrow, title, description }: Props) {
  return (
    <div className="bg-muted/30 border-b">
      <div className="container mx-auto py-12 sm:py-16">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">
            {eyebrow}
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            {title}
          </h1>
          {description && (
            <p className="text-base sm:text-lg text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
