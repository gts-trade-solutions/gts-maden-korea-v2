"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, RefreshCw, Send } from "lucide-react";
import { AdminBackBar } from "@/components/admin/AdminBackBar";

export default function WhatsappCampaignDetailPage() {
  const params = useParams();
  const campaignId = params?.id;

  const [campaign, setCampaign] = useState(null);
  const [template, setTemplate] = useState(null);
  const [stats, setStats] = useState({
    queued: 0,
    sent: 0,
    failed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [sendLoading, setSendLoading] = useState(false);
  const [infoMsg, setInfoMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function loadData() {
    if (!campaignId) return;
    setLoading(true);
    setErrorMsg("");
    setInfoMsg("");

    try {
      // 1) load campaign
      const { data: camp, error: campErr } = await supabase
        .from("whatsapp_campaigns")
        .select(
          "id, name, status, template_id, scheduled_at, started_at, completed_at, total_target_count, created_at"
        )
        .eq("id", campaignId)
        .single();

      if (campErr || !camp) {
        console.error("Error loading campaign", campErr);
        setErrorMsg("Failed to load campaign details.");
        setLoading(false);
        return;
      }

      setCampaign(camp);

      // 2) load template (if any)
      if (camp.template_id) {
        const { data: tpl, error: tplErr } = await supabase
          .from("whatsapp_templates")
          .select("id, name, provider_template_name, language_code")
          .eq("id", camp.template_id)
          .single();

        if (!tplErr && tpl) {
          setTemplate(tpl);
        }
      }

      // 3) message stats
      const [queuedRes, sentRes, failedRes] = await Promise.all([
        supabase
          .from("whatsapp_campaign_messages")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .eq("status", "queued"),
        supabase
          .from("whatsapp_campaign_messages")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .eq("status", "sent"),
        supabase
          .from("whatsapp_campaign_messages")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .eq("status", "failed"),
      ]);

      setStats({
        queued: queuedRes.count || 0,
        sent: sentRes.count || 0,
        failed: failedRes.count || 0,
      });
    } catch (err) {
      console.error(err);
      setErrorMsg("Unexpected error loading campaign.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function handleSendNow() {
    if (!campaignId) return;
    setSendLoading(true);
    setErrorMsg("");
    setInfoMsg("");

    try {
      const res = await fetch(
        `/api/whatsapp/send-campaign/${campaignId}`,
        {
          method: "POST",
        }
      );
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMsg(
          `Send failed (HTTP ${res.status}). ${
            json?.message || "Please check server logs."
          }`
        );
      } else {
        setInfoMsg(
          `${json?.message || "Send request completed."} Sent: ${
            json?.sent ?? "?"
          }, Failed: ${json?.failed ?? "?"}.`
        );
        // reload stats to reflect new status
        await loadData();
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Unexpected error sending campaign.");
    } finally {
      setSendLoading(false);
    }
  }

  if (!campaignId) {
    return (
      <p className="text-sm text-muted-foreground">
        Invalid campaign id.
      </p>
    );
  }

  if (loading && !campaign) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!campaign) {
    return (
      <p className="text-sm text-muted-foreground">
        Campaign not found.
      </p>
    );
  }

  return (
    <>
    <AdminBackBar title="Campaign Details" to="/admin/whatsapp/campaigns" />
    <div className="container mx-auto py-6 space-y-6">
      {/* Title row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {campaign.name}
          </h2>
          <p className="text-xs text-muted-foreground">
            WhatsApp campaign details and delivery status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={sendLoading}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleSendNow}
            disabled={sendLoading || stats.queued === 0}
          >
            {sendLoading ? (
              <>
                <Send className="mr-1 h-4 w-4 animate-pulse" />
                Sending…
              </>
            ) : (
              <>
                <Send className="mr-1 h-4 w-4" />
                Send via Meta API
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-[2px] h-4 w-4" />
          <span>{errorMsg}</span>
        </div>
      )}
      {infoMsg && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 className="mt-[2px] h-4 w-4" />
          <span>{infoMsg}</span>
        </div>
      )}

      {/* Summary + stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Summary card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Campaign summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-24 text-muted-foreground">Status</span>
              <StatusBadge status={campaign.status} />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 text-muted-foreground">Template</span>
              {template ? (
                <span>
                  {template.name}{" "}
                  <span className="text-[11px] text-muted-foreground">
                    ({template.provider_template_name},{" "}
                    {template.language_code})
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 text-muted-foreground">Target</span>
              <span>
                {campaign.total_target_count ?? "-"} contacts
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 text-muted-foreground">Created</span>
              <span>
                {new Date(campaign.created_at).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 text-muted-foreground">
                Scheduled
              </span>
              <span>
                {campaign.scheduled_at
                  ? new Date(
                      campaign.scheduled_at
                    ).toLocaleString()
                  : "Send immediately"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 text-muted-foreground">Started</span>
              <span>
                {campaign.started_at
                  ? new Date(campaign.started_at).toLocaleString()
                  : "-"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 text-muted-foreground">Completed</span>
              <span>
                {campaign.completed_at
                  ? new Date(
                      campaign.completed_at
                    ).toLocaleString()
                  : "-"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Stats card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Delivery stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatRow label="Queued" value={stats.queued} />
            <StatRow label="Sent" value={stats.sent} />
            <StatRow label="Failed" value={stats.failed} />
          </CardContent>
        </Card>
      </div>
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

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
