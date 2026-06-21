"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

type VendorInfo = {
  id: string;
  display_name: string;
  slug: string | null;
  status: "pending" | "approved" | "rejected" | "disabled";
  role: "owner" | "manager" | "staff" | null;
  rejected_reason?: string | null;
  email?: string | null;
};

function coerceVendor(data: any): VendorInfo | null {
  const arr = Array.isArray(data) ? data : data ? [data] : [];
  const v = arr[0];
  if (!v || !v.id) return null;
  return {
    id: v.id,
    display_name: v.display_name,
    slug: v.slug ?? null,
    status: v.status,
    role: v.role ?? null,
    rejected_reason: v.rejected_reason ?? null,
    email: v.email ?? null,
  };
}

type Phase =
  | "initial-checking"   // only before first decision
  | "approved"           // sticky; never changes afterward
  | "no-vendor"
  | "pending"
  | "rejected"
  | "disabled"
  | "error";

const PUBLIC_VENDOR_PREFIXES = [
  "/vendor/login",
  "/vendor/register",
  "/vendor/forgot-password",
];
const isPublic = (pathname: string) =>
  PUBLIC_VENDOR_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

export default function VendorGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const mounted = useRef(true);

  // allow public pages to render without checks
  if (isPublic(pathname)) return <>{children}</>;

  const [phase, setPhase] = useState<Phase>("initial-checking");
  const [vendor, setVendor] = useState<VendorInfo | null>(null);
  const approvedOnce = useRef(false); // sticky flag

  const gotoLogin = () => {
    router.replace(`/vendor/login?redirect=${encodeURIComponent(pathname)}`);
  };

  // ---- ONE-TIME CHECK ONLY ----
  useEffect(() => {
    mounted.current = true;

    (async () => {
      // 1) session check
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted.current) return;

      if (!session?.user) {
        // First hit, no session -> go login (only time we redirect automatically)
        gotoLogin();
        return;
      }

      // 2) vendor check
      const { data, error } = await supabase.rpc("get_my_vendor");
      if (!mounted.current) return;

      if (error) {
        setPhase("error");
        return;
      }

      const v = coerceVendor(data);
      setVendor(v);

      if (!v) { setPhase("no-vendor"); return; }

      if (v.status === "approved") {
        approvedOnce.current = true;
        setPhase("approved"); // sticky forever
        return;
      }
      if (v.status === "pending")  { setPhase("pending");  return; }
      if (v.status === "rejected") { setPhase("rejected"); return; }
      setPhase("disabled");
    })();

    // OPTIONAL: if you still want to react to explicit sign-out only
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted.current) return;
      if (event === "SIGNED_OUT") {
        // Comment these two lines if you truly want ZERO reactions after first check:
        approvedOnce.current = false;
        gotoLogin();
      }
      // For all other events, do nothing (no re-checks, no UI changes)
    });

    return () => {
      mounted.current = false;
      sub?.subscription?.unsubscribe?.();
    };
    // IMPORTANT: no deps → runs once, never re-checks
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Once approved, ALWAYS render children; never block again
  if (approvedOnce.current || phase === "approved") return <>{children}</>;

  // Pre-approval render states (only during the first visit)
  if (phase === "initial-checking") {
    return (
      <div className="container mx-auto py-16 text-muted-foreground">
        Loading vendor workspace…
      </div>
    );
  }

  if (phase === "no-vendor") {
    return (
      <div className="container mx-auto py-16">
        <Card className="max-w-xl mx-auto text-center">
          <CardHeader><CardTitle className="text-2xl">Become a Vendor</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">You don’t have a vendor account yet.</p>
            <Button asChild size="lg"><Link href="/vendor/register">Create Vendor Account</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "pending") {
    return (
      <div className="container mx-auto py-16">
        <Card className="max-w-xl mx-auto text-center">
          <CardHeader><CardTitle className="text-2xl">Application in Review</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-muted-foreground">
              Thanks for applying{vendor?.display_name ? `, ${vendor.display_name}` : ""}. We’ll notify you once approved.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "rejected" || phase === "disabled") {
    return (
      <div className="container mx-auto py-16">
        <Card className="max-w-xl mx-auto text-center">
          <CardHeader><CardTitle className="text-2xl">
            {phase === "rejected" ? "Application Rejected" : "Account Disabled"}
          </CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {vendor?.rejected_reason
              ? <p className="text-sm text-muted-foreground">Reason: {vendor.rejected_reason}</p>
              : <p className="text-muted-foreground">Please contact support.</p>}
            <Button asChild variant="outline"><Link href="/">Back to Home</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="container mx-auto py-16 text-destructive">
        Something went wrong. Please refresh or try again.
      </div>
    );
  }

  return null;
}
