'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabaseClient";
import { mirrorMysql } from "@/lib/admin/mirror-mysql";
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Filter, Edit, Trash2, Save, Eye, EyeOff, LogOut } from 'lucide-react';

// If you already have a Supabase client wrapper, replace this with your import.
type ProductRow = {
  id: string;
  slug: string;
  name: string;
  sku: string | null;
  price: number | null;
  currency: string | null;
  is_published: boolean;
  stock_qty: number;
  brand_id: string | null;
  category_id: string | null;
  vendor_id: string | null;
  is_featured: boolean;
  featured_rank: number | null;
  is_trending: boolean;
  new_until: string | null; // ISO or null
};

type BrandRow = { id: string; name: string | null; slug: string | null };
type CategoryRow = { id: string; name: string | null; slug: string | null };
type VendorRow = { id: string; display_name: string | null; name?: string | null };

type AdminDraft = {
  is_featured: boolean;
  featured_rank: number | '' | null;
  is_trending: boolean;
  new_until: string; // yyyy-mm-dd (for <input type="date">)
};

function toDateInputValue(ts?: string | null) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function AdminProductsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);

  const [adminDrafts, setAdminDrafts] = useState<Record<string, AdminDraft>>({});

  // filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPublish, setFilterPublish] = useState<'all' | 'published' | 'unpublished'>('all');
  const [showFilters, setShowFilters] = useState(false);

  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Optional: ensure current user is admin (adapt to your setup)
        // const { data: isAdmin } = await supabase.rpc('is_admin');
        // if (!isAdmin) { router.replace('/admin'); return; }

        // Read from MySQL (source of truth) via the admin catalog endpoint —
        // was 4 browser-direct Supabase selects. See migration/SUPABASE_DECOMMISSION.md.
        const res = await fetch('/api/admin/catalog/products', { credentials: 'include', cache: 'no-store' });
        const payload = await res.json();
        if (!res.ok || !payload?.ok) throw new Error(payload?.error || 'Failed to load products');

        const prod = (payload.products ?? []) as ProductRow[];
        setProducts(prod);
        setBrands((payload.brands ?? []) as BrandRow[]);
        setCategories((payload.categories ?? []) as CategoryRow[]);
        setVendors((payload.vendors ?? []) as VendorRow[]);

        // seed drafts
        const drafts: Record<string, AdminDraft> = {};
        for (const p of prod) {
          drafts[p.id] = {
            is_featured: !!p.is_featured,
            featured_rank: p.featured_rank ?? '',
            is_trending: !!p.is_trending,
            new_until: toDateInputValue(p.new_until),
          };
        }
        setAdminDrafts(drafts);
      } catch (e: any) {
        toast.error(e?.message || 'Failed to load products');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const brandMap = useMemo(() => Object.fromEntries(brands.map(b => [b.id, b.name || b.slug || b.id])), [brands]);
  const categoryMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c.name || c.slug || c.id])), [categories]);
  const vendorMap = useMemo(() => Object.fromEntries(vendors.map(v => [v.id, v.display_name || v.name || v.id])), [vendors]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter(p => {
      const matchesQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (brandMap[p.brand_id || ''] || '').toLowerCase().includes(q) ||
        (vendorMap[p.vendor_id || ''] || '').toLowerCase().includes(q);

      const matchesBrand = filterBrand === 'all' || p.brand_id === filterBrand;
      const matchesCat = filterCategory === 'all' || p.category_id === filterCategory;
      const matchesPub =
        filterPublish === 'all' ||
        (filterPublish === 'published' ? p.is_published : !p.is_published);

      return matchesQ && matchesBrand && matchesCat && matchesPub;
    });
  }, [products, searchQuery, filterBrand, filterCategory, filterPublish, brandMap, vendorMap]);

  const toggleSelect = (id: string) => {
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selected.length === filtered.length) setSelected([]);
    else setSelected(filtered.map(p => p.id));
  };

  const saveAdminFields = async (id: string) => {
    const draft = adminDrafts[id];
    if (!draft) return;

    if (draft.featured_rank !== '' && draft.featured_rank != null) {
      const n = Number(draft.featured_rank);
      if (!Number.isFinite(n) || n < 0) {
        toast.error('Featured rank must be a non-negative number');
        return;
      }
    }

    const payload: Partial<ProductRow> = {
      is_featured: !!draft.is_featured,
      featured_rank:
        draft.featured_rank === '' || draft.featured_rank == null ? null : Number(draft.featured_rank),
      is_trending: !!draft.is_trending,
      new_until: draft.new_until ? new Date(`${draft.new_until}T00:00:00Z`).toISOString() : null,
    };

    try {
      setSaving(s => ({ ...s, [id]: true }));
      const res = await fetch('/api/admin/catalog/products', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'updateFields', id, data: payload }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Save failed');

      setProducts(prev =>
        prev.map(p => (p.id === id ? { ...p, ...payload } as ProductRow : p))
      );
      toast.success('Saved');
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(s => ({ ...s, [id]: false }));
    }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
      setDeleting(s => ({ ...s, [id]: true }));
      const res = await fetch('/api/admin/catalog/products', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'delete', id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Delete failed');
      setProducts(prev => prev.filter(p => p.id !== id));
      setSelected(prev => prev.filter(x => x !== id));
      toast.success('Deleted');
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    } finally {
      setDeleting(s => ({ ...s, [id]: false }));
    }
  };

  const bulkPublish = async (publish: boolean) => {
    if (selected.length === 0) return toast.error('Select products first');
    try {
      const res = await fetch('/api/admin/catalog/products', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'bulkPublish', ids: selected, publish }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Bulk update failed');
      setProducts(prev => prev.map(p => (selected.includes(p.id) ? { ...p, is_published: publish } : p)));
      toast.success(publish ? 'Published' : 'Hidden');
      setSelected([]);
    } catch (e: any) {
      toast.error(e?.message || 'Bulk update failed');
    }
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin')}>← Back</Button>
            <h1 className="text-2xl font-bold">Products Management</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/admin/products/missing-weight')}
              title="Published products without net_weight_g — required for international shipping"
            >
              Missing weight audit
            </Button>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Catalog</CardTitle>
                <CardDescription>Admins can edit Featured / Rank / Trending / New Arrival and delete any product.</CardDescription>
              </div>
              {/* Admin cannot create new products → no Add button */}
            </div>
          </CardHeader>

          <CardContent>
            <div className="mb-6 space-y-4">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search name, brand, vendor, or SKU…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button variant="outline" onClick={() => setShowFilters(v => !v)}>
                  <Filter className="mr-2 h-4 w-4" /> Filters
                </Button>
              </div>

              {showFilters && (
                <div className="grid md:grid-cols-3 gap-4 p-4 border rounded-lg bg-muted/50">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Brand</label>
                    <Select value={filterBrand} onValueChange={setFilterBrand}>
                      <SelectTrigger><SelectValue placeholder="All brands" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All brands</SelectItem>
                        {brands.map(b => (
                          <SelectItem key={b.id} value={b.id}>{b.name || b.slug || b.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Category</label>
                    <Select value={filterCategory} onValueChange={setFilterCategory}>
                      <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name || c.slug || c.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Publish</label>
                    <Select value={filterPublish} onValueChange={(v: any) => setFilterPublish(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="unpublished">Unpublished</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {selected.length > 0 && (
                <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg">
                  <span className="text-sm font-medium">{selected.length} selected</span>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => bulkPublish(true)}>
                      <Eye className="h-4 w-4 mr-1" /> Publish
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => bulkPublish(false)}>
                      <EyeOff className="h-4 w-4 mr-1" /> Hide
                    </Button>
                    {/* You can add bulk delete if desired */}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selected.length === filtered.length && filtered.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead>Featured</TableHead>
                    <TableHead>Feat. Rank</TableHead>
                    <TableHead>Trending</TableHead>
                    <TableHead>New Until</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={12} className="text-center py-8">Loading…</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No products found</TableCell></TableRow>
                  ) : (
                    filtered.map(p => {
                      const draft = adminDrafts[p.id] ?? {
                        is_featured: !!p.is_featured,
                        featured_rank: p.featured_rank ?? '',
                        is_trending: !!p.is_trending,
                        new_until: toDateInputValue(p.new_until),
                      };
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <Checkbox
                              checked={selected.includes(p.id)}
                              onCheckedChange={() => toggleSelect(p.id)}
                            />
                          </TableCell>

                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span>{p.name}</span>
                              <span className="text-xs text-muted-foreground">SKU: {p.sku || '—'}</span>
                            </div>
                          </TableCell>

                          <TableCell>{vendorMap[p.vendor_id || ''] || '—'}</TableCell>
                          <TableCell>{brandMap[p.brand_id || ''] || '—'}</TableCell>
                          <TableCell>₹{Number(p.price || 0).toLocaleString('en-IN')}</TableCell>
                          <TableCell>{p.stock_qty ?? 0}</TableCell>

                          <TableCell>
                            <Badge variant={p.is_published ? 'default' : 'secondary'}>
                              {p.is_published ? 'Published' : 'Hidden'}
                            </Badge>
                          </TableCell>

                          {/* Admin inline controls */}
                          <TableCell>
                            <Checkbox
                              checked={!!draft.is_featured}
                              onCheckedChange={(v) =>
                                setAdminDrafts(s => ({ ...s, [p.id]: { ...draft, is_featured: !!v } }))
                              }
                            />
                          </TableCell>

                          <TableCell className="max-w-[120px]">
                            <Input
                              inputMode="numeric"
                              type="number"
                              min={0}
                              placeholder="rank"
                              value={draft.featured_rank as any}
                              onChange={(e) =>
                                setAdminDrafts(s => ({
                                  ...s,
                                  [p.id]: { ...draft, featured_rank: e.target.value === '' ? '' : Number(e.target.value) },
                                }))
                              }
                            />
                          </TableCell>

                          <TableCell>
                            <Checkbox
                              checked={!!draft.is_trending}
                              onCheckedChange={(v) =>
                                setAdminDrafts(s => ({ ...s, [p.id]: { ...draft, is_trending: !!v } }))
                              }
                            />
                          </TableCell>

                          <TableCell className="max-w-[160px]">
                            <Input
                              type="date"
                              value={draft.new_until}
                              onChange={(e) =>
                                setAdminDrafts(s => ({ ...s, [p.id]: { ...draft, new_until: e.target.value } }))
                              }
                            />
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {/* Optional: open a read-only detail page if you have one */}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => router.push(`/admin/products/${p.id}`)}
                                title="View details"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => saveAdminFields(p.id)}
                                disabled={!!saving[p.id]}
                                title="Save admin fields"
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteProduct(p.id)}
                                disabled={!!deleting[p.id]}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
