"use client";

import React, { useEffect, useMemo, useState } from "react";

type CampaignStats = {
  total: number;
  sent: number;
  failed: number;
  delivered: number;
  bounced: number;
  complaints: number;
  opened: number;
  clicked: number;
};

type Campaign = {
  id: string;
  subject: string;
  target_type: string;
  created_at: string;
  status: string;
  stats?: CampaignStats | null;
};

type Recipient = {
  id: string;
  email: string;
  name?: string | null;
  status: string;
  sent_at?: string | null;
  error?: string | null;
  ses_message_id?: string | null;
  delivery_event?: "delivered" | "bounce" | "complaint" | null;
  delivery_event_at?: string | null;
  has_opened?: boolean;
  opened_at?: string | null;
  has_clicked?: boolean;
  clicked_at?: string | null;
};

type Summary = {
  campaigns: number;
  recipients: number;
  unsubscribed: number;
};

export default function EmailDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null
  );
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [campaignStatusFilter, setCampaignStatusFilter] =
    useState<string>("all");
  const [recipientSearch, setRecipientSearch] = useState("");

  // Load summary
  useEffect(() => {
    async function loadSummary() {
      try {
        const res = await fetch("/api/admin/email/dashboard/summary");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load summary");
        setSummary(data);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load summary");
      }
    }
    loadSummary();
  }, []);

  // Load campaigns
  useEffect(() => {
    async function loadCampaigns() {
      try {
        setLoadingCampaigns(true);
        const res = await fetch("/api/admin/email/dashboard/campaigns");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load campaigns");
        setCampaigns(data.campaigns || []);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load campaigns");
      } finally {
        setLoadingCampaigns(false);
      }
    }
    loadCampaigns();
  }, []);

  // Load recipients for selected campaign
  useEffect(() => {
    if (!selectedCampaignId) {
      setRecipients([]);
      return;
    }

    async function loadRecipients() {
      try {
        setLoadingRecipients(true);
        const res = await fetch(
          `/api/admin/email/dashboard/campaign-recipients?campaignId=${selectedCampaignId}`
        );
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "Failed to load recipients");
        setRecipients(data.recipients || []);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load recipients");
      } finally {
        setLoadingRecipients(false);
      }
    }

    loadRecipients();
  }, [selectedCampaignId]);

  // Derived values
  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId]
  );

  const filteredCampaigns = useMemo(() => {
    if (campaignStatusFilter === "all") return campaigns;
    return campaigns.filter((c) => c.status === campaignStatusFilter);
  }, [campaigns, campaignStatusFilter]);

  const filteredRecipients = useMemo(() => {
    if (!recipientSearch) return recipients;
    const q = recipientSearch.toLowerCase();
    return recipients.filter(
      (r) =>
        r.email.toLowerCase().includes(q) ||
        (r.name && r.name.toLowerCase().includes(q))
    );
  }, [recipients, recipientSearch]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Email performance
          </h1>
          <p className="text-sm text-slate-500">
            Monitor campaigns, deliveries, opens, clicks and unsubscribes.
          </p>
        </div>

        {summary && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>
              <span className="font-semibold text-slate-900">
                {summary.campaigns}
              </span>{" "}
              campaigns
            </span>
            <span className="text-slate-300">•</span>
            <span>
              <span className="font-semibold text-slate-900">
                {summary.recipients}
              </span>{" "}
              recipients
            </span>
            <span className="text-slate-300">•</span>
            <span>
              <span className="font-semibold text-rose-600">
                {summary.unsubscribed}
              </span>{" "}
              unsubscribed
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="border border-rose-300 bg-rose-50 text-rose-800 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <SummaryGrid summary={summary} campaigns={campaigns} />

      {/* Content grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Campaigns panel */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Campaigns
              </h2>
              <p className="text-[11px] text-slate-500">
                Click a campaign to see recipient details.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={campaignStatusFilter}
                onChange={(e) => setCampaignStatusFilter(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1 text-[11px] bg-white text-slate-700"
              >
                <option value="all">All statuses</option>
                <option value="completed">Completed</option>
                <option value="sending">Sending</option>
                <option value="queued">Queued</option>
              </select>
              {loadingCampaigns && (
                <span className="text-[11px] text-slate-400">Loading…</span>
              )}
            </div>
          </div>

          {filteredCampaigns.length === 0 ? (
            <div className="px-4 py-4 text-xs text-slate-500">
              No campaigns found yet. Send your first campaign from{" "}
              <span className="font-semibold">Send email</span>.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto max-h-[420px]">
              <table className="min-w-full text-[11px]">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">
                      Subject
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Target
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Metrics
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCampaigns.map((c) => {
                    const created = new Date(
                      c.created_at
                    ).toLocaleString();
                    const isSelected = selectedCampaignId === c.id;

                    const s: CampaignStats = c.stats || {
                      total: 0,
                      sent: 0,
                      failed: 0,
                      delivered: 0,
                      bounced: 0,
                      complaints: 0,
                      opened: 0,
                      clicked: 0,
                    };

                    const statusColor =
                      c.status === "completed"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : c.status === "sending"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-slate-50 text-slate-700 border-slate-200";

                    const openRate =
                      s.total > 0 ? Math.round((s.opened / s.total) * 100) : 0;
                    const clickRate =
                      s.total > 0 ? Math.round((s.clicked / s.total) * 100) : 0;

                    return (
                      <tr
                        key={c.id}
                        className={
                          "border-t border-slate-100 cursor-pointer transition-colors " +
                          (isSelected ? "bg-blue-50/70" : "hover:bg-slate-50")
                        }
                        onClick={() => setSelectedCampaignId(c.id)}
                      >
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium text-slate-900 truncate max-w-[170px]">
                            {c.subject || "(no subject)"}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            ID: {c.id.slice(0, 8)}…
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 capitalize">
                            {c.target_type.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span
                            className={
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium " +
                              statusColor
                            }
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top text-[10px] text-slate-600">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex justify-between">
                              <span>Sent</span>
                              <span className="font-semibold">
                                {s.sent}/{s.total}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Delivered</span>
                              <span>{s.delivered}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Open rate</span>
                              <span>{openRate}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Click rate</span>
                              <span>{clickRate}%</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top text-[10px] text-slate-500">
                          {created}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recipients panel */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Recipients
              </h2>
              <p className="text-[11px] text-slate-500">
                Delivery, opens and clicks for the selected campaign.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={recipientSearch}
                onChange={(e) => setRecipientSearch(e.target.value)}
                placeholder="Search email or name…"
                className="border border-slate-300 rounded-md px-2 py-1 text-[11px] bg-white min-w-[170px]"
              />
              {loadingRecipients && (
                <span className="text-[11px] text-slate-400">Loading…</span>
              )}
            </div>
          </div>

          {!selectedCampaignId ? (
            <div className="px-4 py-4 text-xs text-slate-500">
              Select a campaign on the left to view recipient details.
            </div>
          ) : filteredRecipients.length === 0 ? (
            <div className="px-4 py-4 text-xs text-slate-500">
              No recipients match your filters.
            </div>
          ) : (
            <>
              {/* Small summary for selected campaign */}
              {selectedCampaign && (
                <div className="px-4 pt-3 pb-1 border-b border-slate-100 text-[11px] text-slate-600 flex flex-wrap gap-3">
                  <div>
                    <span className="font-semibold text-slate-900">
                      {selectedCampaign.subject || "(no subject)"}
                    </span>
                    <span className="text-slate-400"> · </span>
                    <span className="capitalize">
                      {selectedCampaign.target_type.replace("_", " ")}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto max-h-[420px]">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-1 text-left font-semibold">
                        Email
                      </th>
                      <th className="px-2 py-1 text-left font-semibold">
                        Status
                      </th>
                      <th className="px-2 py-1 text-left font-semibold">
                        Delivery
                      </th>
                      <th className="px-2 py-1 text-left font-semibold">
                        Engagement
                      </th>
                      <th className="px-2 py-1 text-left font-semibold">
                        Sent at
                      </th>
                      <th className="px-2 py-1 text-left font-semibold">
                        Error
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecipients.map((r) => {
                      const sentAt = r.sent_at
                        ? new Date(r.sent_at).toLocaleString()
                        : "-";
                      const delAt = r.delivery_event_at
                        ? new Date(r.delivery_event_at).toLocaleString()
                        : null;
                      const openAt = r.opened_at
                        ? new Date(r.opened_at).toLocaleString()
                        : null;
                      const clickAt = r.clicked_at
                        ? new Date(r.clicked_at).toLocaleString()
                        : null;

                      const statusBadge =
                        r.status === "sent"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : r.status === "failed"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-slate-50 text-slate-700 border-slate-200";

                      let deliveryBadge = "";
                      if (r.delivery_event === "delivered") {
                        deliveryBadge =
                          "bg-emerald-50 text-emerald-700 border-emerald-200";
                      } else if (r.delivery_event === "bounce") {
                        deliveryBadge =
                          "bg-rose-50 text-rose-700 border-rose-200";
                      } else if (r.delivery_event === "complaint") {
                        deliveryBadge =
                          "bg-amber-50 text-amber-700 border-amber-200";
                      }

                      return (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="px-2 py-1 align-top">
                            <div className="text-[11px] text-slate-900">
                              {r.email}
                            </div>
                            {r.name && (
                              <div className="text-[10px] text-slate-500">
                                {r.name}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1 align-top">
                            <span
                              className={
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium " +
                                statusBadge
                              }
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-2 py-1 align-top">
                            {r.delivery_event ? (
                              <div className="space-y-0.5">
                                <span
                                  className={
                                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize " +
                                    deliveryBadge
                                  }
                                >
                                  {r.delivery_event}
                                </span>
                                {delAt && (
                                  <div className="text-[9px] text-slate-500">
                                    {delAt}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400">
                                –
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 align-top">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-500">
                                  Open:
                                </span>
                                {r.has_opened ? (
                                  <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] text-emerald-700">
                                    Yes
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400">
                                    No
                                  </span>
                                )}
                              </div>
                              {openAt && (
                                <div className="text-[9px] text-slate-500 pl-6">
                                  {openAt}
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-500">
                                  Click:
                                </span>
                                {r.has_clicked ? (
                                  <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] text-emerald-700">
                                    Yes
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400">
                                    No
                                  </span>
                                )}
                              </div>
                              {clickAt && (
                                <div className="text-[9px] text-slate-500 pl-6">
                                  {clickAt}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-1 align-top text-[10px] text-slate-500">
                            {sentAt}
                          </td>
                          <td className="px-2 py-1 align-top">
                            {r.error && (
                              <span className="text-[10px] text-rose-700">
                                {r.error.slice(0, 40)}
                                {r.error.length > 40 ? "…" : ""}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Small summary cards component ----

function SummaryGrid({
  summary,
  campaigns,
}: {
  summary: Summary | null;
  campaigns: Campaign[];
}) {
  // Compute overall open/click rates across campaigns
  const globalStats = useMemo(() => {
    let total = 0;
    let opened = 0;
    let clicked = 0;
    let delivered = 0;

    for (const c of campaigns) {
      const s = c.stats;
      if (!s) continue;
      total += s.total;
      opened += s.opened;
      clicked += s.clicked;
      delivered += s.delivered;
    }

    return {
      total,
      opened,
      clicked,
      delivered,
      openRate: total > 0 ? Math.round((opened / total) * 100) : 0,
      clickRate: total > 0 ? Math.round((clicked / total) * 100) : 0,
      deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
    };
  }, [campaigns]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Campaigns */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Campaigns
        </span>
        <span className="text-2xl font-semibold text-slate-900">
          {summary ? summary.campaigns : "—"}
        </span>
        <span className="text-xs text-slate-500">
          Total campaigns created in this workspace.
        </span>
      </div>

      {/* Emails */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Emails (rows)
        </span>
        <span className="text-2xl font-semibold text-slate-900">
          {summary ? summary.recipients : "—"}
        </span>
        <span className="text-xs text-slate-500">
          Individual recipient records across all campaigns.
        </span>
      </div>

      {/* Engagement */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm flex flex-col gap-2">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-wide text-emerald-800">
            Engagement
          </span>
        </div>
        <div className="flex justify-between text-xs text-emerald-900">
          <span>Delivery rate</span>
          <span className="font-semibold">
            {globalStats.deliveryRate}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-emerald-100 overflow-hidden">
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${globalStats.deliveryRate}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-emerald-900">
          <span>Open rate</span>
          <span className="font-semibold">{globalStats.openRate}%</span>
        </div>
        <div className="flex justify-between text-xs text-emerald-900">
          <span>Click rate</span>
          <span className="font-semibold">{globalStats.clickRate}%</span>
        </div>
      </div>
    </div>
  );
}
