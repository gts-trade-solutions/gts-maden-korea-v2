"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, Search, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

type VendorInfo = {
  id: string;
  display_name: string;
  status: "pending" | "approved" | "rejected" | "disabled";
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  price: number | null;
  currency: string | null;
  is_published: boolean;
  updated_at: string;
  vendor_id: string | null;
  brands?: { name?: string | null } | null;
  track_inventory?: boolean | null;
  stock_qty?: number | null;
};

// ---- helpers
function coerceVendor(data: any): VendorInfo | null {
  const arr = Array.isArray(data) ? data : data ? [data] : [];
  const v = arr[0];
  if (!v) return null;
  return { id: v.id, display_name: v.display_name, status: v.status };
}

function formatINR(v?: number | null, currency?: string | null) {
  if (v == null) return "—";
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

function useDebouncedCallback<T extends (...args: any[]) => void>(
  fn: T,
  delay = 500
) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (...args: Parameters<T>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fnRef.current(...args), delay);
  };
}

export default function VendorProductsPage() {
  const router = useRouter();

  const [hydrated, setHydrated] = useState(false); // wait for session restore
  const [ready, setReady] = useState(false); // gate UI after vendor check
  const [vendor, setVendor] = useState<VendorInfo | null>(null);

  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState({ from: 0, to: 19, more: false }); // 20/page
  const [refreshKey, setRefreshKey] = useState(0);

  // 1) Hydrate auth + vendor check (fixes bouncing)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setHydrated(true);
        router.replace("/vendor/login");
        return;
      }
      setHydrated(true);

      const { data, error } = await supabase.rpc("get_my_vendor");
      if (cancelled) return;

      if (error) {
        console.error("get_my_vendor error", error);
        router.replace("/vendor"); // VendorGate will render state
        return;
      }

      const v = coerceVendor(data);
      if (!v) {
        router.replace("/vendor/register");
        return;
      }
      if (v.status !== "approved") {
        router.replace("/vendor");
        return;
      }

      setVendor(v);
      setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // session changes will trigger on next mount/navigation anyway
      setHydrated(true);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  // 2) Fetch vendor products (paged)
  const loadPage = async (reset = false) => {
    if (!vendor) return;
    setLoading(true);
    const from = reset ? 0 : paging.from;
    const to = reset ? 19 : paging.to;

    const { data, error } = await supabase
      .from("products")
      .select(
        `
        id, slug, name, price, currency, is_published, updated_at, vendor_id,
        brands ( name ),
        track_inventory, stock_qty
      `
      )
      .eq("vendor_id", vendor.id)
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) {
      toast.error(error.message || "Failed to load products");
      setRows([]);
      setPaging({ from: 0, to: 19, more: false });
    } else {
      const got = (data ?? []) as ProductRow[];
      setRows(reset ? got : from === 0 ? got : [...rows, ...got]);
      const more = got.length >= to - from + 1;
      setPaging({
        from: reset ? 20 : to + 1,
        to: reset ? 39 : to + 20,
        more,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!ready || !vendor) return;
    loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, vendor, refreshKey]);

  // 3) Client search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.brands?.name || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  // 4) Actions
  const onDelete = async (id: string) => {
    const yes = window.confirm("Delete this product? This cannot be undone.");
    if (!yes) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      toast.error(error.message || "Delete failed");
      return;
    }
    toast.success("Product deleted");
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const togglePublish = async (id: string, next: boolean) => {
    const prev = rows;
    setRows(rows.map((r) => (r.id === id ? { ...r, is_published: next } : r)));
    const { error } = await supabase
      .from("products")
      .update({ is_published: next })
      .eq("id", id);
    if (error) {
      toast.error(error.message || "Failed to update visibility");
      setRows(prev);
    } else {
      toast.success(next ? "Product published" : "Product hidden");
    }
  };

  const toggleTrack = async (id: string, next: boolean) => {
    const prev = rows;
    setRows(
      rows.map((r) => (r.id === id ? { ...r, track_inventory: next } : r))
    );
    const { error } = await supabase
      .from("products")
      .update({ track_inventory: next })
      .eq("id", id);
    if (error) {
      toast.error(error.message || "Failed to update inventory tracking");
      setRows(prev);
    } else {
      toast.success(next ? "Tracking enabled" : "Tracking disabled");
    }
  };

  const _updateStock = async (id: string, qty: number) => {
    const prev = rows;
    setRows(rows.map((r) => (r.id === id ? { ...r, stock_qty: qty } : r)));
    const { error } = await supabase
      .from("products")
      .update({ stock_qty: qty })
      .eq("id", id);
    if (error) {
      toast.error(error.message || "Failed to update stock");
      setRows(prev);
    }
  };
  const updateStock = useDebouncedCallback(_updateStock, 500);

  // ===== Render
  if (!hydrated || !ready) {
    return (
      <div className="container mx-auto py-16 text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push("/vendor")}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Product Management</h1>
            <Badge>Vendor: {vendor?.display_name}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => router.push("/vendor/products/single-new")}>
              <Plus className="mr-2 h-4 w-4" />
              Add Single Product
            </Button>
            <Button onClick={() => router.push("/vendor/products/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Add Bulk Product
            </Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
              <div>
                <CardTitle>Products</CardTitle>
                <CardDescription>
                  Only products owned by your vendor are shown.
                </CardDescription>
              </div>
              <div className="w-full md:w-80">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, slug, or brand…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[280px]">Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className="min-w-[180px]">Stock</TableHead>
                    <TableHead className="min-w-[180px]">Published</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center text-muted-foreground py-10"
                      >
                        {loading ? "Loading…" : "No products found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((p) => {
                      const tracking = p.track_inventory ?? true;
                      const stock = p.stock_qty ?? 0;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            <div className="line-clamp-2">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.slug}
                            </div>
                          </TableCell>
                          <TableCell>{p.brands?.name ?? "—"}</TableCell>
                          <TableCell>
                            {formatINR(p.price, p.currency)}
                          </TableCell>

                          {/* Stock */}
                          <TableCell className="whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={tracking}
                                  onCheckedChange={(v) => toggleTrack(p.id, v)}
                                  aria-label="Track inventory"
                                />
                                <span className="text-xs text-muted-foreground">
                                  Track
                                </span>
                              </div>
                              <Input
                                type="number"
                                min={0}
                                defaultValue={stock}
                                onChange={(e) => {
                                  const v = Math.max(
                                    0,
                                    Number(e.target.value) || 0
                                  );
                                  updateStock(p.id, v);
                                }}
                                disabled={!tracking}
                                className="h-8 w-24"
                              />
                            </div>
                          </TableCell>

                          {/* Published */}
                          <TableCell className="whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={p.is_published}
                                onCheckedChange={(v) => togglePublish(p.id, v)}
                                aria-label="Publish / hide"
                              />
                              <Badge
                                variant={
                                  p.is_published ? "default" : "secondary"
                                }
                              >
                                {p.is_published ? "Published" : "Hidden"}
                              </Badge>
                            </div>
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-sm">
                            {new Date(p.updated_at).toLocaleDateString(
                              "en-IN",
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              }
                            )}
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  router.push(`/vendor/products/${p.id}`)
                                }
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onDelete(p.id)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex justify-center">
              {paging.more && (
                <Button
                  variant="outline"
                  onClick={() => loadPage(false)}
                  disabled={loading}
                >
                  {loading ? "Loading…" : "Load More"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
