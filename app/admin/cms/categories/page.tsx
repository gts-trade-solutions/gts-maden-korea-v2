'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabaseClient";
import { adminWrite } from "@/lib/admin/catalog-write";
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, LogOut, RefreshCcw, Search } from 'lucide-react';
import { toast } from 'sonner';

type DbCategory = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  created_at?: string | null;
};

export default function CategoriesManagementPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<DbCategory[]>([]);
  const [q, setQ] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DbCategory | null>(null);
  const [form, setForm] = useState<{ name: string; slug: string; description: string }>({
    name: '',
    slug: '',
    description: '',
  });

  useEffect(() => {
    if (!hasRole('admin')) {
      router.push('/admin');
      return;
    }
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRole]);

  async function loadCategories() {
    setLoading(true);
    const { data, error } = await supabase
      .from('categories')
      .select('id, slug, name, description, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Failed to load categories');
      console.error(error);
      setCategories([]);
    } else {
      setCategories(data ?? []);
    }
    setLoading(false);
  }

  function genSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function openDialog(cat?: DbCategory) {
    if (cat) {
      setEditing(cat);
      setForm({
        name: cat.name,
        slug: cat.slug,
        description: cat.description || '',
      });
    } else {
      setEditing(null);
      setForm({
        name: '',
        slug: '',
        description: '',
      });
    }
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    const slug = form.slug.trim() || genSlug(form.name);
    setSaving(true);

    if (editing) {
      // UPDATE
      try {
        await adminWrite({
          table: 'categories',
          op: 'update',
          data: {
            name: form.name.trim(),
            slug,
            description: form.description.trim() || null,
          },
          match: { id: editing.id },
        });
      } catch (error) {
        setSaving(false);
        if ((error as any)?.code === '23505') {
          toast.error('Slug already exists. Please choose a different slug.');
        } else {
          toast.error('Failed to update category');
        }
        console.error(error);
        return;
      }
      setSaving(false);
      toast.success('Category updated');
    } else {
      // CREATE
      try {
        await adminWrite({
          table: 'categories',
          op: 'insert',
          data: {
            name: form.name.trim(),
            slug,
            description: form.description.trim() || null,
          },
        });
      } catch (error) {
        setSaving(false);
        if ((error as any)?.code === '23505') {
          toast.error('Slug already exists. Please choose a different slug.');
        } else {
          toast.error('Failed to create category');
        }
        console.error(error);
        return;
      }
      setSaving(false);
      toast.success('Category created');
    }

    setDialogOpen(false);
    await loadCategories();
  }

  async function handleDelete(cat: DbCategory) {
    // Optional: warn if products exist (delete will fail w/ RESTRICT)
    if (!confirm(`Delete category "${cat.name}"? This cannot be undone.`)) return;

    try {
      await adminWrite({ table: 'categories', op: 'delete', match: { id: cat.id } });
    } catch (error) {
      const msg =
        (error as any)?.code === '23503'
          ? 'Cannot delete: products are linked to this category. Move or update those products first.'
          : 'Failed to delete category';
      toast.error(msg);
      console.error(error);
      return;
    }
    toast.success('Category deleted');
    await loadCategories();
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.slug.toLowerCase().includes(s) ||
        (c.description || '').toLowerCase().includes(s)
    );
  }, [q, categories]);

  if (!hasRole('admin')) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin/cms')}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Category Management</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <Button variant="outline" size="sm" onClick={async () => { await logout(); toast.success('Logged out'); router.push('/'); }}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle>Categories</CardTitle>
                <CardDescription>Create, edit, and delete product categories</CardDescription>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8 w-[220px]"
                    placeholder="Search name or slug…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={loadCategories}>
                  <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
                </Button>
                <Button onClick={() => openDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Category
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-muted mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No categories</h3>
                <p className="text-muted-foreground mb-6">Create your first category to get started.</p>
                <Button onClick={() => openDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Category
                </Button>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((cat) => (
                      <TableRow key={cat.id}>
                        <TableCell className="font-medium">{cat.name}</TableCell>
                        <TableCell className="text-muted-foreground">{cat.slug}</TableCell>
                        <TableCell className="max-w-[420px]">
                          <span className="text-muted-foreground line-clamp-2">{cat.description}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {cat.created_at
                              ? new Date(cat.created_at).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openDialog(cat)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(cat)}>
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

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Category' : 'Add Category'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update category details' : 'Create a new product category'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({
                    ...f,
                    name,
                    slug: editing ? f.slug : genSlug(name),
                  }));
                }}
                placeholder="Sunscreen"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="sunscreen"
              />
              <p className="text-xs text-muted-foreground">Must be unique. This appears in the URL: /c/&lt;slug&gt;</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Sun protection products"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
