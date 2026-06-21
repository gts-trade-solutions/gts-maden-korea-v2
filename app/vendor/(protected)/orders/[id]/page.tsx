'use client';

import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogOut, Printer, Package } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

export default function VendorOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user, hasRole, logout } = useAuth();
  const orderId = params.id as string;

  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');

  if (!hasRole('vendor')) {
    router.push('/vendor');
    return null;
  }

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  const handleMarkDispatched = () => {
    if (!trackingNumber || !carrier) {
      toast.error('Please enter tracking number and select carrier');
      return;
    }
    toast.success('Order marked as dispatched');
    router.push('/vendor/orders');
  };

  const handlePrintInvoice = () => {
    toast.info('Invoice printing coming soon');
  };

  const handlePrintLabel = () => {
    toast.info('Shipping label printing coming soon');
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/vendor/orders')}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Order #{orderId.slice(0, 8)}</h1>
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
              <CardTitle>Order Information</CardTitle>
              <CardDescription>Customer and order details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                Order details will appear here when orders are available
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dispatch Order</CardTitle>
              <CardDescription>Enter shipping information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="carrier">Shipping Carrier</Label>
                  <Select value={carrier} onValueChange={setCarrier}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select carrier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="delhivery">Delhivery</SelectItem>
                      <SelectItem value="bluedart">Blue Dart</SelectItem>
                      <SelectItem value="dtdc">DTDC</SelectItem>
                      <SelectItem value="indiapost">India Post</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="tracking">Tracking Number</Label>
                  <Input
                    id="tracking"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="Enter tracking number"
                  />
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleMarkDispatched} className="flex-1">
                    <Package className="mr-2 h-4 w-4" />
                    Mark as Dispatched
                  </Button>
                  <Button variant="outline" onClick={handlePrintInvoice}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print Invoice
                  </Button>
                  <Button variant="outline" onClick={handlePrintLabel}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print Label
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
