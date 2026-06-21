'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, LogOut, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { mockCoupons } from '@/lib/mock-data';

interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  min_purchase: number;
  max_discount?: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  usage_limit?: number;
  used_count: number;
}

export default function CouponsManagementPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    type: 'percentage' as 'percentage' | 'fixed',
    value: 0,
    min_purchase: 0,
    max_discount: '',
    valid_from: '',
    valid_until: '',
    is_active: true,
    usage_limit: '',
  });

  useEffect(() => {
    if (!hasRole('admin')) {
      router.push('/admin');
      return;
    }
    loadCoupons();
  }, [hasRole, router]);

  const loadCoupons = () => {
    const stored = localStorage.getItem('coupons');
    if (stored) {
      setCoupons(JSON.parse(stored));
    } else {
      const initial = mockCoupons.map(coupon => ({
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        min_purchase: coupon.min_purchase || 0,
        max_discount: coupon.max_discount,
        valid_from: coupon.valid_from,
        valid_until: coupon.valid_to,
        is_active: coupon.active,
        usage_limit: undefined,
        used_count: 0,
      }));
      setCoupons(initial);
      localStorage.setItem('coupons', JSON.stringify(initial));
    }
  };

  const saveCoupons = (updatedCoupons: Coupon[]) => {
    localStorage.setItem('coupons', JSON.stringify(updatedCoupons));
    setCoupons(updatedCoupons);
  };

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  const openDialog = (coupon?: Coupon) => {
    if (coupon) {
      setEditingCoupon(coupon);
      setFormData({
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        min_purchase: coupon.min_purchase,
        max_discount: coupon.max_discount?.toString() || '',
        valid_from: coupon.valid_from,
        valid_until: coupon.valid_until,
        is_active: coupon.is_active,
        usage_limit: coupon.usage_limit?.toString() || '',
      });
    } else {
      setEditingCoupon(null);
      setFormData({
        code: '',
        type: 'percentage',
        value: 0,
        min_purchase: 0,
        max_discount: '',
        valid_from: new Date().toISOString().split('T')[0],
        valid_until: '',
        is_active: true,
        usage_limit: '',
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.code || formData.value <= 0) {
      toast.error('Code and value are required');
      return;
    }

    if (!formData.valid_until) {
      toast.error('Valid until date is required');
      return;
    }

    const couponData = {
      code: formData.code.toUpperCase(),
      type: formData.type,
      value: formData.value,
      min_purchase: formData.min_purchase,
      max_discount: formData.max_discount ? parseInt(formData.max_discount) : undefined,
      valid_from: formData.valid_from,
      valid_until: formData.valid_until,
      is_active: formData.is_active,
      usage_limit: formData.usage_limit ? parseInt(formData.usage_limit) : undefined,
    };

    if (editingCoupon) {
      const updated = coupons.map((c) =>
        c.id === editingCoupon.id
          ? { ...c, ...couponData }
          : c
      );
      saveCoupons(updated);
      toast.success('Coupon updated successfully');
    } else {
      const newCoupon: Coupon = {
        id: uuidv4(),
        ...couponData,
        used_count: 0,
      };
      saveCoupons([...coupons, newCoupon]);
      toast.success('Coupon created successfully');
    }

    setIsDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this coupon?')) {
      const updated = coupons.filter((c) => c.id !== id);
      saveCoupons(updated);
      toast.success('Coupon deleted successfully');
    }
  };

  const toggleActive = (id: string) => {
    const updated = coupons.map((c) =>
      c.id === id ? { ...c, is_active: !c.is_active } : c
    );
    saveCoupons(updated);
    toast.success('Coupon status updated');
  };

  const isExpired = (date: string) => {
    return new Date(date) < new Date();
  };

  if (!hasRole('admin')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin/cms')}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Coupon Management</h1>
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
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Coupons</CardTitle>
                <CardDescription>Create and manage discount codes for customers</CardDescription>
              </div>
              <Button onClick={() => openDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Add Coupon
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {coupons.length === 0 ? (
              <div className="text-center py-12">
                <Percent className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No coupons yet</h3>
                <p className="text-muted-foreground mb-6">Create your first coupon to get started</p>
                <Button onClick={() => openDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Coupon
                </Button>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Min Purchase</TableHead>
                      <TableHead>Valid Until</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coupons.map((coupon) => (
                      <TableRow key={coupon.id}>
                        <TableCell className="font-bold">{coupon.code}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {coupon.type === 'percentage' ? 'Percentage' : 'Fixed'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {coupon.type === 'percentage' ? `${coupon.value}%` : `₹${coupon.value}`}
                        </TableCell>
                        <TableCell>₹{coupon.min_purchase.toLocaleString('en-IN')}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{new Date(coupon.valid_until).toLocaleDateString('en-IN')}</span>
                            {isExpired(coupon.valid_until) && (
                              <Badge variant="destructive" className="w-fit mt-1">Expired</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {coupon.used_count}
                          {coupon.usage_limit ? ` / ${coupon.usage_limit}` : ' / ∞'}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={coupon.is_active}
                            onCheckedChange={() => toggleActive(coupon.id)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openDialog(coupon)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(coupon.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingCoupon ? 'Edit Coupon' : 'Add Coupon'}</DialogTitle>
            <DialogDescription>
              {editingCoupon ? 'Update coupon details' : 'Create a new discount coupon'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="code">Coupon Code *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="WELCOME10"
                className="uppercase"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Discount Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="value">
                  Value * {formData.type === 'percentage' ? '(%)' : '(₹)'}
                </Label>
                <Input
                  id="value"
                  type="number"
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                  placeholder={formData.type === 'percentage' ? '10' : '100'}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="min_purchase">Minimum Purchase (₹)</Label>
                <Input
                  id="min_purchase"
                  type="number"
                  value={formData.min_purchase}
                  onChange={(e) => setFormData({ ...formData, min_purchase: parseInt(e.target.value) || 0 })}
                  placeholder="500"
                />
              </div>

              {formData.type === 'percentage' && (
                <div className="grid gap-2">
                  <Label htmlFor="max_discount">Max Discount (₹)</Label>
                  <Input
                    id="max_discount"
                    type="number"
                    value={formData.max_discount}
                    onChange={(e) => setFormData({ ...formData, max_discount: e.target.value })}
                    placeholder="200"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="valid_from">Valid From</Label>
                <Input
                  id="valid_from"
                  type="date"
                  value={formData.valid_from}
                  onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="valid_until">Valid Until *</Label>
                <Input
                  id="valid_until"
                  type="date"
                  value={formData.valid_until}
                  onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="usage_limit">Usage Limit (leave empty for unlimited)</Label>
              <Input
                id="usage_limit"
                type="number"
                value={formData.usage_limit}
                onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                placeholder="100"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingCoupon ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
