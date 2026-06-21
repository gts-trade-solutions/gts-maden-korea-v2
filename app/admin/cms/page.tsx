"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Image as ImageIcon, Tag, FileText, LogOut } from "lucide-react";
import { toast } from "sonner";

export default function AdminCMSPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();

  if (!hasRole("admin")) {
    router.push(typeof window !== "undefined" ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}` : "/admin");
    return null;
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
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push("/admin")}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Content Management</h1>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <ImageIcon className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Banners</CardTitle>
              <CardDescription>
                Manage homepage and promotional banners
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Create and manage banners for homepage, category pages, and
                promotional campaigns.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/cms/banners")}
              >
                Manage Banners
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Tag className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Categories</CardTitle>
              <CardDescription>Organize product categories</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Create, edit, and organize product categories and subcategories
                for better navigation.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/cms/categories")}
              >
                Manage Categories
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <ImageIcon className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Brands</CardTitle>
              <CardDescription>Manage brand listings</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Add and manage brand information, logos, and featured brand
                sections.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/cms/brands")}
              >
                Manage Brands
              </Button>
            </CardContent>
          </Card>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <ImageIcon className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Product Videos</CardTitle>
              <CardDescription>Manage Videos</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Upload and organize product videos.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/cms/product-video")}
              >
                Manage-video
              </Button>
            </CardContent>
          </Card>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <ImageIcon className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Influencer Videos</CardTitle>
              <CardDescription>Manage Videos</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Upload and organize Influencer videos.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/cms/influencer-video")}
              >
                Manage-video
              </Button>
            </CardContent>
          </Card>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <ImageIcon className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>K-Partnership Videos</CardTitle>
              <CardDescription>
                Per-country "How it works" videos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Upload one video per country and pick a default for
                countries without their own.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/cms/k-partnership-videos")}
              >
                Manage Videos
              </Button>
            </CardContent>
          </Card>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <FileText className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Static Pages</CardTitle>
              <CardDescription>Edit informational pages</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Update content for About Us, Contact, Privacy Policy, and Terms
                pages.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/cms/pages")}
              >
                Edit Pages
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Tag className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Coupons</CardTitle>
              <CardDescription>Create discount codes</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Create and manage discount coupons, promotional codes, and
                special offers.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/cms/coupons")}
              >
                Manage Coupons
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <ImageIcon className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Media Library</CardTitle>
              <CardDescription>Manage images and assets</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Upload and organize product images, banners, and other media
                assets.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/cms/media")}
              >
                Browse Media
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
