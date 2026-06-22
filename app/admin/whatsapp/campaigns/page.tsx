"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, Search } from "lucide-react";
import { AdminBackBar } from "@/components/admin/AdminBackBar";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

export default function WhatsappCampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadCampaigns() {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/whatsapp?resource=campaigns", {
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (res.ok && j?.ok) {
          setCampaigns(j.campaigns || []);
        } else {
          console.error("Error loading whatsapp_campaigns", j?.error);
        }
      } catch (err) {
        console.error("Error loading whatsapp_campaigns", err);
      }
      setLoading(false);
    }

    loadCampaigns();
  }, []);

  const filtered = campaigns.filter((c) => {
    const matchesStatus =
      statusFilter === "all" ? true : (c.status || "") === statusFilter;
    const matchesSearch = search
      ? (c.name || "").toLowerCase().includes(search.toLowerCase())
      : true;
    return matchesStatus && matchesSearch;
  });

  return (
    <>
    <AdminBackBar title="Campaigns" to="/admin/whatsapp" />
    <div className="container mx-auto py-6 space-y-4">
      {/* Header + New button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">WhatsApp Campaigns</h2>
          <p className="text-xs text-muted-foreground">
            View and manage all WhatsApp campaigns created by your admins.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/admin/whatsapp/campaigns/new">
            <Plus className="mr-1 h-4 w-4" />
            New campaign
          </Link>
        </Button>
      </div>

      {/* Filters row */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Status pills */}
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                statusFilter === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted text-muted-foreground hover:bg-muted/60"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search box */}
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search campaigns…"
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading campaigns…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No campaigns found for this filter. Try changing the status or
          search term.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Target</th>
                <th className="px-3 py-2 text-left">Schedule</th>
                <th className="px-3 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/whatsapp/campaigns/${c.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {c.total_target_count ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {c.scheduled_at
                      ? new Date(c.scheduled_at).toLocaleString()
                      : "Send now"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </>
  );
}

function StatusBadge({ status }) {
  const s = (status || "").toLowerCase();
  let variant = "outline";
  let label = status || "Unknown";

  if (s === "draft") variant = "outline";
  else if (s === "scheduled") variant = "outline";
  else if (s === "running") variant = "default";
  else if (s === "completed") variant = "outline";
  else if (s === "failed") variant = "destructive";

  return (
    <Badge variant={variant} className="text-[11px]">
      {label}
    </Badge>
  );
}
