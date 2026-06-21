'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LogOut, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { mockProducts } from '@/lib/mock-data';

export default function VendorAlertsPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();

  if (!hasRole('vendor')) {
    router.push('/vendor');
    return null;
  }

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  const lowStockProducts = mockProducts.filter(
    p => p.inventory.qty <= p.inventory.low_stock_threshold && p.inventory.qty > 0
  );

  const outOfStockProducts = mockProducts.filter(p => p.inventory.qty === 0);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/vendor')}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Stock Alerts</h1>
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
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <CardTitle>Out of Stock</CardTitle>
                  <CardDescription>Products that need immediate restocking</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {outOfStockProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No out of stock products
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Brand</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Current Stock</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outOfStockProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">{product.title}</TableCell>
                          <TableCell>{product.brand_name || '-'}</TableCell>
                          <TableCell>{product.sku}</TableCell>
                          <TableCell>
                            <Badge variant="destructive">0</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/vendor/products/${product.id}`)}
                            >
                              Restock
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <div>
                  <CardTitle>Low Stock</CardTitle>
                  <CardDescription>Products running low on inventory</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {lowStockProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No low stock alerts
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Brand</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Current Stock</TableHead>
                        <TableHead>Threshold</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lowStockProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">{product.title}</TableCell>
                          <TableCell>{product.brand_name || '-'}</TableCell>
                          <TableCell>{product.sku}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-orange-600">
                              {product.inventory.qty}
                            </Badge>
                          </TableCell>
                          <TableCell>{product.inventory.low_stock_threshold}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/vendor/products/${product.id}`)}
                            >
                              Restock
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
