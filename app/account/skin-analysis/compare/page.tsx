import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import { CompareView, type CompareSide } from "@/components/skin/CompareView";
import {
  META_KEYS,
  type SkinSummary,
  type SkinIssueDetails,
} from "@/lib/integrations/skinConcerns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fmt = (d: Date) =>
  new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

export default async function ComparePage({
  searchParams,
}: {
  searchParams: { a?: string; b?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?redirect=/account/skin-analysis/compare");

  const all = await prisma.skinAnalysis.findMany({
    where: { userId: user.id, status: "done" },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });

  if (all.length < 2) {
    return (
      <CustomerLayout>
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            You need at least two analyses to compare. Run another one to track
            your progress.
          </p>
          <Button asChild className="mt-4">
            <Link href="/account/skin-analysis">Back to results</Link>
          </Button>
        </div>
      </CustomerLayout>
    );
  }

  // Default: before = second-newest, after = newest.
  const bId = searchParams.b && all.some((x) => x.id === searchParams.b) ? searchParams.b : all[0].id;
  const aId = searchParams.a && all.some((x) => x.id === searchParams.a) ? searchParams.a : all[1].id;

  const load = async (id: string): Promise<CompareSide | null> => {
    const row = await prisma.skinAnalysis.findFirst({
      where: { id, userId: user.id },
      include: { issues: true },
    });
    if (!row) return null;
    const summary = (row.summary as SkinSummary | null) ?? {};
    return {
      id: row.id,
      dateLabel: fmt(row.createdAt),
      baseImage: summary.base_image ?? null,
      overall: summary.overall ?? null,
      concerns: row.issues
        .filter((i) => !META_KEYS.has(i.issueType))
        .map((i) => ({
          key: i.issueType,
          score: i.score ?? null,
          imageUrl: (i.details as SkinIssueDetails | null)?.imageUrl ?? null,
        })),
    };
  };

  const [a, b] = await Promise.all([load(aId), load(bId)]);
  if (!a || !b) redirect("/account/skin-analysis");

  const options = all.map((o) => ({ id: o.id, label: fmt(o.createdAt) }));

  return (
    <CustomerLayout>
      <div
        className="mx-auto max-w-6xl px-4 py-8"
        style={{ ["--hdr" as string]: "128px" } as React.CSSProperties}
      >
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Compare analyses
          </h1>
          <Button asChild variant="outline" size="sm">
            <Link href="/account/skin-analysis">All results</Link>
          </Button>
        </div>
        <CompareView a={a} b={b} options={options} />
      </div>
    </CustomerLayout>
  );
}
