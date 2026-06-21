'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { supabase } from "@/lib/supabaseClient";
import { resolveMediaUrl } from "@/lib/storage/backend";
import { CustomerLayout } from '@/components/CustomerLayout';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCart } from '@/lib/contexts/CartContext';
import { useWishlist } from '@/lib/contexts/WishlistContext';
import { useCurrency } from '@/lib/contexts/CurrencyContext';
import { fetchCountryOffers } from "@/lib/pricing";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

function readCountryFromCookie(): string {
  if (typeof document === "undefined") return DEFAULT_COUNTRY;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("mik_country="));
  const raw = match ? decodeURIComponent(match.split("=")[1] ?? "") : "";
  return isSupportedCountry(raw) ? raw : DEFAULT_COUNTRY;
}

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Heart,
  ShoppingCart,
  Trash2,
  Star,
  Search,
  LogIn,
} from 'lucide-react';

type ProductRow = {
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
  is_bundle?: boolean | null;
  brands?: { name?: string | null } | null;
  // Phase 1 country offer — when set, effectiveUnitPrice uses it
  // instead of sale_price/price.
  effective_price?: number | null;
};

// `id` is wishlist_items.id when authenticated. For anonymous users
// there's no DB row, so `id` falls back to `product_id` and `note` /
// `priority` are absent — the per-row Note + Priority controls are
// only rendered when authenticated.
type WishlistRow = {
  id: string;
  product_id: string;
  note?: string | null;
  priority: number;
  created_at: string;
  product: ProductRow;
  hero_image_url?: string | null;
};

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  return resolveMediaUrl('product-media', path) ?? null;
}

function isSaleActive(start?: string | null, end?: string | null) {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

function effectiveUnitPrice(p: ProductRow) {
  if (p.effective_price != null) return Number(p.effective_price);
  const saleOk =
    p.sale_price != null && isSaleActive(p.sale_starts_at, p.sale_ends_at);
  return saleOk && p.sale_price != null ? p.sale_price : p.price ?? 0;
}

export default function WishlistPage() {
  const router = useRouter();
  const t = useTranslations('account');
  const tc = useTranslations('header');
  const { isAuthenticated, ready: authReady } = useAuth();
  const { addItem } = useCart();
  const { wishlistItems, removeFromWishlist } = useWishlist();
  const { formatPrice } = useCurrency();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WishlistRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<
    'added_desc' | 'added_asc' | 'price_asc' | 'price_desc' | 'prio_desc' | 'prio_asc'
  >('added_desc');
  const [addingOneId, setAddingOneId] = useState<string | null>(null);
  const [addingSelected, setAddingSelected] = useState(false);

  // Load wishlist rows. Two code paths because the data shapes differ:
  //  - Auth: read from `wishlist_items` (RLS-scoped) so we get the
  //    note/priority metadata for the richer editor below.
  //  - Anon: read product IDs from the context (localStorage-backed),
  //    fetch the products in bulk, synthesise minimal WishlistRows.
  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;
    (async () => {
      setLoading(true);

      if (isAuthenticated) {
        // Wishlist metadata (product_id / priority / note) comes from the
        // user-scoped server route — the wishlist_items table is RLS-
        // protected and unreadable from the browser anon client under
        // NextAuth. The product/catalog rows below are still read directly
        // from the public `products` table.
        let metaItems: Array<{ product_id: string; priority?: number | null; note?: string | null }> = [];
        try {
          const res = await fetch('/api/wishlist', { credentials: 'include' });
          const payload = await res.json().catch(() => null);
          if (!res.ok || !payload?.ok) {
            throw new Error(payload?.error || 'WISHLIST_LOAD_FAILED');
          }
          metaItems = Array.isArray(payload.items) ? payload.items : [];
        } catch (err) {
          if (cancelled) return;
          console.error(err);
          toast.error(t('wishlistErrLoad'));
          setRows([]);
          setLoading(false);
          return;
        }

        if (cancelled) return;

        if (metaItems.length === 0) {
          setRows([]);
          setLoading(false);
          return;
        }

        // Index metadata by product_id, preserving the server's ordering so
        // the synthesised created_at keeps "newest first" stable.
        const metaIds = metaItems.map((m) => m.product_id).filter(Boolean);
        const priorityById = new Map<string, number>();
        const noteById = new Map<string, string | null>();
        const orderById = new Map<string, number>();
        metaItems.forEach((m, idx) => {
          priorityById.set(m.product_id, m.priority ?? 3);
          noteById.set(m.product_id, m.note ?? null);
          orderById.set(m.product_id, idx);
        });

        const { data: prodData, error: prodErr } = await supabase
          .from('products')
          .select(
            'id, slug, name, price, currency, compare_at_price, sale_price, sale_starts_at, sale_ends_at, hero_image_path, is_bundle, brands ( name )'
          )
          .in('id', metaIds);

        if (cancelled) return;

        if (prodErr) {
          console.error(prodErr);
          toast.error(t('wishlistErrLoad'));
          setRows([]);
          setLoading(false);
          return;
        }

        const nowMs = Date.now();
        const mapped = (prodData ?? []).map((p: any) => {
          const idx = orderById.get(p.id) ?? 0;
          return {
            // No wishlist_items.id is exposed by the route — use product_id
            // as the row key. Update writes target product_id too.
            id: p.id,
            product_id: p.id,
            note: noteById.get(p.id) ?? null,
            priority: priorityById.get(p.id) ?? 3,
            // Synthesised so "newest first" mirrors the server ordering.
            created_at: new Date(nowMs - idx).toISOString(),
            product: p as ProductRow,
            hero_image_url: storagePublicUrl(p.hero_image_path),
          } as WishlistRow;
        });

        // Phase 1 country offers — attach effective_price per product
        // so list display + sorting + add-to-cart math reflects the
        // visitor's country.
        const productIds = mapped.map((r) => r.product.id);
        const offers = await fetchCountryOffers(
          productIds,
          readCountryFromCookie(),
          supabase
        );

        if (cancelled) return;

        const withOffers = mapped.map((r) =>
          offers[r.product.id] != null
            ? {
                ...r,
                product: { ...r.product, effective_price: offers[r.product.id] },
              }
            : r
        );

        setRows(withOffers);
        setLoading(false);
        return;
      }

      // Anonymous path. The product IDs in the context are kept in sync
      // with localStorage by WishlistProvider; we just need their full
      // product rows from the public `products` table.
      const ids = wishlistItems;
      if (ids.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('products')
        .select(
          'id, slug, name, price, currency, compare_at_price, sale_price, sale_starts_at, sale_ends_at, hero_image_path, is_bundle, brands ( name )'
        )
        .in('id', ids);

      if (cancelled) return;

      if (error) {
        console.error(error);
        toast.error(t('wishlistErrLoad'));
        setRows([]);
        setLoading(false);
        return;
      }

      // Phase 1 country offers for anon path. Same as auth path
      // above — augments each product's effective_price.
      const anonOffers = await fetchCountryOffers(
        (data ?? []).map((p: any) => p.id),
        readCountryFromCookie(),
        supabase
      );
      const synthRows: WishlistRow[] = (data ?? []).map((p: any) => ({
        id: p.id, // no DB row — fall back to product id
        product_id: p.id,
        note: null,
        priority: 3,
        created_at: new Date().toISOString(),
        product: {
          ...p,
          effective_price: anonOffers[p.id] ?? null,
        } as ProductRow,
        hero_image_url: storagePublicUrl(p.hero_image_path),
      }));

      setRows(synthRows);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `wishlistItems` from the WishlistContext is intentionally NOT a
    // dep here. The auth path queries `wishlist_items` directly and
    // doesn't read wishlistItems at all; the anon path reads it once
    // at mount. Including it caused a double-fetch on direct URL load
    // / hard refresh, because WishlistContext's own effect updated
    // wishlistItems shortly after the page's first fetch finished —
    // a new array reference re-triggered this effect and re-queried
    // the same data.
    //
    // In-app mutations (add/remove from this page) are handled by
    // local setRows() calls below, so the page stays in sync without
    // needing wishlistItems as a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, isAuthenticated, t]);

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (checked) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  };

  const selectAll = (checked: boolean) => {
    setSelected(checked ? new Set(filtered.map((r) => r.id)) : new Set());
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    let list = !s
      ? rows
      : rows.filter(
          (r) =>
            r.product.name.toLowerCase().includes(s) ||
            (r.product.brands?.name || '').toLowerCase().includes(s)
        );

    list = [...list].sort((a, b) => {
      if (sort === 'added_desc') return +new Date(b.created_at) - +new Date(a.created_at);
      if (sort === 'added_asc') return +new Date(a.created_at) - +new Date(b.created_at);
      if (sort === 'prio_desc') return b.priority - a.priority;
      if (sort === 'prio_asc') return a.priority - b.priority;

      const ap = effectiveUnitPrice(a.product);
      const bp = effectiveUnitPrice(b.product);

      if (sort === 'price_asc') return ap - bp;
      if (sort === 'price_desc') return bp - ap;

      return 0;
    });

    return list;
  }, [rows, q, sort]);
  const hasRows = rows.length > 0;
  const hasNoMatches = hasRows && filtered.length === 0;

  // Remove via context — handles both anon (localStorage only) and auth
  // (DB delete + localStorage). The auth path used to call Supabase
  // directly here to also drop the wishlist_items row; the context now
  // owns that logic so a single removeFromWishlist call works for both.
  const onRemove = async (id: string) => {
    if (!window.confirm(t('wishlistRemoveConfirm'))) return;
    const item = rows.find((r) => r.id === id);
    if (!item) return;
    removeFromWishlist(item.product_id);
    setRows((prev) => prev.filter((r) => r.product_id !== item.product_id));
    setSelected((prev) => {
      const c = new Set(prev);
      c.delete(id);
      return c;
    });
    toast.success(t('wishlistRemovedToast'));
  };

  // Per-row priority + note: auth-only (anon has no DB row to update).
  // Writes go through the user-scoped server route — wishlist_items is
  // RLS-protected and unwritable from the browser anon client under
  // NextAuth. Rows are keyed by product_id (no wishlist_items.id is
  // exposed by the route), so update writes target product_id.
  const onUpdatePriority = async (id: string, priority: number) => {
    if (!isAuthenticated) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    try {
      const res = await fetch('/api/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ op: 'update', product_id: row.product_id, priority }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || 'WISHLIST_PRIORITY_FAILED');
      }
    } catch (error) {
      console.error(error);
      toast.error(t('wishlistErrPriority'));
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, priority } : r)));
  };

  const onSaveNote = async (id: string, note: string) => {
    if (!isAuthenticated) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    try {
      const res = await fetch('/api/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ op: 'update', product_id: row.product_id, note: note || null }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || 'WISHLIST_NOTE_FAILED');
      }
    } catch (error) {
      console.error(error);
      toast.error(t('wishlistErrNote'));
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, note } : r)));
    toast.success(t('wishlistNoteSavedToast'));
  };

  const addToCartOne = async (productId: string) => {
    try {
      setAddingOneId(productId);
      await addItem(productId, 1);
      toast.success(t('wishlistAddedToCartToast'));
    } catch (error) {
      console.error(error);
      toast.error(t('wishlistErrAddCart'));
    } finally {
      setAddingOneId(null);
    }
  };

  const addSelectedToCart = async () => {
    if (selected.size === 0) return;

    try {
      setAddingSelected(true);

      for (const r of rows) {
        if (selected.has(r.id)) {
          await addItem(r.product.id, 1);
        }
      }

      toast.success(t('wishlistSelectedAddedToast'));
      router.push('/cart');
    } catch (error) {
      console.error(error);
      toast.error(t('wishlistErrAddSelected'));
    } finally {
      setAddingSelected(false);
    }
  };

  const removeSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(t('wishlistRemoveSelectedConfirm', { count: selected.size }))) return;

    const selectedRows = rows.filter((r) => selected.has(r.id));
    selectedRows.forEach((r) => removeFromWishlist(r.product_id));
    setRows((prev) => prev.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
    toast.success(t('wishlistRemovedSelectedToast'));
  };

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Heart className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">{t('wishlistTitle')}</h1>
          </div>
          <p className="text-muted-foreground">
            {t('wishlistSavedCount', { count: rows.length })}
          </p>
        </div>

        {/* Anonymous-visitor banner — wishlist persists locally, but a
            real account lets it follow them across devices. Solid card
            so the value prop is unmissable, vs. the prior dashed hint. */}
        {authReady && !isAuthenticated && hasRows && (
          <Card className="mb-6 border-pink-200 bg-pink-50">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Heart className="h-5 w-5 text-pink-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-pink-900">
                    {t('wishlistAnonPrompt')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button asChild size="sm" className="bg-pink-600 hover:bg-pink-700 text-white">
                  <Link href={`/auth/register?redirect=/wishlist`}>
                    {tc('joinFree')}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="border-pink-300 text-pink-900 hover:bg-pink-100">
                  <Link href={`/auth/login?redirect=/wishlist`}>
                    <LogIn className="h-4 w-4 mr-2" />
                    {t('wishlistAnonSignInCta')}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('wishlistManage')}</CardTitle>
          </CardHeader>

          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                id="selectAll"
                checked={filtered.length > 0 && selected.size === filtered.length}
                onCheckedChange={(v: any) => selectAll(!!v)}
              />
              <label htmlFor="selectAll" className="text-sm">
                {t('wishlistSelectAll')}
              </label>

              {selected.size > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {t('wishlistSelectedBadge', { count: selected.size })}
                </Badge>
              )}
            </div>

            <div className="flex flex-1 items-center gap-2 md:max-w-md">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('wishlistSearchPlaceholder')}
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
              >
                <option value="added_desc">{t('wishlistSortNewest')}</option>
                <option value="added_asc">{t('wishlistSortOldest')}</option>
                <option value="price_asc">{t('wishlistSortPriceAsc')}</option>
                <option value="price_desc">{t('wishlistSortPriceDesc')}</option>
                {/* Priority sorts only meaningful when there's per-row
                    priority data — i.e. authenticated users. */}
                {isAuthenticated && (
                  <>
                    <option value="prio_desc">{t('wishlistSortPrioHigh')}</option>
                    <option value="prio_asc">{t('wishlistSortPrioLow')}</option>
                  </>
                )}
              </select>

              <Button
                variant="outline"
                onClick={addSelectedToCart}
                disabled={selected.size === 0 || addingSelected}
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                {addingSelected ? t('wishlistAdding') : t('wishlistAddSelected')}
              </Button>

              <Button
                variant="outline"
                onClick={removeSelected}
                disabled={selected.size === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('wishlistRemoveSelected')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-muted-foreground">{t('wishlistLoading')}</div>
        ) : !hasRows ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Heart className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">{t('wishlistEmptyTitle')}</h2>
              <p className="text-muted-foreground mb-6">{t('wishlistEmptyBody')}</p>
              <Button asChild>
                <Link href="/products">{t('wishlistBrowseCta')}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : hasNoMatches ? (
          <Card>
            <CardContent className="py-16 text-center">
              <h2 className="text-xl font-semibold mb-2">{t('wishlistNoMatchesTitle')}</h2>
              <p className="text-muted-foreground mb-6">{t('wishlistNoMatchesBody')}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setQ('');
                  setSort('added_desc');
                }}
              >
                {t('wishlistResetFilters')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filtered.map((row) => {
              const product = row.product;
              const unitPrice = effectiveUnitPrice(product);
              const compareAt = product.compare_at_price;

              return (
                <Card key={row.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col lg:flex-row gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={(v: any) => toggleSelect(row.id, !!v)}
                        />

                        <Link
                          href={`/products/${product.slug}`}
                          className="h-24 w-24 rounded-md overflow-hidden bg-muted shrink-0"
                        >
                          {row.hero_image_url ? (
                            <img
                              src={row.hero_image_url}
                              alt={product.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                              {t('wishlistNoImage')}
                            </div>
                          )}
                        </Link>

                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/products/${product.slug}`}
                            className="font-semibold text-lg line-clamp-2 hover:underline"
                          >
                            {product.name}
                          </Link>

                          <div className="text-sm text-muted-foreground mt-1">
                            {product.brands?.name || t('wishlistNoBrand')}
                          </div>

                          <div className="flex items-center gap-3 mt-3 flex-wrap">
                            <div className="font-bold text-lg">
                              {formatPrice(unitPrice)}
                            </div>

                            {compareAt && compareAt > unitPrice ? (
                              <div className="text-sm text-muted-foreground line-through">
                                {formatPrice(compareAt)}
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              onClick={() => addToCartOne(product.id)}
                              disabled={addingOneId === product.id}
                            >
                              <ShoppingCart className="h-4 w-4 mr-2" />
                              {addingOneId === product.id ? t('wishlistAdding') : t('wishlistAddOneBtn')}
                            </Button>

                            <Button
                              variant="outline"
                              onClick={() => onRemove(row.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t('wishlistRemoveBtn')}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Note + priority editor — auth-only. Anon visitors
                          don't have a DB row to persist these against. */}
                      {isAuthenticated && (
                        <>
                          <Separator orientation="vertical" className="hidden lg:block h-auto" />
                          <div className="lg:w-72 space-y-4">
                            <div>
                              <label className="text-sm font-medium mb-2 block">
                                {t('wishlistPriorityLabel')}
                              </label>
                              <div className="flex gap-2">
                                {[1, 2, 3, 4, 5].map((p) => (
                                  <button
                                    key={p}
                                    type="button"
                                    onClick={() => onUpdatePriority(row.id, p)}
                                    className={`rounded-md border px-2 py-1 text-sm ${
                                      row.priority === p ? 'bg-primary text-primary-foreground' : ''
                                    }`}
                                  >
                                    <Star className="h-4 w-4 inline mr-1" />
                                    {p}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <label className="text-sm font-medium mb-2 block">
                                {t('wishlistNoteLabel')}
                              </label>
                              <Input
                                defaultValue={row.note || ''}
                                placeholder={t('wishlistNotePlaceholder')}
                                onBlur={(e) => onSaveNote(row.id, e.target.value)}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
