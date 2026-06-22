"use client";

import { useEffect, useState } from "react";
import { adminWrite } from "@/lib/admin/catalog-write";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, Download } from "lucide-react";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
import { cn } from "@/lib/utils";

type WhatsappTemplate = {
  id: string;
  name: string;
  provider_template_name: string;
  category: string;
  language_code: string;
  body_preview: string | null;
  is_active: boolean;
  created_at: string;
};

const CATEGORY_FILTERS = [
  { value: "all", label: "All" },
  { value: "marketing", label: "Marketing" },
  { value: "utility", label: "Utility" },
  { value: "authentication", label: "Authentication" },
];

const LANGUAGE_OPTIONS = [
  "en_US",
  "en_GB",
  "hi",
  "ta",
  "ar",
  "fr",
  "de",
];

export default function WhatsappTemplatesPage() {
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProviderName, setNewProviderName] = useState("");
  const [newCategory, setNewCategory] = useState("marketing");
  const [newLang, setNewLang] = useState("en_US");
  const [newBodyPreview, setNewBodyPreview] = useState("");
  const [newActive, setNewActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadTemplates() {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/whatsapp?resource=templates", {
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (res.ok && j?.ok) {
          setTemplates((j.templates || []) as WhatsappTemplate[]);
        } else {
          console.error("Error loading whatsapp_templates", j?.error);
        }
      } catch (err) {
        console.error("Error loading whatsapp_templates", err);
      }
      setLoading(false);
    }

    loadTemplates();
  }, []);

  const filtered = templates.filter((t) => {
    const matchesCategory =
      categoryFilter === "all"
        ? true
        : (t.category || "").toLowerCase() === categoryFilter;
    const matchesSearch = search
      ? (t.name || "")
          .toLowerCase()
          .includes(search.toLowerCase()) ||
        (t.provider_template_name || "")
          .toLowerCase()
          .includes(search.toLowerCase())
      : true;
    return matchesCategory && matchesSearch;
  });

  async function handleSaveTemplate() {
    if (!newName.trim() || !newProviderName.trim()) return;
    setSaving(true);

    let data: WhatsappTemplate;
    try {
      data = (await adminWrite({
        table: "whatsapp_templates",
        op: "insert",
        data: {
          name: newName.trim(),
          provider_template_name: newProviderName.trim(),
          category: newCategory,
          language_code: newLang,
          body_preview: newBodyPreview || null,
          is_active: newActive,
        },
      })) as WhatsappTemplate;
    } catch (err) {
      console.error("Error inserting template", err);
      setSaving(false);
      return;
    }

    setTemplates((prev) => [data as WhatsappTemplate, ...prev]);
    setSaving(false);
    setAddOpen(false);
    setNewName("");
    setNewProviderName("");
    setNewCategory("marketing");
    setNewLang("en_US");
    setNewBodyPreview("");
    setNewActive(true);
  }

  return (
    <>
    <AdminBackBar title="Templates" to="/admin/whatsapp" />
    <div className="container mx-auto py-6 space-y-4">
      {/* Header + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">WhatsApp Templates</h2>
          <p className="text-xs text-muted-foreground">
            Map your WhatsApp / Meta templates here and use them in campaigns.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Download sample JSON template */}
          <Button size="sm" variant="outline" asChild>
            <a href="/whatsapp_template_sample.json" download>
              <Download className="mr-1 h-4 w-4" />
              Download JSON sample
            </a>
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add template
          </Button>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Category pills */}
        <div className="flex flex-wrap gap-1">
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setCategoryFilter(f.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                categoryFilter === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted text-muted-foreground hover:bg-muted/60"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or provider name…"
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-muted-foreground">
          Loading templates…
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No templates found. Add your first template using the button
          above.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Provider name</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Language</th>
                <th className="px-3 py-2 text-left">Preview</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span>{t.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {t.id}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {t.provider_template_name}
                  </td>
                  <td className="px-3 py-2">
                    <CategoryBadge category={t.category} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <Badge variant="outline">{t.language_code}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {t.body_preview || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {t.is_active ? (
                      <Badge
                        variant="default"
                        className="text-[11px]"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[11px]"
                      >
                        Inactive
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add template dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add WhatsApp template</DialogTitle>
            <DialogDescription className="text-xs space-y-1">
              <p>
                This should match an approved template in WhatsApp
                Manager.{" "}
              </p>
              <p>
                <strong>Display name</strong> is for your admins;{" "}
                <strong>provider name</strong> must match the API
                template name (e.g. <code>race_new_arrivals</code>).
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label htmlFor="tpl-name">Display name</Label>
              <Input
                id="tpl-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Race New Arrivals"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tpl-provider">
                Provider / Meta template name
              </Label>
              <Input
                id="tpl-provider"
                value={newProviderName}
                onChange={(e) =>
                  setNewProviderName(e.target.value)
                }
                placeholder="race_new_arrivals"
              />
              <p className="text-[11px] text-muted-foreground">
                Must match the template name shown in WhatsApp Manager
                exactly.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1 space-y-1">
                <Label htmlFor="tpl-category">Category</Label>
                <select
                  id="tpl-category"
                  className="w-full rounded-md border border-input bg-background px-2 py-2 text-xs"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                >
                  <option value="marketing">Marketing</option>
                  <option value="utility">Utility</option>
                  <option value="authentication">
                    Authentication
                  </option>
                </select>
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="tpl-lang">Language code</Label>
                <select
                  id="tpl-lang"
                  className="w-full rounded-md border border-input bg-background px-2 py-2 text-xs"
                  value={newLang}
                  onChange={(e) => setNewLang(e.target.value)}
                >
                  {LANGUAGE_OPTIONS.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Must match the language in WhatsApp Manager (e.g.{" "}
                  <code>en_US</code>).
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tpl-body">Body preview</Label>
              <Input
                id="tpl-body"
                value={newBodyPreview}
                onChange={(e) =>
                  setNewBodyPreview(e.target.value)
                }
                placeholder="Hi {{1}}, our new K-beauty arrivals are live now!"
              />
              <p className="text-[11px] text-muted-foreground">
                Optional, just to remind admins what the template says.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="radio"
                    name="tpl-active"
                    checked={newActive === true}
                    onChange={() => setNewActive(true)}
                  />
                  <span>Active</span>
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="radio"
                    name="tpl-active"
                    checked={newActive === false}
                    onChange={() => setNewActive(false)}
                  />
                  <span>Inactive</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={saving}>
              {saving ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}

/* --- Helper component for category badge --- */
function CategoryBadge({ category }: { category: string }) {
  const c = (category || "").toLowerCase();
  let variant: "default" | "outline" | "destructive" = "outline";
  let label = "Other";

  if (c === "marketing") {
    variant = "default";
    label = "Marketing";
  } else if (c === "utility") {
    variant = "outline";
    label = "Utility";
  } else if (c === "authentication") {
    variant = "outline";
    label = "Authentication";
  } else if (c) {
    label = c;
  }

  return (
    <Badge variant={variant} className="text-[11px]">
      {label}
    </Badge>
  );
}
