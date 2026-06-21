"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/lib/contexts/AuthContext";
import { ShoppingBag, Heart, User, LogOut, Eye, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ProductCard } from "@/components/ProductCard";
import { resolveMediaUrl } from "@/lib/storage/backend";
import AccountMembershipCard from "@/components/AccountMembershipCard";
import { augmentProductsWithCountryOffers } from "@/lib/pricing";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

function readCountryFromCookie(): string {
  if (typeof document === "undefined") return DEFAULT_COUNTRY;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("mik_country="));
  const raw = match ? decodeURIComponent(match.split("=")[1] ?? "") : "";
  return isSupportedCountry(raw) ? raw : DEFAULT_COUNTRY;
}

type DbProduct = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  hero_image_path?: string | null;
  stock_qty?: number | null;
  is_bundle?: boolean | null;
  brands?: { name?: string | null } | null;
};

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  return resolveMediaUrl("product-media", path) ?? null;
}

export default function AccountPage() {
  const router = useRouter();
  const t = useTranslations("account");
  const { user, isAuthenticated, logout, hasRole } = useAuth();
  const isAdmin = isAuthenticated && hasRole("admin");
  const [fullName, setFullName] = useState<string>("");
  const [recentlyViewed, setRecentlyViewed] = useState<DbProduct[]>([]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login?redirect=/account");
      return;
    }
    // Name comes from the auth session/profile (AuthContext) — no separate
    // profiles read needed.
    setFullName(user?.full_name || user?.email || t("fallbackUserName"));

    // Recently viewed: ids from localStorage -> server route (MySQL behind the
    // flag, country-priced). Images still resolve from Supabase Storage.
    (async () => {
      let viewedIds: string[] = [];
      try {
        viewedIds = JSON.parse(localStorage.getItem("recentlyViewed") || "[]");
      } catch {}
      if (!Array.isArray(viewedIds) || !viewedIds.length) return;
      try {
        const res = await fetch(
          `/api/catalog/products/by-ids?ids=${encodeURIComponent(viewedIds.slice(0, 12).join(","))}`
        );
        const json = await res.json().catch(() => ({} as any));
        const items = (json.products ?? []).map((p: any) => ({
          ...p,
          hero_image_url: storagePublicUrl(p.hero_image_path) ?? undefined,
        }));
        const map = new Map(items.map((i: any) => [i.id, i]));
        setRecentlyViewed(
          viewedIds.map((id) => map.get(id)).filter(Boolean) as any[]
        );
      } catch {}
    })();
  }, [isAuthenticated, router, user?.id, user?.email, user?.full_name]);

  if (!isAuthenticated) return null;

  const handleLogout = async () => {
    await logout();
    toast.success(t("loggedOutToast"));
    router.push("/");
  };

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">{t("dashboardTitle")}</h1>
            <p className="text-muted-foreground">{t("welcomeBack", { name: fullName })}</p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            {t("logoutBtn")}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {isAdmin && (
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-primary/40 bg-primary/5">
              <CardHeader>
                <ShieldCheck className="h-8 w-8 mb-2 text-primary" />
                <CardTitle>{t("dashboardAdminCardTitle")}</CardTitle>
                <CardDescription>{t("dashboardAdminCardDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => router.push("/admin")}
                >
                  {t("openAdminBtn")}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <ShoppingBag className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>{t("dashboardOrdersCardTitle")}</CardTitle>
              <CardDescription>{t("dashboardOrdersCardDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/account/orders")}
              >
                {t("viewOrdersBtn")}
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <Heart className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>{t("dashboardWishlistCardTitle")}</CardTitle>
              <CardDescription>{t("dashboardWishlistCardDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/wishlist")}
              >
                {t("viewWishlistBtn")}
              </Button>
            </CardContent>
          </Card>
<AccountMembershipCard />
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <User className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>{t("dashboardProfileCardTitle")}</CardTitle>
              <CardDescription>{t("dashboardProfileCardDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/account/settings")}
              >
                {t("editProfileBtn")}
              </Button>
            </CardContent>
          </Card>
        </div>

        {recentlyViewed.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center gap-2 mb-6">
              <Eye className="h-6 w-6" />
              <h2 className="text-2xl font-bold">{t("recentlyViewedHeading")}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {recentlyViewed.map((product) => (
                <ProductCard key={product.id} product={product as any} />
              ))}
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
