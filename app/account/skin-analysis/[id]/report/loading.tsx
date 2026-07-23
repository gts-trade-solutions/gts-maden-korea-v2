import { Loader2 } from "lucide-react";

// Shown instantly while the report page runs its server-side work (loading the
// analysis + generating/caching the AI summaries and product reasons), so the
// navigation never feels unresponsive.
export default function ReportLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/30 px-6 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
      <div className="text-sm font-medium text-slate-700">
        Generating your report…
      </div>
      <div className="max-w-xs text-xs text-muted-foreground">
        Building your skin profile chart, per-concern breakdown and product
        recommendations. This can take a few seconds.
      </div>
    </div>
  );
}
