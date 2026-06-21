"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { adminWrite } from "@/lib/admin/catalog-write";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Mail, Phone, MapPin, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

// Admin: list + manage international order requests.
//
// Each row is a customer who submitted a request through the
// /api/international-order endpoint. The team manually replies with a
// shipping quote and payment instructions, then walks the status
// through new → contacted → quoted → completed (or cancelled).

type IntlOrder = {
  id: string;
  status: "new" | "contacted" | "quoted" | "completed" | "cancelled";
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  country: string;
  address: {
    line1: string;
    line2?: string | null;
    city: string;
    state?: string | null;
    postal_code: string;
    country: string;
  };
  cart_snapshot: Array<{
    product_id: string;
    name: string;
    sku?: string | null;
    quantity: number;
    unit_price_inr: number;
    line_total_inr?: number;
    hero_image_url?: string | null;
  }>;
  currency_code: string;
  display_total: number | null;
  inr_total: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const STATUSES: IntlOrder["status"][] = [
  "new",
  "contacted",
  "quoted",
  "completed",
  "cancelled",
];

const STATUS_COLOR: Record<IntlOrder["status"], string> = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-amber-100 text-amber-700",
  quoted: "bg-purple-100 text-purple-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-neutral-100 text-neutral-600",
};

export default function InternationalOrdersAdminPage() {
  const router = useRouter();
  const { hasRole } = useAuth();

  const [orders, setOrders] = useState<IntlOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = orders.find((o) => o.id === activeId) ?? null;

  const load = async () => {
    const { data, error } = await supabase
      .from("international_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOrders((data ?? []) as IntlOrder[]);
  };

  useEffect(() => {
    if (!hasRole("admin")) {
      router.push(typeof window !== "undefined" ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}` : "/admin");
      return;
    }
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [hasRole, router]);

  // Realtime subscription: refetch the table whenever a row is inserted
  // or updated. We refetch instead of merging the payload directly —
  // simpler, idempotent, handles the rare cases where the payload
  // doesn't carry all columns (e.g., when RLS strips fields). Admin
  // RLS lets this user see every row, so refetches are complete.
  //
  // Channel is unmounted on cleanup to avoid leaks across navigations.
  useEffect(() => {
    if (!hasRole("admin")) return;

    const channel = supabase
      .channel("admin-international-orders")
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT | UPDATE | DELETE
          schema: "public",
          table: "international_orders",
        },
        () => {
          // No await needed; load() handles its own toast on error.
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hasRole]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const updateStatus = async (id: string, status: IntlOrder["status"]) => {
    const prev = orders;
    setOrders((os) => os.map((o) => (o.id === id ? { ...o, status } : o)));
    try {
      await adminWrite({
        table: "international_orders",
        op: "update",
        data: { status },
        match: { id },
      });
      toast.success("Status updated");
    } catch (e: any) {
      setOrders(prev);
      toast.error(e?.message || "Update failed");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <header className="border-b bg-background">
          <div className="container mx-auto py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => router.push("/admin")}>
                ← Back
              </Button>
              <h1 className="text-2xl font-bold">International Orders</h1>
            </div>
          </div>
        </header>
        <div className="container mx-auto py-12 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading requests…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push("/admin")}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">International Orders</h1>
          </div>
          {/* Manual refresh — the realtime subscription handles most
              cases, but this is the user-controllable safety net for
              when the websocket connection drops (e.g., backgrounded
              tab, flaky network). */}
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </header>

      <div className="container mx-auto py-8 max-w-6xl space-y-6">
      {/* Cutover notice: as of the international-payments rollout
          (INTERNATIONAL_PAYMENTS.md), non-Indian visitors complete
          their orders directly via Razorpay and land in the regular
          Orders list. This screen is a historical/edge-case archive:
          rows here are either pre-cutover requests, or visitors who
          submitted the legacy manual form by direct URL. */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Legacy view.</strong> International orders that complete via Razorpay now appear in the normal{" "}
        <a href="/admin/orders" className="underline font-medium">
          Orders
        </a>{" "}
        list (their <code>currency</code> column shows USD/EUR/etc).
        This page only lists leftover manual-quote requests from before
        the international-payments cutover, and any new submissions for
        countries that haven&apos;t had a shipping rate configured yet.
      </div>

      <Card>
        <CardHeader>
          <CardTitle>International order requests</CardTitle>
          <CardDescription>
            Visitors outside India submit these from the cart. Reply by
            email with a shipping quote + payment instructions. Walk the
            status through new → contacted → quoted → completed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No international requests yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(o.created_at).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{o.customer_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.customer_email}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{o.country}</TableCell>
                    <TableCell className="text-sm">{o.cart_snapshot.length}</TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium">
                        {o.display_total != null
                          ? `${o.currency_code} ${o.display_total.toFixed(2)}`
                          : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ₹{o.inr_total?.toLocaleString("en-IN") ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={o.status}
                        onValueChange={(v) =>
                          updateStatus(o.id, v as IntlOrder["status"])
                        }
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue>
                            <Badge className={STATUS_COLOR[o.status]} variant="secondary">
                              {o.status}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => setActiveId(o.id)}
                        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                      >
                        Details <ExternalLink className="h-3 w-3" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail drawer */}
      <Sheet open={!!active} onOpenChange={(o) => !o && setActiveId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle>Order request {active.id.slice(0, 8)}</SheetTitle>
                <SheetDescription>
                  Submitted {new Date(active.created_at).toLocaleString("en-IN")}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5 text-sm">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Customer
                  </h3>
                  <p className="font-medium">{active.customer_name}</p>
                  <p className="flex items-center gap-1 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    <a href={`mailto:${active.customer_email}`} className="underline">
                      {active.customer_email}
                    </a>
                  </p>
                  {active.customer_phone && (
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      {active.customer_phone}
                    </p>
                  )}
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    <MapPin className="inline h-3.5 w-3.5 mr-1" />
                    Shipping address
                  </h3>
                  <p className="whitespace-pre-line">
                    {active.address.line1}
                    {active.address.line2 ? `\n${active.address.line2}` : ""}
                    {"\n"}
                    {active.address.city}
                    {active.address.state ? `, ${active.address.state}` : ""}{" "}
                    {active.address.postal_code}
                    {"\n"}
                    {active.address.country}
                  </p>
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Items
                  </h3>
                  <ul className="space-y-2">
                    {active.cart_snapshot.map((l, i) => (
                      <li key={`${l.product_id}-${i}`} className="flex justify-between gap-3">
                        <span>
                          <span className="font-medium">{l.name}</span>
                          <span className="text-muted-foreground"> × {l.quantity}</span>
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          ₹{(l.unit_price_inr * l.quantity).toLocaleString("en-IN")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="border-t pt-4">
                  <div className="flex justify-between font-medium">
                    <span>Customer currency</span>
                    <span>
                      {active.currency_code}{" "}
                      {active.display_total != null
                        ? active.display_total.toFixed(2)
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>INR equivalent</span>
                    <span>
                      ₹{active.inr_total?.toLocaleString("en-IN") ?? "—"}
                    </span>
                  </div>
                </section>

                {active.notes && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Notes
                    </h3>
                    <p className="whitespace-pre-line text-muted-foreground">
                      {active.notes}
                    </p>
                  </section>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      </div>
    </div>
  );
}
