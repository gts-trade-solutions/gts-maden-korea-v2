import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { CustomerLayout } from "@/components/CustomerLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { concernLabel, type SkinSummary } from "@/lib/integrations/skinConcerns";
import { Sparkles, ChevronRight } from "lucide-react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A user's saved skin analyses (kept for future reference).
export default async function SkinAnalysisHistoryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?redirect=/account/skin-analysis");

  const analyses = await prisma.skinAnalysis.findMany({
    where: { userId: user.id, status: "done" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <CustomerLayout>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Skin analyses
          </h1>
          <Button asChild size="sm">
            <Link href="/skin-analyzer">New analysis</Link>
          </Button>
        </div>

        {analyses.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                You haven&apos;t run a skin analysis yet.
              </p>
              <Button asChild>
                <Link href="/skin-analyzer">Analyze your skin</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {analyses.map((a) => {
              const summary = (a.summary as SkinSummary | null) ?? {};
              const top = (summary.top_concerns ?? [])
                .map(concernLabel)
                .slice(0, 3)
                .join(" · ");
              return (
                <Link key={a.id} href={`/account/skin-analysis/${a.id}`}>
                  <Card className="transition-colors hover:bg-muted/40">
                    <CardHeader className="flex-row items-center justify-between space-y-0 py-4">
                      <div>
                        <CardTitle className="text-sm">
                          {new Date(a.createdAt).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </CardTitle>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {top || "View result"}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
