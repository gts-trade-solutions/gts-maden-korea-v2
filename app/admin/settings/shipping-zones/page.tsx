"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";
import { toast } from "sonner";

type Zone = {
  zone: string;
  label: string;
  eta_days_min: number;
  eta_days_max: number;
  sort_order: number;
};

export default function ShippingZonesPage() {
  const router = useRouter();
  const { hasRole } = useAuth();

  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!hasRole("admin")) {
      router.push(typeof window !== "undefined" ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}` : "/admin");
      return;
    }
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch("/api/admin/shipping-zones", {
          credentials: "include",
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        });
        const body = await res.json();
        if (!res.ok || body.ok === false) {
          toast.error(body.error || "Failed to load shipping zones");
          return;
        }
        setZones(body.zones ?? []);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load shipping zones");
      } finally {
        setLoading(false);
      }
    })();
  }, [hasRole, router]);

  if (!hasRole("admin")) return null;

  const updateZone = (zoneKey: string, field: "eta_days_min" | "eta_days_max", value: number) => {
    setZones((prev) =>
      prev.map((z) => (z.zone === zoneKey ? { ...z, [field]: value } : z)),
    );
  };

  const handleSave = async () => {
    // Client-side validation. Server re-validates.
    for (const z of zones) {
      if (
        !Number.isFinite(z.eta_days_min) ||
        !Number.isFinite(z.eta_days_max) ||
        z.eta_days_min < 0 ||
        z.eta_days_max < z.eta_days_min
      ) {
        toast.error(`${z.label}: max must be ≥ min, both ≥ 0`);
        return;
      }
    }

    setSaving(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/admin/shipping-zones", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          zones: zones.map((z) => ({
            zone: z.zone,
            eta_days_min: z.eta_days_min,
            eta_days_max: z.eta_days_max,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok || body.ok === false) {
        toast.error(body.error || "Failed to save shipping zones");
        return;
      }
      toast.success("Shipping zones saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save shipping zones");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push("/admin/settings")}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Shipping Zones</h1>
          </div>
          <Button onClick={handleSave} disabled={saving || loading}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </header>

      <div className="container mx-auto py-8 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Delivery Time Windows</CardTitle>
            <CardDescription>
              Estimated delivery days shown to customers when they enter their pincode on the
              product page. Each pincode maps to one of these zones based on its location.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : zones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No zones configured.</p>
            ) : (
              zones.map((z) => (
                <div key={z.zone} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  <div>
                    <Label className="text-base font-semibold">{z.label}</Label>
                    <p className="text-xs text-muted-foreground mt-1">{z.zone}</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${z.zone}-min`}>Min days</Label>
                    <Input
                      id={`${z.zone}-min`}
                      type="number"
                      min={0}
                      value={z.eta_days_min}
                      onChange={(e) =>
                        updateZone(z.zone, "eta_days_min", parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${z.zone}-max`}>Max days</Label>
                    <Input
                      id={`${z.zone}-max`}
                      type="number"
                      min={0}
                      value={z.eta_days_max}
                      onChange={(e) =>
                        updateZone(z.zone, "eta_days_max", parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
