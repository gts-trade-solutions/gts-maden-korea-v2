'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { adminWrite } from '@/lib/admin/catalog-write';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { Eye, LogOut, Download, Search, FileText, Trash2, Truck, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

type AdminOrderRow = {
  id: string;
  order_number: string | null;
  status: string;
  total: number;
  currency: string | null;
  created_at: string;
  customerName: string;
  customerEmail: string;
  itemCount: number;
  paymentMethod: string;
  shipmentAwb: string | null;
  shipmentStatus: string | null;
};

type FilterMode = 'all' | 'awaiting_shipment';

function formatINR(v?: number | null, currency?: string | null) {
  if (v == null) return '';
  const code = (currency ?? 'INR').toUpperCase();
  if (code === 'INR') return `₹${v.toLocaleString('en-IN')}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
    }).format(v);
  } catch {
    return `${code} ${v.toLocaleString()}`;
  }
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const isAdmin = hasRole('admin');

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  // pagination
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminOrderRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  // redirect non-admins
  useEffect(() => {
    if (user && !isAdmin) router.push('/admin');
  }, [user, isAdmin, router]);

  // reset to page 1 when search or filter changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterMode]);

  // fetch a page of orders (NO status filtering)
  useEffect(() => {
    if (!user || !isAdmin) return;

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        // The whole list (orders + per-order item count, latest payment
        // method, active DTDC AWB/status) is assembled server-side via the
        // service-role admin endpoint so RLS can be enabled on the
        // orders/order_items tables. Same pagination/filter/search semantics
        // as before; client-side name/email filtering still happens below via
        // visibleOrders.
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('filter', filterMode);
        const s = searchQuery.trim();
        if (s) params.set('search', s);

        const res = await fetch(`/api/admin/orders?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const payload = await res.json().catch(() => ({} as any));
        if (!res.ok || !payload?.ok) {
          throw new Error(payload?.error || 'Failed to load orders');
        }

        if (cancelled) return;

        setTotalCount(payload.totalCount ?? 0);
        setOrders((payload.rows ?? []) as AdminOrderRow[]);
      } catch (err: any) {
        console.error('Admin orders: load error', err);
        toast.error(err?.message || 'Failed to load orders');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, page, searchQuery, filterMode]);

  // Client-side search for name/email/id (works even if address_snapshot is string)
  const visibleOrders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return orders;
    return orders.filter((o) => {
      const id = (o.order_number || o.id).toLowerCase();
      const name = (o.customerName || '').toLowerCase();
      const email = (o.customerEmail || '').toLowerCase();
      return id.includes(q) || name.includes(q) || email.includes(q);
    });
  }, [orders, searchQuery]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'cancelled':
        return 'destructive';
      case 'delivered':
      case 'shipped':
      case 'dispatched':
        return 'default';
      case 'paid':
      case 'processing':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const exportOrders = () => toast.success('Exporting orders to CSV...');

  const openDelete = (order: AdminOrderRow) => {
    setDeleteTarget(order);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      setDeleting(true);

      // delete children first (works without FK cascade)
      await adminWrite({ table: 'order_items', op: 'delete', match: { order_id: deleteTarget.id } });

      await adminWrite({ table: 'payments', op: 'delete', match: { order_id: deleteTarget.id } });

      await adminWrite({ table: 'orders', op: 'delete', match: { id: deleteTarget.id } });

      toast.success('Order deleted');
      setDeleteOpen(false);
      setDeleteTarget(null);

      // update UI
      setOrders((prev) => prev.filter((o) => o.id !== deleteTarget.id));
      setTotalCount((c) => Math.max(0, c - 1));

      // if we deleted the only row on this page, go back a page
      if (orders.length === 1 && page > 1) setPage((p) => p - 1);
    } catch (e: any) {
      console.error('Delete order failed:', e);
      toast.error(e?.message || 'Failed to delete order (check RLS/foreign keys)');
    } finally {
      setDeleting(false);
    }
  };

  const showingText = useMemo(() => {
    if (totalCount === 0) return 'Showing 0 orders';
    const start = from + 1;
    const end = Math.min(from + orders.length, totalCount);
    return `Showing ${start}–${end} of ${totalCount}`;
  }, [from, orders.length, totalCount]);

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin')}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Orders</h1>
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
        <div className="mb-6 flex justify-between items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1 max-w-2xl">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by order no, customer name, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex items-center gap-1 rounded-md border bg-background p-1">
              <Button
                size="sm"
                variant={filterMode === 'all' ? 'default' : 'ghost'}
                onClick={() => setFilterMode('all')}
              >
                All
              </Button>
              <Button
                size="sm"
                variant={filterMode === 'awaiting_shipment' ? 'default' : 'ghost'}
                onClick={() => setFilterMode('awaiting_shipment')}
                title="Paid orders without an active DTDC shipment"
              >
                <AlertCircle className="mr-1.5 h-3.5 w-3.5" />
                Awaiting shipment
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{showingText}</span>
            <Button onClick={exportOrders} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Orders</CardTitle>
            <CardDescription>Paginated list (20 per page)</CardDescription>
          </CardHeader>

          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Shipment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Loading orders…
                      </TableCell>
                    </TableRow>
                  ) : visibleOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        {filterMode === 'awaiting_shipment'
                          ? 'No paid orders awaiting shipment.'
                          : 'No orders found'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          {order.order_number || order.id}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{order.customerName}</div>
                            <div className="text-sm text-muted-foreground">{order.customerEmail}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(order.created_at).toLocaleDateString('en-IN')}
                        </TableCell>
                        <TableCell>{order.itemCount}</TableCell>
                        <TableCell>{order.paymentMethod}</TableCell>
                        <TableCell>{formatINR(order.total, order.currency)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusColor(order.status)}>{order.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {order.shipmentAwb ? (
                            <div className="flex items-center gap-1.5 text-xs">
                              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-mono">{order.shipmentAwb}</span>
                            </div>
                          ) : order.status === 'paid' ? (
                            <button
                              type="button"
                              onClick={() => router.push(`/admin/orders/${order.id}`)}
                              className="inline-flex items-center gap-1 text-xs text-amber-700 hover:underline"
                              title="Open the order to create a DTDC shipment"
                            >
                              <AlertCircle className="h-3.5 w-3.5" />
                              Needs shipment
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push(`/admin/orders/${order.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push(`/admin/orders/${order.id}`)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDelete(order)}
                            title="Delete order"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                >
                  Prev
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the order
              {deleteTarget?.order_number ? ` (${deleteTarget.order_number})` : ''} and its related
              items/payments. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
