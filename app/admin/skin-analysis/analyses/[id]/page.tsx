import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { SkinReport } from "@/components/skin/SkinReport";
import { buildSkinReportData } from "@/lib/integrations/skinReportData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin view of any user's full skin report. Reuses the exact customer report
// (SkinReport) via the shared data builder, with the toolbar "Back" pointing to
// the admin list instead of the customer's result page.
export default async function AdminSkinReportPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect(`/auth/login?redirect=/admin/skin-analysis/analyses`);
  if (user.role !== "admin" && user.role !== "super_admin") notFound();

  const data = await buildSkinReportData(params.id);
  if (!data) notFound();

  const owner = await prisma.user.findUnique({
    where: { id: data.ownerUserId },
    select: { email: true, name: true },
  });

  return (
    <SkinReport
      analysisId={data.analysisId}
      backHref="/admin/skin-analysis/analyses"
      backLabel="Back to all analyses"
      dateLabel={new Date(data.createdAt).toLocaleDateString("en-GB", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}
      userName={owner?.name ?? owner?.email ?? null}
      baseImage={data.summary.base_image ?? null}
      overall={data.summary.overall ?? null}
      skinType={data.summary.skin_type ?? null}
      skinAge={data.summary.skin_age ?? null}
      aiSummary={data.summary.ai_summary ?? null}
      concerns={data.concerns}
      concernSummaries={data.concernSummaries}
      recommendations={data.recommendations}
      recoReasons={data.recoReasons}
    />
  );
}
