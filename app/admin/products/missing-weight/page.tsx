"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Audit: published products without net_weight_g set. International
// checkout will refuse a cart that contains any of these, so the admin
// uses this list as a backfill worklist. Filed under /admin/products
// because the fix is to edit each product.

type Row = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  net_weight_g: number | null;
  gross_weight_g: number | null;
};

export default function MissingWeightAuditPage() {
  const router = useRouter();
  const { hasRole } = useAuth();

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasRole("admin")) {
      router.push(typeof window !== "undefined" ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}` : "/admin");
      return;
    }
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch("/api/admin/products/missing-weight", {
          credentials: "include",
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        });
        const body = await res.json();
        if (!res.ok || body.ok === false) {
          toast.error(body.error || "Failed to load");
          return;
        }
        setRows(body.rows ?? []);
        setTotal(body.total ?? 0);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [hasRole, router]);

  if (!hasRole("admin")) return null;

  return (
    <>
      <AdminBackBar to="/admin/products" title="Products · Missing weight" />

      <div className="container mx-auto py-6 max-w-5xl space-y-4">
        <p className="text-sm text-muted-foreground">
          Published products without a usable <code>gross_weight_g</code> value
          (i.e. the total weight including retail packaging). Shipping math
          — India DTDC and the international EMS slab pricing — both read
          from this column, so any cart line containing one of these will
          refuse to checkout. Backfill the gross weight on each product.
        </p>

        <div className="text-xs text-muted-foreground">
          {loading
            ? "Loading…"
            : total === 0
            ? "Every published product has a gross weight set. 🎉"
            : `${total} published product${total === 1 ? "" : "s"} need a gross weight.`}
        </div>

        {!loading && total > 0 && (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Product</th>
                    <th className="text-left px-4 py-3 font-medium">Brand</th>
                    <th className="text-left px-4 py-3 font-medium">Current weight</th>
                    <th className="text-right px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {r.slug}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{r.brand ?? "—"}</td>
                      <td className="px-4 py-3 text-sm">
                        {r.gross_weight_g == null ? (
                          <span className="text-red-600">Not set</span>
                        ) : (
                          <span className="text-amber-700">
                            {r.gross_weight_g} g (invalid)
                          </span>
                        )}
                        {r.net_weight_g != null && r.gross_weight_g == null && (
                          <div className="text-xs text-muted-foreground">
                            Net is {r.net_weight_g} g (for reference).
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/admin/products/${r.id}`}>
                            Edit product
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
