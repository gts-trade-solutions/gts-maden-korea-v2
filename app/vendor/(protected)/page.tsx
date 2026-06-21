"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  ShoppingCart,
  DollarSign,
  AlertTriangle,
  LogOut,
  Hourglass,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

type VendorInfo = {
  id: string;
  display_name: string;
  slug: string | null;
  status: "pending" | "approved" | "rejected" | "disabled";
  role: "owner" | "manager" | "staff" | null;
  rejected_reason?: string | null;
  email?: string | null; // business email if stored on vendors row
};

// RPC that RETURNS TABLE comes back as an array. Normalize to single object.
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
  } as VendorInfo;
}

export default function VendorDashboard() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [hydrated, setHydrated] = useState(false); // wait for auth session
  const [loading, setLoading] = useState(true);
  const [vendor, setVendor] = useState<VendorInfo | null>(null);
  const [vendorEmail, setVendorEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Ensure session is hydrated (prevents false "not logged in")
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setHydrated(true);
        router.replace("/vendor/login");
        return;
      }
      setHydrated(true);

      // Fetch vendor tied to this account
      const { data, error } = await supabase.rpc("get_my_vendor");
      if (cancelled) return;

      if (error) {
        console.error("get_my_vendor error", error);
        setVendor(null);
        setLoading(false);
        return;
      }

      const v = coerceVendor(data);
      setVendor(v);

      // Prefer business email from vendors row; fall back to user email
      if (v?.email) setVendorEmail(v.email);
      else if (v?.id) {
        const { data: vendRow } = await supabase
          .from("vendors")
          .select("email")
          .eq("id", v.id)
          .maybeSingle();
        setVendorEmail((vendRow as any)?.email ?? null);
      }

      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setHydrated(true);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const statusBadge = (s?: VendorInfo["status"]) => {
    if (s === "approved") return <Badge>Approved</Badge>;
    if (s === "pending") return <Badge variant="secondary">Pending</Badge>;
    if (s === "rejected") return <Badge variant="destructive">Rejected</Badge>;
    if (s === "disabled") return <Badge variant="outline">Disabled</Badge>;
    return null;
  };

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out successfully");
    router.push("/");
  };

  // ====== Loading / hydration
  if (!hydrated || loading) {
    return (
      <div className="container mx-auto py-16 text-muted-foreground">
        Loading vendor workspace…
      </div>
    );
  }

  // ====== No vendor yet → prompt to register
  if (!vendor) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Become a Vendor</CardTitle>
            <CardDescription>
              Create a vendor account to access the portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full"
              onClick={() => router.push("/vendor/register")}
            >
              Create Vendor Account
            </Button>
            <div className="text-xs text-muted-foreground text-center">
              Already applied? Sign in via{" "}
              <Link href="/vendor/login" className="underline">
                Vendor Login
              </Link>
              .
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ====== Pending → show friendly wait screen
  if (vendor.status === "pending") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md text-center">
          <CardHeader>
            <Hourglass className="h-10 w-10 mx-auto text-amber-500 mb-2" />
            <CardTitle className="text-2xl">Application in Review</CardTitle>
            <CardDescription>
              Thanks, <b>{vendor.display_name}</b>. We’ll notify you once
              approved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => router.push("/")}>
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ====== Rejected / Disabled
  if (vendor.status === "rejected" || vendor.status === "disabled") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md text-center">
          <CardHeader>
            <ShieldAlert className="h-10 w-10 mx-auto text-red-500 mb-2" />
            <CardTitle className="text-2xl">
              {vendor.status === "rejected"
                ? "Application Rejected"
                : "Account Disabled"}
            </CardTitle>
            <CardDescription>
              {vendor.rejected_reason
                ? `Reason: ${vendor.rejected_reason}`
                : "Please contact support."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" onClick={() => router.push("/")}>
              Back to Home
            </Button>
            <div className="text-xs text-muted-foreground">
              Need help? Email info@madenkorea.com
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ====== Approved → Dashboard
  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Vendor Portal</h1>
            {statusBadge(vendor.status)}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {vendor.display_name}
              {/* Prefer vendor business email, fallback to auth email */}
              {(vendorEmail || user?.email) ? (
                <> · {vendorEmail ?? user?.email}</>
              ) : null}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Dashboard</h2>
          <p className="text-muted-foreground">
            Manage your catalog, orders, and payouts
          </p>
        </div>

        {/* Summary cards (placeholders for now) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Sales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">₹—</div>
              <p className="text-xs text-muted-foreground mt-1">Coming soon</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">—</div>
              <p className="text-xs text-muted-foreground mt-1">
                Pending fulfillment
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">—</div>
              <p className="text-xs text-muted-foreground mt-1">
                Active products
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Payouts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">₹—</div>
              <p className="text-xs text-muted-foreground mt-1">Next payout</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Package className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Products</CardTitle>
              <CardDescription>Manage your product catalog</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Add new products, update inventory, and manage pricing.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/vendor/products")}
              >
                Manage Products
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <ShoppingCart className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Orders</CardTitle>
              <CardDescription>View and fulfill orders</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Process orders, update tracking, and manage fulfillment.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/vendor/orders")}
              >
                View Orders
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <DollarSign className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Payouts</CardTitle>
              <CardDescription>Track your earnings</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                View payout statements, earnings, and transaction history.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/vendor/payouts")}
              >
                View Payouts
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <AlertTriangle className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Low Stock Alerts</CardTitle>
              <CardDescription>Monitor inventory levels</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Get notified when products are running low on stock.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/vendor/alerts")}
              >
                View Alerts
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
