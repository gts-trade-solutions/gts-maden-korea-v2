import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { CustomerLayout } from "@/components/CustomerLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  concernLabel,
  bandStyle,
  META_KEYS,
  type SkinSummary,
  type SkinIssueDetails,
} from "@/lib/integrations/skinConcerns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Canonical result view. By the time the analyzer redirects here, the signed
// callback has already stored the row (it returns this id), so a direct read is
// correct — no polling needed in the happy path.
export default async function SkinAnalysisDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/auth/login?redirect=/account/skin-analysis/${params.id}`);
  }

  const analysis = await prisma.skinAnalysis.findFirst({
    where: { id: params.id, userId: user.id },
    include: { issues: true },
  });
  if (!analysis) notFound();

  const summary = (analysis.summary as SkinSummary | null) ?? {};
  const concerns = analysis.issues
    .filter((i) => !META_KEYS.has(i.issueType))
    .sort((a, b) => (a.score ?? 1) - (b.score ?? 1));

  return (
    <CustomerLayout>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Your skin analysis
            </h1>
            <p className="text-sm text-muted-foreground">
              {new Date(analysis.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/account/skin-analysis">All results</Link>
          </Button>
        </div>

        {/* Analyzed photo */}
        {summary.base_image && (
          <Card className="mb-4">
            <CardContent className="p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={summary.base_image}
                alt="Analyzed photo"
                className="mx-auto max-h-96 w-auto rounded-lg"
              />
            </CardContent>
          </Card>
        )}

        {(summary.overall != null ||
          summary.skin_type ||
          summary.skin_age) && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-6">
              {summary.overall != null && (
                <Stat
                  label="Overall"
                  value={`${Math.round(summary.overall * 100)}/100`}
                />
              )}
              {summary.skin_type && (
                <Stat label="Skin type" value={cap(summary.skin_type)} />
              )}
              {summary.skin_age && (
                <Stat label="Skin age" value={String(summary.skin_age)} />
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Concerns</CardTitle>
            <CardDescription>
              Cosmetic guidance only — not a medical diagnosis.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {concerns.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">
                No specific concerns were detected.
              </p>
            )}
            {concerns.map((c) => {
              const band = bandStyle(c.severityBand);
              const details = (c.details as SkinIssueDetails | null) ?? {};
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    {details.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={details.imageUrl}
                        alt={concernLabel(c.issueType)}
                        className="h-12 w-12 shrink-0 rounded-md object-cover"
                      />
                    ) : null}
                    <span className="text-sm font-medium">
                      {concernLabel(c.issueType)}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${band.className}`}
                  >
                    {band.label}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          For cosmetic guidance only. Not a medical diagnosis.
        </p>
      </div>
    </CustomerLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
