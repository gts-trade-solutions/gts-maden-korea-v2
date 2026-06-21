// app/influencer/layout.tsx
import { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const dynamic = "force-dynamic";

// Influencer dashboard — gated, user-specific. Noindex the whole tree.
export const metadata: Metadata = {
  title: "Influencer Portal",
  robots: { index: false, follow: false, nocache: true },
};

export default async function InfluencerLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("influencer");
  // Backend-aware identity (RSC): NextAuth session post-flip, Supabase sb-* cookie
  // otherwise. Under NextAuth there is no sb-* cookie, so the old getUser() would
  // wrongly redirect every influencer to login.
  let userId: string | null = null;
  if (process.env.AUTH_BACKEND === "nextauth") {
    const { getServerSession } = await import("next-auth");
    const { authOptions } = await import("@/lib/auth/authOptions");
    const session = await getServerSession(authOptions);
    userId = (session?.user as any)?.id ?? null;
  } else {
    const supabase = createServerComponentClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  // Not logged in → send to login with redirect back to /influencer
  if (!userId) {
    redirect(`/auth/login?redirect=${encodeURIComponent("/influencer")}`);
  }

  // Role + influencer gating via service-role (works under both backends),
  // scoped explicitly by the resolved userId.
  const { createServiceClient } = await import("@/lib/supabaseServer");
  const admin = createServiceClient();

  // Check profile role (tolerate missing row)
  const { data: prof } = await admin
    .from("profiles")
    .select("role, full_name")
    .eq("id", userId)
    .maybeSingle();

  const isAdmin = prof?.role === "admin" || prof?.role === "super_admin";

  // If not admin, require active influencer profile
  let inflHandle: string | null = null;
  if (!isAdmin) {
    const { data: infl } = await admin
      .from("influencer_profiles")
      .select("handle, active")
      .eq("user_id", userId)
      .maybeSingle();

    if (!infl?.active) {
      // Not an approved influencer yet → send to request page
      redirect("/influencer-request");
    }
    inflHandle = infl?.handle ?? null;
  }

  return (
    <>
   
    <Header/>
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{t("portalTitle")}</h1>
            {inflHandle && (
              <span className="text-xs text-muted-foreground">@{inflHandle}</span>
            )}
            {isAdmin && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                {t("adminMode")}
              </span>
            )}
          </div>
          <nav className="flex gap-4 text-sm">
            <Link className="hover:underline" href="/influencer">{t("navDashboard")}</Link>
            {/* /influencer/promos removed — duplicated the dashboard's
                inline create-promo card with stale validation. The
                dashboard is the single source of truth now. The route
                itself stays as a permanent redirect so bookmarks work. */}
          </nav>
        </div>
      </header>

      <main className="container mx-auto py-8">{children}</main>
    </div>
    <Footer/>
     </>
  );
}
