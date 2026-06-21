"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LogOut, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Vendor = {
  id: string;
  display_name: string;
  legal_name: string | null;
  slug: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  website: string | null;
  address_json: any | null;
  status: "pending" | "approved" | "rejected" | "disabled";
  rejected_reason: string | null;
  commission_rate: number;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

type ProductMini = {
  id: string;
  name: string;
  slug: string;
  price: number | null;
  currency: string | null;
  is_published: boolean;
};

export default function VendorDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [v, setV] = useState<Vendor | null>(null);
  const [commissionRate, setCommissionRate] = useState<number>(0);
  const [reason, setReason] = useState("");
  const [approveOpen, setApproveOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);

  const [products, setProducts] = useState<ProductMini[]>([]);
  const [prodLoading, setProdLoading] = useState(true);

  // Gate: admin only — backend-aware via the auth context (Supabase OR NextAuth).
  // The old getUser() + is_admin RPC both rely on auth.uid(), null under NextAuth,
  // and were bouncing every admin to login.
  const { isAdmin: ctxIsAdmin, ready: authReady, logout: authLogout } = useAuth();
  useEffect(() => {
    if (!authReady) return;
    // Pass the deep-link path as ?from= so /admin can hand it to the
    // login screen, and the user lands back here after signing in.
    const bounceUrl =
      typeof window !== "undefined"
        ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}`
        : "/admin";
    if (!ctxIsAdmin) {
      router.replace(bounceUrl);
      return;
    }
    setIsAdmin(true);
    setReady(true);
  }, [authReady, ctxIsAdmin, router]);

  // Load vendor
  useEffect(() => {
    if (!ready || !isAdmin) return;
    (async () => {
      // Backend-aware: vendor + products via the admin API (requireAdmin +
      // service-role). No browser supabase (RLS-blocked under NextAuth).
      setProdLoading(true);
      try {
        const res = await fetch(`/api/admin/vendors/${encodeURIComponent(id)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        setProdLoading(false);
        if (!res.ok || !j?.ok) {
          toast.error(j?.error || "Failed to load vendor");
          return;
        }
        setV(j.vendor as Vendor);
        setCommissionRate((j.vendor?.commission_rate ?? 0) as number);
        setProducts((j.products ?? []) as ProductMini[]);
      } catch (e: any) {
        setProdLoading(false);
        toast.error(e?.message || "Failed to load vendor");
      }
    })();
  }, [ready, isAdmin, id]);

  const statusBadge = (s?: Vendor["status"]) => {
    switch (s) {
      case "approved":
        return <Badge>Approved</Badge>;
      case "pending":
        return (
          <Badge variant="outline" className="text-amber-600">
            Pending
          </Badge>
        );
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "disabled":
        return <Badge variant="secondary">Disabled</Badge>;
      default:
        return null;
    }
  };

  const logout = async () => {
    await authLogout();
    router.replace("/");
  };

  // Actions — all go through the admin API (requireAdmin + service-role).
  const patchVendor = async (body: Record<string, any>) => {
    const res = await fetch(`/api/admin/vendors/${encodeURIComponent(v!.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.ok) throw new Error(j?.error || "Request failed");
    return j;
  };

  const approve = async () => {
    if (!v) return;
    try {
      const j = await patchVendor({ action: "approve" });
      toast.success("Vendor approved");
      setApproveOpen(false);
      setV({ ...v, ...(j.patch ?? { status: "approved", rejected_reason: null }) });
    } catch (e: any) {
      toast.error(e?.message || "Failed to approve");
    }
  };

  const suspend = async (to: "disabled" | "rejected") => {
    if (!v) return;
    if (!reason.trim()) {
      toast.error("Please provide a reason");
      return;
    }
    try {
      await patchVendor({ action: "suspend", status: to, reason: reason.trim() });
      toast.success(to === "disabled" ? "Vendor suspended" : "Vendor rejected");
      setSuspendOpen(false);
      setV({ ...v, status: to, rejected_reason: reason.trim() });
      setReason("");
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    }
  };

  const updateCommission = async () => {
    if (!v) return;
    const rate = Math.max(0, Math.min(100, Number(commissionRate) || 0));
    try {
      await patchVendor({ action: "commission", commission_rate: rate });
      toast.success("Commission updated");
      setV({ ...v, commission_rate: rate });
    } catch (e: any) {
      toast.error(e?.message || "Failed to update commission");
    }
  };

  const productCount = useMemo(() => products.length, [products]);

  if (!ready || !isAdmin || !v) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push("/admin/vendors")}
            >
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">{v.display_name}</h1>
            {statusBadge(v.status)}
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <div className="grid gap-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Products
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{productCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Commission Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {(v.commission_rate ?? 0).toFixed(2)}%
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mt-1">{statusBadge(v.status)}</div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="kyc">KYC</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Vendor Information</CardTitle>
                  <CardDescription>Basic details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">
                        Display Name
                      </Label>
                      <p className="font-medium">{v.display_name}</p>
                    </div>
                    {v.legal_name && (
                      <div>
                        <Label className="text-muted-foreground">
                          Legal Name
                        </Label>
                        <p className="font-medium">{v.legal_name}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground">Email</Label>
                      <p className="font-medium">{v.email || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Phone</Label>
                      <p className="font-medium">{v.phone || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Website</Label>
                      <p className="font-medium">{v.website || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">GSTIN</Label>
                      <p className="font-medium">{v.gstin || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Slug</Label>
                      <p className="font-medium">{v.slug || "—"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Commission Settings</CardTitle>
                  <CardDescription>Set vendor commission (%)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <Label htmlFor="commission">Commission Rate (%)</Label>
                      <Input
                        id="commission"
                        type="number"
                        min={0}
                        max={100}
                        step={0.25}
                        value={commissionRate}
                        onChange={(e) =>
                          setCommissionRate(Number(e.target.value))
                        }
                      />
                    </div>
                    <Button onClick={updateCommission}>Update</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Actions</CardTitle>
                  <CardDescription>Approve / Reject / Suspend</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    {v.status === "pending" && (
                      <Button onClick={() => setApproveOpen(true)}>
                        <CheckCircle className="mr-2 h-4 w-4" /> Approve Vendor
                      </Button>
                    )}
                    {v.status === "approved" && (
                      <Button
                        variant="destructive"
                        onClick={() => setSuspendOpen(true)}
                      >
                        <AlertTriangle className="mr-2 h-4 w-4" /> Suspend
                        Vendor
                      </Button>
                    )}
                    {v.status === "pending" && (
                      <Button
                        variant="outline"
                        onClick={() => setSuspendOpen(true)}
                      >
                        <XCircle className="mr-2 h-4 w-4" /> Reject
                      </Button>
                    )}
                  </div>
                  {(v.status === "pending" || v.status === "approved") && (
                    <div className="text-xs text-muted-foreground">
                      Rejection/Suspension requires a reason.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="products">
            <Card>
              <CardHeader>
                <CardTitle>Products</CardTitle>
                <CardDescription>
                  Latest 25 products from this vendor
                </CardDescription>
              </CardHeader>
              <CardContent>
                {prodLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading…
                  </div>
                ) : products.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No products yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {products.map((p) => (
                      <div
                        key={p.id}
                        className="flex justify-between items-center p-3 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.slug}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={p.is_published ? "default" : "secondary"}
                          >
                            {p.is_published ? "Published" : "Hidden"}
                          </Badge>
                          <span className="text-sm">
                            {p.price == null
                              ? "—"
                              : new Intl.NumberFormat("en-IN", {
                                  style: "currency",
                                  currency: (p.currency || "INR").toUpperCase(),
                                }).format(p.price)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="kyc">
            <Card>
              <CardHeader>
                <CardTitle>KYC</CardTitle>
                <CardDescription>Documents & business info</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 border rounded-lg">
                  <Label className="text-muted-foreground">GSTIN</Label>
                  <p className="font-medium">{v.gstin || "—"}</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <Label className="text-muted-foreground">
                    Registered Address
                  </Label>
                  {v.address_json ? (
                    <p className="font-medium text-sm whitespace-pre-line">
                      {[
                        v.address_json.line1,
                        v.address_json.line2,
                        [v.address_json.city, v.address_json.state]
                          .filter(Boolean)
                          .join(", "),
                        v.address_json.pincode,
                        v.address_json.country,
                      ]
                        .filter(Boolean)
                        .join("\n")}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
                {/* If you later store file URLs in a column (e.g., kyc_docs jsonb), render them here */}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Approve dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Vendor</DialogTitle>
            <DialogDescription>
              They will be able to access the Vendor Portal immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={approve}>Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend/Reject dialog */}
      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {v?.status === "approved" ? "Suspend Vendor" : "Reject Vendor"}
            </DialogTitle>
            <DialogDescription>
              Provide a reason. The vendor will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reason">Reason *</Label>
              <Textarea
                id="reason"
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                suspend(v?.status === "approved" ? "disabled" : "rejected")
              }
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
