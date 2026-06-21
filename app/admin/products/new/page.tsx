"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { ProductForm } from "@/components/admin/ProductForm";
import { toast } from "sonner";

export default function NewProductPage() {
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

  const handleSave = (product: any) => {
    toast.success("Product created successfully");
    router.push("/admin/products");
  };

  const handleCancel = () => {
    router.push("/admin/products");
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push("/admin/products")}
            >
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">New Product</h1>
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
        <ProductForm onSave={handleSave} onCancel={handleCancel} />
      </div>
    </div>
  );
}
