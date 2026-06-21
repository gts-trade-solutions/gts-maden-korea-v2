"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { ProductForm } from "@/components/admin/ProductForm";
import { v4 as uuidv4 } from "uuid";

export default function NewProductPage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out successfully");
    router.push("/");
  };

  const handleSave = (productData: any) => {
    // local demo persistence then redirect (unchanged)
    const newProduct = {
      id: uuidv4(),
      ...productData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const products = JSON.parse(localStorage.getItem("products") || "[]");
    products.push(newProduct);
    localStorage.setItem("products", JSON.stringify(products));

    toast.success("Product created successfully");
    router.push("/vendor/products");
  };

  const handleCancel = () => {
    router.push("/vendor/products");
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push("/vendor/products")}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Add New Product</h1>
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
