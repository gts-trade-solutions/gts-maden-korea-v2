"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { uploadMedia } from "@/lib/storage/upload-client";
import { resolveMediaUrl } from "@/lib/storage/backend";
import { adminWrite } from "@/lib/admin/catalog-write";
import { useAuth } from "@/lib/contexts/AuthContext";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Edit,
  Trash2,
  LogOut,
  RefreshCcw,
  Search,
  ImageIcon,
} from "lucide-react";

type DbBrand = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  thumbnail_path?: string | null;
  thumbnail_url?: string | null;
  active?: boolean;
  position?: number;
  created_at?: string | null;
};

const BUCKET = "site-assets"; // or 'product-media'
const pathFor = (id: string, file: File, kind: "thumb") => {
  const ext =
    (file.name.split(".").pop() || "jpg")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";
  return `brands/${id}/${kind}.${ext}`;
};

export default function BrandsManagementPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<DbBrand[]>([]);
  const [q, setQ] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DbBrand | null>(null);
  const [form, setForm] = useState<{
    name: string;
    slug: string;
    description: string;
    active: boolean;
    position: number;
  }>({
    name: "",
    slug: "",
    description: "",
    active: true,
    position: 10,
  });
  const [thumbFile, setThumbFile] = useState<File | null>(null);

  useEffect(() => {
    if (!hasRole("admin")) {
      router.push(typeof window !== "undefined" ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}` : "/admin");
      return;
    }
    loadBrands();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRole]);

  async function loadBrands() {
    setLoading(true);
    const { data, error } = await supabase
      .from("brands")
      .select(
        "id, slug, name, description, thumbnail_path, thumbnail_url, active, position, created_at"
      )
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      toast.error("Failed to load brands");
      setBrands([]);
    } else {
      setBrands(data ?? []);
    }
    setLoading(false);
  }

  function genSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function openDialog(brand?: DbBrand) {
    if (brand) {
      setEditing(brand);
      setForm({
        name: brand.name,
        slug: brand.slug,
        description: brand.description || "",
        active: brand.active ?? true,
        position: brand.position ?? 10,
      });
      setThumbFile(null);
    } else {
      setEditing(null);
      setForm({
        name: "",
        slug: "",
        description: "",
        active: true,
        position: (brands.at(-1)?.position ?? 0) + 10,
      });
      setThumbFile(null);
    }
    setDialogOpen(true);
  }

  async function uploadThumbIfAny(brandId: string) {
    if (!thumbFile)
      return { thumbnail_path: undefined, thumbnail_url: undefined };
    const key = pathFor(brandId, thumbFile, "thumb");
    const { path, publicUrl } = await uploadMedia(BUCKET, key, thumbFile, {
      upsert: true,
    });
    return { thumbnail_path: path, thumbnail_url: publicUrl };
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const slug = (form.slug || genSlug(form.name)).trim();

    try {
      if (editing) {
        // update base
        await adminWrite({
          table: "brands",
          op: "update",
          data: {
            name: form.name.trim(),
            slug,
            description: form.description.trim() || null,
            active: form.active,
            position: form.position,
          },
          match: { id: editing.id },
        });

        // optional thumbnail upload
        if (thumbFile) {
          const { thumbnail_path, thumbnail_url } = await uploadThumbIfAny(
            editing.id
          );
          await adminWrite({
            table: "brands",
            op: "update",
            data: { thumbnail_path, thumbnail_url },
            match: { id: editing.id },
          });
        }

        toast.success("Brand updated");
      } else {
        // create base
        const row = await adminWrite({
          table: "brands",
          op: "insert",
          data: {
            name: form.name.trim(),
            slug,
            description: form.description.trim() || null,
            active: form.active,
            position: form.position,
          },
        });
        const id = (row as any).id as string;

        // optional thumbnail upload
        if (thumbFile) {
          const { thumbnail_path, thumbnail_url } = await uploadThumbIfAny(id);
          await adminWrite({
            table: "brands",
            op: "update",
            data: { thumbnail_path, thumbnail_url },
            match: { id },
          });
        }

        toast.success("Brand created");
      }

      setDialogOpen(false);
      await loadBrands();
    } catch (err: any) {
      if (err?.code === "23505") {
        toast.error("Slug already exists. Choose a different one.");
      } else {
        toast.error(err.message || "Save failed");
      }
    }
  }

  async function handleDelete(brand: DbBrand) {
    if (
      !confirm(
        `Delete brand "${brand.name}"? This will set product.brand_id = NULL.`
      )
    )
      return;
    try {
      await adminWrite({
        table: "brands",
        op: "delete",
        match: { id: brand.id },
      });
    } catch (error) {
      toast.error("Failed to delete brand");
      console.error(error);
      return;
    }
    toast.success("Brand deleted");
    await loadBrands();
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return brands;
    return brands.filter(
      (b) =>
        b.name.toLowerCase().includes(s) ||
        b.slug.toLowerCase().includes(s) ||
        (b.description || "").toLowerCase().includes(s)
    );
  }, [q, brands]);

  if (!hasRole("admin")) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push("/admin/cms")}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Brand Management</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout();
                toast.success("Logged out");
                router.push("/");
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle>Brands</CardTitle>
                <CardDescription>
                  Create, edit, and delete brands. Upload a thumbnail for the
                  carousel.
                </CardDescription>
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
                <Button variant="outline" onClick={loadBrands}>
                  <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
                </Button>
                <Button onClick={() => openDialog()}>
                  <Plus className="mr-2 h-4 w-4" /> Add Brand
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-muted mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No brands</h3>
                <p className="text-muted-foreground mb-6">
                  Create your first brand to get started.
                </p>
                <Button onClick={() => openDialog()}>
                  <Plus className="mr-2 h-4 w-4" /> Add Brand
                </Button>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thumbnail</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <div className="w-16 h-16 bg-muted rounded overflow-hidden grid place-items-center">
                            {b.thumbnail_url || b.thumbnail_path ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={
                                  b.thumbnail_url ||
                                  resolveMediaUrl(BUCKET, b.thumbnail_path)
                                }
                                alt={b.name}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <ImageIcon className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {b.slug}
                        </TableCell>
                        <TableCell className="max-w-[420px]">
                          <span className="text-muted-foreground line-clamp-2">
                            {b.description}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={b.active ? "default" : "outline"}>
                            {b.active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>{b.position ?? 10}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDialog(b)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(b)}
                            >
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

      {/* modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Brand" : "Add Brand"}</DialogTitle>
            <DialogDescription>
              Upload a thumbnail to show in “Shop by Brand”.
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
                placeholder="COSRX"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) =>
                  setForm((f) => ({ ...f, slug: e.target.value }))
                }
                placeholder="cosrx"
              />
              <p className="text-xs text-muted-foreground">
                Must be unique. URL: /brand/&lt;slug&gt;
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Clinical Consumer Innovations brand"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Active</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, active: e.target.checked }))
                    }
                  />
                  <span className="text-sm">Visible on site</span>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="position">Position</Label>
                <Input
                  id="position"
                  type="number"
                  value={form.position}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      position: Number(e.target.value) || 0,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Lower number = earlier in the list
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="thumb">Thumbnail (square, PNG/JPG)</Label>
              <Input
                id="thumb"
                type="file"
                accept="image/*"
                onChange={(e) => setThumbFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">
                Saved to{" "}
                <code>{BUCKET}/brands/&lt;id&gt;/thumb.&lt;ext&gt;</code>
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
