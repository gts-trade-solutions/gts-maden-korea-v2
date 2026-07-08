"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Legacy Supabase OAuth landing page. Under AUTH_BACKEND=nextauth, OAuth is
// handled entirely by NextAuth's own /api/auth/callback/[provider] handler and
// the browser is returned straight to the `callbackUrl`, so this page is no
// longer part of any live flow. Kept as a safe redirect (preserving any
// `next`/`redirect` param) in case a stale provider/bookmark still points here.
export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect =
    searchParams.get("redirect") || searchParams.get("next") || "/account";

  useEffect(() => {
    router.replace(redirect);
  }, [router, redirect]);

  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Signing you in…</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Redirecting…</p>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
