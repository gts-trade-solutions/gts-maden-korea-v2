"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {supabase} from "@/lib/supabaseClient";
import { adminWrite } from "@/lib/admin/catalog-write";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminBackBar } from "@/components/admin/AdminBackBar";


type WhatsappTemplate = {
  id: string;
  name: string;
  provider_template_name: string;
  category: string;
  language_code: string;
  body_preview: string | null;
};

type WhatsappContact = {
  id: string;
  phone_e164: string;
  tags: string[] | null;
};

type SendingMode = "now" | "schedule";
type AudienceMode = "all" | "tags";

export default function NewWhatsappCampaignPage() {
  const router = useRouter();

  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // form state
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sendingMode, setSendingMode] = useState<SendingMode>("now");
  const [scheduledAt, setScheduledAt] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // load templates + tags on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMsg(null);

      const [tplRes, contactsRes] = await Promise.all([
        supabase
          .from("whatsapp_templates")
          .select(
            "id, name, provider_template_name, category, language_code, body_preview"
          )
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("whatsapp_contacts")
          .select("id, phone_e164, tags")
      ]);

      if (tplRes.error) {
        console.error("Error loading templates", tplRes.error);
        setErrorMsg("Failed to load templates.");
      } else {
        setTemplates((tplRes.data || []) as WhatsappTemplate[]);
      }

      if (contactsRes.error) {
        console.error("Error loading contacts", contactsRes.error);
        setErrorMsg("Failed to load contacts.");
      } else {
        const contacts = (contactsRes.data || []) as WhatsappContact[];
        const tagsSet = new Set<string>();
        contacts.forEach((c) => {
          (c.tags || []).forEach((tag) => tagsSet.add(tag));
        });
        setAvailableTags(Array.from(tagsSet).sort());
      }

      setLoading(false);
    }

    loadData();
  }, []);

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg("Please enter a campaign name.");
      return;
    }
    if (!templateId) {
      setErrorMsg("Please select a WhatsApp template.");
      return;
    }
    if (audienceMode === "tags" && selectedTags.length === 0) {
      setErrorMsg("Please select at least one tag for the audience.");
      return;
    }
    if (sendingMode === "schedule" && !scheduledAt) {
      setErrorMsg("Please choose a scheduled time.");
      return;
    }

    setSubmitting(true);

    try {
      // 1) Get matching contacts
      let contactQuery = supabase
        .from("whatsapp_contacts")
        .select("id, phone_e164");

      if (audienceMode === "tags" && selectedTags.length > 0) {
        // tags overlaps selectedTags
        contactQuery = contactQuery.overlaps("tags", selectedTags);
      }

      const { data: contacts, error: contactsError } =
        await contactQuery;

      if (contactsError) {
        console.error("Error fetching contacts for campaign", contactsError);
        setErrorMsg("Failed to fetch contacts for this campaign.");
        setSubmitting(false);
        return;
      }

      const contactList = (contacts || []) as WhatsappContact[];

      if (contactList.length === 0) {
        setErrorMsg("No contacts match this audience filter.");
        setSubmitting(false);
        return;
      }

      // 2) Insert campaign
      const status =
        sendingMode === "schedule" ? "scheduled" : "running";

      const filterTagsValue =
        audienceMode === "tags" && selectedTags.length > 0
          ? selectedTags
          : null;

      let campaignRows: { id: string } | null = null;
      try {
        campaignRows = (await adminWrite({
          table: "whatsapp_campaigns",
          op: "insert",
          data: {
            name,
            template_id: templateId,
            status,
            filter_tags: filterTagsValue,
            total_target_count: contactList.length,
            scheduled_at:
              sendingMode === "schedule" ? scheduledAt : null,
          },
        })) as { id: string } | null;
      } catch (campaignError) {
        console.error("Error creating campaign", campaignError);
        setErrorMsg("Failed to create campaign.");
        setSubmitting(false);
        return;
      }

      if (!campaignRows) {
        setErrorMsg("Failed to create campaign.");
        setSubmitting(false);
        return;
      }

      const campaignId = campaignRows.id as string;

      // 3) Insert campaign_messages (queued)
      const messagesPayload = contactList.map((c) => ({
        campaign_id: campaignId,
        contact_id: c.id,
        to_phone: c.phone_e164,
        status: "queued",
      }));

      try {
        for (const m of messagesPayload) {
          await adminWrite({
            table: "whatsapp_campaign_messages",
            op: "insert",
            data: m,
          });
        }
      } catch (messagesError) {
        console.error(
          "Error inserting campaign messages",
          messagesError
        );
        setErrorMsg(
          "Campaign was created but messages could not be queued."
        );
        setSubmitting(false);
        return;
      }

      // Success → go back to campaigns list
      router.push("/admin/whatsapp/campaigns");
    } catch (err) {
      console.error(err);
      setErrorMsg("Unexpected error creating campaign.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-2">
          New WhatsApp Campaign
        </h2>
        <p className="text-sm text-muted-foreground">
          Loading templates and contacts…
        </p>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">
          New WhatsApp Campaign
        </h2>
        <p className="text-sm text-muted-foreground">
          You don&apos;t have any WhatsApp templates yet. Please add at least
          one template first.
        </p>
      </div>
    );
  }

  return (
    <>
    <AdminBackBar title="New Campaign" to="/admin/whatsapp/campaigns" />
    <div className="container mx-auto py-6 max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold">New WhatsApp Campaign</h2>
        <p className="text-xs text-muted-foreground">
          Select a template and audience. This will create the campaign and
          queue messages for each matching contact.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Campaign name */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Campaign name</label>
          <Input
            placeholder="e.g. June Sunblock Launch – 500 users"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Template selection */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Template</label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">Select a template</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name} ({tpl.category}) – {tpl.provider_template_name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Templates must already be approved in your WhatsApp provider.
          </p>
        </div>

        {/* Audience selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Audience</label>
          <div className="space-y-1 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="audience"
                value="all"
                checked={audienceMode === "all"}
                onChange={() => setAudienceMode("all")}
              />
              <span>All WhatsApp contacts</span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="audience"
                value="tags"
                checked={audienceMode === "tags"}
                onChange={() => setAudienceMode("tags")}
              />
              <span>
                Contacts having any of these tags:
                <br />
                <span className="text-xs text-muted-foreground">
                  (Click to toggle tags. We&apos;ll match contacts whose tags
                  overlap.)
                </span>
              </span>
            </label>
          </div>

          {audienceMode === "tags" && (
            <div className="flex flex-wrap gap-2 mt-1">
              {availableTags.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  No tags found yet on contacts.
                </span>
              ) : (
                availableTags.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleTagToggle(tag)}
                      className={
                        "rounded-full border px-3 py-1 text-xs " +
                        (active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground hover:bg-muted")
                      }
                    >
                      {tag}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Sending mode */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Sending mode</label>
          <div className="space-y-1 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="sendingMode"
                value="now"
                checked={sendingMode === "now"}
                onChange={() => setSendingMode("now")}
              />
              <span>Send now (queue messages immediately)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="sendingMode"
                value="schedule"
                checked={sendingMode === "schedule"}
                onChange={() => setSendingMode("schedule")}
              />
              <span>Schedule for later</span>
            </label>
          </div>

          {sendingMode === "schedule" && (
            <div className="mt-1 space-y-1">
              <label className="text-xs text-muted-foreground">
                Scheduled time (your local timezone)
              </label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Error */}
        {errorMsg && (
          <p className="text-xs text-red-600">{errorMsg}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? "Creating campaign..." : "Create campaign"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => router.push("/admin/whatsapp/campaigns")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
    </>
  );
}
