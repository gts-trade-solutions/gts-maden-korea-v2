"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";

/**
 * "View full report" CTA. The report page does server-side work (AI text
 * generation) before it renders, so a plain <Link> looks unresponsive and users
 * click again. This drives the navigation through a transition and shows an
 * explicit "Generating report…" spinner until the report page takes over.
 */
export function ViewReportButton({ href }: { href: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <span className="relative inline-flex">
      <Button
        onClick={() => startTransition(() => router.push(href))}
        disabled={pending}
        className="shadow-md shadow-primary/30 ring-2 ring-primary/40 transition hover:ring-primary/60"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating report…
          </>
        ) : (
          <>
            <FileText className="mr-2 h-4 w-4" /> View full report
          </>
        )}
      </Button>
      {/* Attention beacon — hidden once clicked (pending). */}
      {!pending ? (
        <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-rose-500" />
        </span>
      ) : null}
    </span>
  );
}
