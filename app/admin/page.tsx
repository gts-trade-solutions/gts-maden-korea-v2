"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { NotificationBell } from "@/components/admin/NotificationBell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Package,
  ShoppingCart,
  Users,
  TrendingUp,
  Settings,
  FileText,
  LogOut,
  Megaphone,
  Facebook,
  Instagram,
  Activity,
  Filter,
  Coins,
  Globe2,
  MessageCircle,
  Receipt,
  Inbox,
  Languages,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

type DashboardMetrics = {
  total_orders: number;
  paid_orders: number;
  revenue_inr: number;
  published_products: number;
  total_products: number;
  approved_vendors: number;
  total_vendors: number;
};

function formatInr(n: number) {
  try {
    return n.toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    });
  } catch {
    return `₹${Math.round(n).toLocaleString("en-IN")}`;
  }
}

export default function AdminDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, ready, isAdmin, logout } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  useEffect(() => {
    if (!ready || !isAdmin) return;
    let cancelled = false;
    (async () => {
      setMetricsLoading(true);
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch("/api/admin/dashboard-metrics", {
          credentials: "include",
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && body.ok) {
          setMetrics(body.metrics as DashboardMetrics);
        }
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, isAdmin]);

  // Sub-pages that bounce here pass their original path as `?from=`
  // so we can hand it through to the login screen as `?redirect=`.
  // Without this the user lands on /account after sign-in (the login
  // page's default) instead of the admin page they actually wanted.
  // Clamp to safe in-app paths only — never honor a `from` that starts
  // with `//` or `http` to avoid open-redirect abuse.
  const rawFrom = searchParams.get("from") || "/admin";
  const safeFrom =
    rawFrom.startsWith("/") && !rawFrom.startsWith("//")
      ? rawFrom
      : "/admin";
  const loginUrl = `/auth/login?redirect=${encodeURIComponent(safeFrom)}`;

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-muted-foreground">
        Loading admin…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>{user ? "Access Denied" : "Sign in required"}</CardTitle>
            <CardDescription>
              {user
                ? "You need admin privileges to access this page."
                : "Sign in with an admin account to continue."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => router.push(loginUrl)}
              className="w-full"
            >
              {user ? "Sign in as Admin" : "Sign in"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out successfully");
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Admin Portal</h1>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user?.full_name ?? user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Dashboard</h2>
          <p className="text-muted-foreground">Overview of your store</p>
        </div>

        {/* METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            label="Total Orders"
            value={
              metrics
                ? metrics.total_orders.toLocaleString("en-IN")
                : null
            }
            sub={
              metrics
                ? `${metrics.paid_orders.toLocaleString("en-IN")} paid`
                : "All time"
            }
            loading={metricsLoading}
          />

          <MetricCard
            label="Revenue"
            value={metrics ? formatInr(metrics.revenue_inr) : null}
            sub="Paid orders (INR)"
            loading={metricsLoading}
          />

          <MetricCard
            label="Products"
            value={
              metrics
                ? metrics.published_products.toLocaleString("en-IN")
                : null
            }
            sub={
              metrics
                ? `of ${metrics.total_products.toLocaleString("en-IN")} total`
                : "Published"
            }
            loading={metricsLoading}
          />

          <MetricCard
            label="Vendors"
            value={
              metrics
                ? metrics.approved_vendors.toLocaleString("en-IN")
                : null
            }
            sub={
              metrics
                ? `of ${metrics.total_vendors.toLocaleString("en-IN")} total`
                : "Approved"
            }
            loading={metricsLoading}
          />
        </div>

        {/* ACTION CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Products */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Package className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Products</CardTitle>
              <CardDescription>Manage product catalog</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Add, edit, and manage products. Control pricing, inventory, and
                editorial flags.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/products")}
              >
                Manage Products
              </Button>
            </CardContent>
          </Card>

          {/* Orders */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <ShoppingCart className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Orders</CardTitle>
              <CardDescription>Track and fulfill orders</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                View orders, update statuses, and manage fulfillment process.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/orders")}
              >
                View Orders
              </Button>
            </CardContent>
          </Card>

          {/* Vendors */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Users className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Vendors</CardTitle>
              <CardDescription>Manage vendor accounts</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Approve vendors, manage commissions, and view performance.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/vendors")}
              >
                Manage Vendors
              </Button>
            </CardContent>
          </Card>

          {/* Users + admin access */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <ShieldCheck className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Users</CardTitle>
              <CardDescription>Grant or revoke admin access</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Browse every account, search by email or name, and promote
                trusted users to admin. Super-admin accounts are protected
                from demotion.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/users")}
              >
                Manage Users
              </Button>
            </CardContent>
          </Card>

          {/* Influencers */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Megaphone className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Influencers</CardTitle>
              <CardDescription>
                Review requests & manage creators
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Accept or reject applications, and manage approved influencers.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/influencers")}
              >
                Manage Influencers
              </Button>
            </CardContent>
          </Card>

          {/* K-Partnership Commissions */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Coins className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>K-Partnership Commissions</CardTitle>
              <CardDescription>
                Approve, void, or set the auto-approve window
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Review commission attributions from completed orders. Set the
                auto-approve days (0 = immediate) to control when commissions
                become withdrawable.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/commissions")}
              >
                Manage Commissions
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Instagram className="h-8 w-8 mb-2 text-primary" />
              <Facebook className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Multi-Channel Marketing</CardTitle>
              <CardDescription>
                Schedule, post & manage IG content
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Access the Instagram and Facebook panel for posts, AI captions, comments, and
                performance.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/marketing/multichannel")}
              >
                Open MultiChannel Panel
              </Button>
            </CardContent>
          </Card>

          {/* Instagram Marketing */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Instagram className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Instagram Marketing</CardTitle>
              <CardDescription>
                Schedule, post & manage IG content
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Access the Instagram panel for posts, AI captions, comments, and
                performance.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/marketing/instagram")}
              >
                Open Instagram Panel
              </Button>
            </CardContent>
          </Card>

          {/* Facebook Marketing */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Facebook className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Facebook Marketing</CardTitle>
              <CardDescription>
                Manage page posts & comments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Use the Facebook panel to create posts, reply to comments and
                optimize content with AI.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/marketing/facebook")}
              >
                Open Facebook Panel
              </Button>
            </CardContent>
          </Card>

          {/* Social Connections / Tokens */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Settings className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Social Connections</CardTitle>
              <CardDescription>Connect Facebook & Instagram tokens</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Configure and update access tokens used for Facebook and
                Instagram marketing tools.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/instagram/settings")}
              >
                Open Social Settings
              </Button>
            </CardContent>
          </Card>

          {/* CMS */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <FileText className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>CMS</CardTitle>
              <CardDescription>Content management</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Manage homepage banners, categories, brands, and static pages.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/cms")}
              >
                Manage Content
              </Button>
            </CardContent>
          </Card>

          {/* Analytics */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <TrendingUp className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Analytics</CardTitle>
              <CardDescription>View reports and insights</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Track sales, revenue, and product performance over time.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/analytics")}
              >
                View Analytics
              </Button>
            </CardContent>
          </Card>

          {/* Conversion funnel */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Filter className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Conversion Funnel</CardTitle>
              <CardDescription>Where visitors drop off</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Stage-by-stage breakdown from page view → cart → payment.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/analytics/funnel")}
              >
                Open Funnel
              </Button>
            </CardContent>
          </Card>

          {/* User sessions */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Activity className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>User Sessions</CardTitle>
              <CardDescription>Drill into individual visits</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                See exactly what each visitor did and where they bailed out.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/analytics/sessions")}
              >
                Open Sessions
              </Button>
            </CardContent>
          </Card>

          {/* Store Settings */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Settings className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Store Settings</CardTitle>
              <CardDescription>Configure your store</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Manage payment, shipping, taxes, and other store settings.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/settings")}
              >
                Store Settings
              </Button>
            </CardContent>
          </Card>

          {/* Translations */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Languages className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Translations</CardTitle>
              <CardDescription>AI + human content translations</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Review and override AI-translated product descriptions,
                category names, brand bios, and banner copy across all
                supported locales.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/translations")}
              >
                Manage Translations
              </Button>
            </CardContent>
          </Card>

          {/* Currencies */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Coins className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Currencies</CardTitle>
              <CardDescription>FX rates & display currencies</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                View daily FX rates from open.er-api.com, toggle which
                currencies are visible to customers, and trigger a manual
                refresh after big rate moves.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/settings/currencies")}
              >
                Manage Currencies
              </Button>
            </CardContent>
          </Card>

          {/* International Shipping Rates */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Globe2 className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>International Shipping</CardTitle>
              <CardDescription>Per-country shipping rates</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Set the ₹/gram rate for each destination country. Required
                before Razorpay checkout can quote shipping to that country.
                India uses its own threshold flow in Settings → Shipping.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/settings/international-shipping")}
              >
                Manage Rates
              </Button>
            </CardContent>
          </Card>

          {/* Notification Emails */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Mail className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Notification Emails</CardTitle>
              <CardDescription>Who gets admin alerts</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Email addresses CC&apos;d on order confirmations, payout
                requests, contact submissions, and international order
                requests. Add or remove anyone here.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/settings/notification-emails")}
              >
                Manage Recipients
              </Button>
            </CardContent>
          </Card>

          {/* International Orders (legacy) */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Inbox className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>International Orders (legacy)</CardTitle>
              <CardDescription>Pre-cutover manual requests</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Manual-quote requests from before international Razorpay
                checkout was enabled. New international orders complete via
                Razorpay and appear in the regular Orders list.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/international-orders")}
              >
                View Legacy Requests
              </Button>
            </CardContent>
          </Card>

          {/* Invoices */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Receipt className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Invoices</CardTitle>
              <CardDescription>GST-compliant invoices</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                View, create, and edit invoices for orders. Linked from
                customer order pages for download.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/invoices")}
              >
                Manage Invoices
              </Button>
            </CardContent>
          </Card>

          {/* WhatsApp Marketing */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <MessageCircle className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>WhatsApp Marketing</CardTitle>
              <CardDescription>Campaigns, contacts, templates</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Send broadcast campaigns via WhatsApp Cloud API. Manage
                opted-in contacts and the approved message templates.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/whatsapp")}
              >
                Open WhatsApp Panel
              </Button>
            </CardContent>
          </Card>

          {/* Instagram Engagement */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Inbox className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Instagram Engagement</CardTitle>
              <CardDescription>DMs, comments & posts</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Reply to Instagram direct messages, manage comments on your
                posts, and review recent published content.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/instagram/inbox")}
              >
                Open Engagement
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: string | null;
  sub: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading || value == null ? (
          <div
            aria-hidden="true"
            className="h-9 w-24 animate-pulse rounded bg-muted"
          />
        ) : (
          <div className="text-3xl font-bold">{value}</div>
        )}
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}
