'use client';

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { adminWrite } from "@/lib/admin/catalog-write";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LogOut,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

function formatINR(v?: number | null, currency?: string | null) {
  if (v == null) return "";
  const code = (currency ?? "INR").toUpperCase();
  if (code === "INR") return `₹${v.toLocaleString("en-IN")}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(v);
  } catch {
    return `${code} ${v.toLocaleString()}`;
  }
}

export default function AdminOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const orderId = params.id as string;
  const [dtdcShipment, setDtdcShipment] = useState<any | null>(null);
  const [dtdcLoading, setDtdcLoading] = useState(false);
  const [order, setOrder] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [payment, setPayment] = useState<any | null>(null);
  const [orderStatus, setOrderStatus] = useState<string>("processing");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);

  const isAdmin = hasRole("admin");

  const openLabel = (label_code: string) => {
    if (!orderId) return;
    const u = new URL(window.location.origin + "/api/dtdc/label");
    u.searchParams.set("order_id", orderId);
    u.searchParams.set("label_code", label_code);
    u.searchParams.set("label_format", "pdf");
    window.open(u.toString(), "_blank", "noopener,noreferrer");
  };

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out successfully");
    router.push("/");
  };

  // Redirect non-admins safely (inside an effect)
  useEffect(() => {
    if (user && !isAdmin) {
      router.push(typeof window !== "undefined" ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}` : "/admin");
    }
  }, [user, isAdmin, router]);

  // Load order + items + latest payment
  useEffect(() => {
    if (!orderId || !user || !isAdmin) return;

    const load = async () => {
      try {
        setLoading(true);

        const { data: ord, error: oErr } = await supabase
          .from("orders")
          .select(
            "id, order_number, status, currency, subtotal, shipping_fee, discount_total, total, subtotal_inr, shipping_fee_inr, discount_total_inr, total_inr, fx_rate_snapshot, address_snapshot, created_at, user_id"
          )
          .eq("id", orderId)
          .maybeSingle();

        if (oErr || !ord) {
          console.error("Admin order: order error", oErr);
          toast.error("Order not found");
          setLoading(false);
          return;
        }

        setOrder(ord);

        const { data: ship } = await supabase
          .from("dtdc_shipments")
          .select(
            "id, reference_number, status, is_active, last_error, created_at"
          )
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(1);
        setDtdcShipment(ship?.[0] ?? null);

        setOrderStatus(ord.status ?? "processing");

        const [{ data: its, error: iErr }, { data: pays, error: pErr }] =
          await Promise.all([
            supabase
              .from("order_items")
              .select(
                "product_id, sku, name, quantity, unit_price, line_total, mrp, hero_image_path"
              )
              .eq("order_id", orderId),
            supabase
              .from("payments")
              .select("*")
              .eq("order_id", orderId)
              .order("created_at", { ascending: false })
              .limit(1),
          ]);

        if (iErr) {
          console.error("Admin order: items error", iErr);
        }
        if (pErr) {
          console.error("Admin order: payments error", pErr);
        }

        setItems(its ?? []);
        setPayment((pays ?? [])[0] ?? null);
      } catch (err) {
        console.error("Admin order: fatal error", err);
        toast.error("Failed to load order");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [orderId, user, isAdmin]);

const handleCreateDtdc = async (force_new = false) => {
  try {
    setDtdcLoading(true);

    // Check if an active shipment already exists for this order
    const { data: existingShipment, error: existingShipmentError } = await supabase
      .from('dtdc_shipments')
      .select('*')
      .eq('order_id', orderId)
      .eq('is_active', true)
      .maybeSingle();

    // If an active shipment exists and we're not forcing a new one, reuse it
    if (existingShipment) {
      if (!force_new) {
        // If shipment already exists and we're not forcing new, just return it
        toast.success("DTDC shipment already exists");
        setDtdcShipment(existingShipment);
        return;
      }

      // If we're forcing a new shipment, deactivate the existing one
      console.log("Deactivating existing shipment", existingShipment.id);
      await adminWrite({
        table: "dtdc_shipments",
        op: "update",
        data: {
          is_active: false,
          status: 'failed',
          last_error: 'Recreated by admin',
        },
        match: { id: existingShipment.id },
      });
    }

    // Proceed to create a new shipment after deactivating the previous one
    console.log("Creating new shipment...");

    const res = await fetch("/api/dtdc/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId, force_new }),
    });

    const j = await res.json().catch(() => ({}));

    if (!res.ok || !j?.ok) {
      toast.error(j?.error || "DTDC create shipment failed");
      return;
    }

    toast.success(
      j?.reused ? "DTDC shipment already exists" : "DTDC shipment created"
    );
    setDtdcShipment(j?.shipment ?? null);
  } catch (e: any) {
    toast.error(e?.message || "DTDC error");
  } finally {
    setDtdcLoading(false);
  }
};


  const handleStatusUpdate = async (newStatus: string) => {
    if (!orderId || !newStatus || newStatus === orderStatus || statusUpdating) {
      return;
    }
    try {
      setStatusUpdating(true);
      await adminWrite({
        table: "orders",
        op: "update",
        data: { status: newStatus },
        match: { id: orderId },
      });

      setOrderStatus(newStatus);
      setOrder((prev: any) => (prev ? { ...prev, status: newStatus } : prev));
      toast.success(`Order status updated to ${newStatus}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update order status");
    } finally {
      setStatusUpdating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
      case "pending_payment":
      case "created":
        return <Badge variant="outline">{status}</Badge>;
      case "processing":
      case "paid":
        return <Badge variant="secondary">{status}</Badge>;
      case "dispatched":
      case "shipped":
        return <Badge variant="default">{status}</Badge>;
      case "delivered":
        return (
          <Badge variant="default" className="bg-green-500">
            {status}
          </Badge>
        );
      case "cancelled":
        return <Badge variant="destructive">{status}</Badge>;
      case "returned":
        return <Badge variant="outline">{status}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const timeline = useMemo(() => {
    if (!order) return [];
    const events: {
      status: string;
      date: string;
      description: string;
      icon: any;
    }[] = [];

    // Order placed
    events.push({
      status: "Order Placed",
      date: order.created_at,
      description: "Order has been placed successfully",
      icon: Package,
    });

    // Payment confirmed
    if (payment) {
      events.push({
        status: "Payment Confirmed",
        date: payment.created_at,
        description: `Payment received via ${payment.method || "Razorpay"}`,
        icon: CheckCircle,
      });
    }

    // Current status
    const normalizedStatus = orderStatus || order.status;
    if (normalizedStatus && normalizedStatus !== "pending") {
      let desc = "Order is being processed";
      let IconComp: any = Clock;
      if (normalizedStatus === "dispatched" || normalizedStatus === "shipped") {
        desc = "Order has been dispatched";
        IconComp = Truck;
      } else if (normalizedStatus === "delivered") {
        desc = "Order delivered to customer";
        IconComp = CheckCircle;
      } else if (normalizedStatus === "cancelled") {
        desc = "Order has been cancelled";
        IconComp = XCircle;
      } else if (normalizedStatus === "returned") {
        desc = "Order returned by customer";
        IconComp = XCircle;
      }

      events.push({
        status:
          normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1),
        date: payment?.created_at || order.created_at,
        description: desc,
        icon: IconComp,
      });
    }

    return events;
  }, [order, payment, orderStatus]);

  const handleCancelDtdc = async () => {
    try {
      if (!dtdcShipment?.reference_number) {
        toast.error("No AWB found to cancel.");
        return;
      }

      const yes = window.confirm(
        `Cancel DTDC shipment?\nAWB: ${dtdcShipment.reference_number}\n\nThis cannot be undone.`
      );
      if (!yes) return;

      setDtdcLoading(true);

      const res = await fetch("/api/dtdc/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        toast.error(j?.error || "DTDC cancel failed");
        return;
      }

      toast.success("DTDC shipment cancelled");
      setDtdcShipment(j?.shipment ?? null); // will likely be inactive now
    } catch (e: any) {
      toast.error(e?.message || "Cancel failed");
    } finally {
      setDtdcLoading(false);
    }
  };

  // After all hooks: if not admin, render nothing (redirect handled above)
  if (!isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <header className="border-b bg-background">
          <div className="container mx-auto py-4 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Button variant="ghost" disabled>
                ← Back to Orders
              </Button>
              <h1 className="text-2xl font-bold">Order Details</h1>
            </div>
          </div>
        </header>
        <div className="container mx-auto py-8 text-muted-foreground">
          Loading order…
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-muted/30">
        <header className="border-b bg-background">
          <div className="container mx-auto py-4 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => router.push("/admin/orders")}
              >
                ← Back to Orders
              </Button>
              <h1 className="text-2xl font-bold">Order Details</h1>
            </div>
          </div>
        </header>
        <div className="container mx-auto py-8 text-muted-foreground">
          Order not found.
        </div>
      </div>
    );
  }

  const shippingAddress = order.address_snapshot || {};
  const billingAddress = order.address_snapshot || {};
  const currency = order.currency || "INR";
  const subtotal = Number(order.subtotal || 0);
  const shippingFee = Number(order.shipping_fee || 0);
  const discountTotal = Number(order.discount_total || 0);
  const total = Number(order.total || 0);

  const paymentMethod = payment?.method || "Razorpay";
  const paymentStatus =
    order.status === "paid" || order.status === "delivered"
      ? "paid"
      : order.status || "pending";

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push("/admin/orders")}
            >
              ← Back to Orders
            </Button>
            <h1 className="text-2xl font-bold">Order Details</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Summary Section */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>
                      Order #{order.order_number || order.id}
                    </CardTitle>
                    <CardDescription>
                      Placed on{" "}
                      {new Date(order.created_at).toLocaleString("en-IN", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </CardDescription>
                  </div>
                  {getStatusBadge(orderStatus)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">
                      Update Order Status
                    </Label>
                    <Select
                      value={orderStatus}
                      onValueChange={handleStatusUpdate}
                      disabled={statusUpdating}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="dispatched">Dispatched</SelectItem>
                        <SelectItem value="shipped">Shipped</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="returned">Returned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Order Items */}
            <Card>
              <CardHeader>
                <CardTitle>Order Items</CardTitle>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No items found for this order.
                  </p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <span className="font-medium">{item.name}</span>
                              </div>
                            </TableCell>
                            <TableCell>{item.sku}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>
                              {formatINR(item.unit_price, currency)}
                            </TableCell>
                            <TableCell>
                              {formatINR(item.line_total, currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    <Separator className="my-4" />

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>{formatINR(subtotal, currency)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Shipping</span>
                        <span>
                          {shippingFee === 0
                            ? "FREE"
                            : formatINR(shippingFee, currency)}
                        </span>
                      </div>
                      {discountTotal > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Discount</span>
                          <span>-{formatINR(discountTotal, currency)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span>{formatINR(total, currency)}</span>
                      </div>

                      {/* INR-equivalent snapshot for international orders. The
                          buyer-currency view above is the authoritative one
                          (what Razorpay charged); these are the INR amounts
                          recorded at the time of order so analytics and
                          reconciliation can roll up across currencies. */}
                      {currency !== "INR" && order?.total_inr != null && (
                        <div className="mt-3 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs space-y-1">
                          <div className="flex justify-between text-muted-foreground">
                            <span>INR equivalent (at order time)</span>
                            <span className="tabular-nums">
                              {formatINR(Number(order.total_inr), "INR")}
                            </span>
                          </div>
                          {order?.fx_rate_snapshot != null && (
                            <div className="flex justify-between text-muted-foreground">
                              <span>FX rate snapshot</span>
                              <span className="tabular-nums font-mono">
                                1 INR = {Number(order.fx_rate_snapshot).toFixed(6)} {currency}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Customer Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium">
                    {shippingAddress.name || "Guest"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {shippingAddress.email || "—"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {shippingAddress.phone || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    User ID: {order.user_id || "guest"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Shipping Address</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-1">
                  <p className="font-medium">{shippingAddress.name || "—"}</p>
                  <p className="text-muted-foreground">
                    {shippingAddress.address || "—"}
                  </p>
                  <p className="text-muted-foreground">
                    {shippingAddress.city || "—"}, {shippingAddress.state || ""}
                  </p>
                  <p className="text-muted-foreground">
                    {shippingAddress.pincode || "—"}
                  </p>
                  <p className="text-muted-foreground">
                    {shippingAddress.phone || "—"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Billing Address</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-1">
                  <p className="font-medium">{billingAddress.name || "—"}</p>
                  <p className="text-muted-foreground">
                    {billingAddress.address || "—"}
                  </p>
                  <p className="text-muted-foreground">
                    {billingAddress.city || "—"}, {billingAddress.state || ""}
                  </p>
                  <p className="text-muted-foreground">
                    {billingAddress.pincode || "—"}
                  </p>
                  <p className="text-muted-foreground">
                    {billingAddress.phone || "—"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payment Method</span>
                  <span className="font-medium">{paymentMethod}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payment Status</span>
                  <Badge
                    variant={paymentStatus === "paid" ? "default" : "outline"}
                    className={paymentStatus === "paid" ? "bg-green-500" : ""}
                  >
                    {paymentStatus}
                  </Badge>
                </div>
                {payment?.provider_payment_id && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Provider Ref</span>
                    <span className="font-medium">
                      {payment.provider_payment_id}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" /> DTDC Shipment
                </CardTitle>
                <CardDescription>
                  AWB creation + shipment status
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {dtdcShipment?.reference_number ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="default">
                      AWB: {dtdcShipment.reference_number}
                    </Badge>
                    <Badge variant="secondary">
                      Status: {dtdcShipment.status}
                    </Badge>
                  </div>
                ) : (
                  <Badge variant="outline">No DTDC shipment created yet</Badge>
                )}

                {dtdcShipment?.last_error ? (
                  <p className="text-sm text-red-600">
                    Last error: {dtdcShipment.last_error}
                  </p>
                ) : null}

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleCreateDtdc(false)}
                    disabled={dtdcLoading || !!dtdcShipment?.reference_number}
                  >
                    {dtdcLoading ? "Creating..." : "Create Shipment"}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => handleCreateDtdc(true)}
                    disabled={dtdcLoading}
                  >
                    Recreate / Retry
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Create Shipment generates an AWB. Label printing comes in Step
                  5.
                </p>
              </CardContent>
            </Card>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => openLabel("SHIP_LABEL_4X6")}
                disabled={!dtdcShipment?.reference_number}
              >
                Print 4x6 Label
              </Button>

              <Button
                variant="secondary"
                onClick={() => openLabel("SHIP_LABEL_A4")}
                disabled={!dtdcShipment?.reference_number}
              >
                Print A4 Label
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelDtdc}
                disabled={
                  !dtdcShipment?.reference_number ||
                  dtdcLoading ||
                  dtdcShipment?.status === "cancelled"
                }
              >
                Cancel Shipment
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Prints open in a new tab as a PDF. Make sure popups are allowed
              for your admin domain.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <label className={className}>{children}</label>;
}
