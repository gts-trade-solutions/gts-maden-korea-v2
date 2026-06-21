// app/(admin)/social/multichannel/page.jsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Facebook,
  Instagram,
  Image as ImageIcon,
  Wand2,
  Send,
  Loader2,
  CalendarClock,
  RefreshCw,
  MessageCircle,
  Trash2,
  Edit,
  X,
} from "lucide-react";
import { AdminBackBar } from "@/components/admin/AdminBackBar";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

// ------------ helpers -------------
function buildFinalCaption(base, tags) {
  const c = (base || "").trim();
  const t = (tags || "").trim();
  if (!c && !t) return "";
  if (!t) return c;
  if (!c) return t;
  return `${c}\n\n${t}`;
}

function parseUploadResponse(json) {
  const url =
    json?.url || json?.publicUrl || json?.publicURL || json?.path || "";
  const mime = json?.mimeType || json?.contentType || "";
  const isVideo = mime.startsWith("video/");
  return { url, mime, isVideo };
}

function extractFacebookMedia(post) {
  const rawAttachments = post.attachments_raw;
  const attachment = Array.isArray(rawAttachments?.data)
    ? rawAttachments.data[0]
    : rawAttachments?.data || rawAttachments || null;

  const isVideo =
    attachment?.media_type === "video" ||
    attachment?.type === "video_inline" ||
    attachment?.type === "video";

  const mediaUrl =
    (isVideo && attachment?.media?.source) ||
    attachment?.media?.image?.src ||
    attachment?.media?.source ||
    attachment?.url ||
    null;

  return { isVideo, mediaUrl };
}

export default function MultiChannelCampaignPage() {
  // ------------- COMPOSER -------------
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const [sendToInstagram, setSendToInstagram] = useState(true);
  const [sendToFacebook, setSendToFacebook] = useState(true);

  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [mediaType, setMediaType] = useState("IMAGE"); // IMAGE | VIDEO
  const [uploadedMediaUrl, setUploadedMediaUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  const [posting, setPosting] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  // ------------- LOCAL SCHEDULED JOBS (BROWSER ONLY) -------------
  const [scheduledPosts, setScheduledPosts] = useState([]);

  // ------------- FEEDS -------------
  const [igFeed, setIgFeed] = useState([]);
  const [fbFeed, setFbFeed] = useState([]);
  const [loadingFeeds, setLoadingFeeds] = useState(false);
  const [error, setError] = useState("");

  // ------------- IG EDIT/DELETE -------------
  const [igEditingId, setIgEditingId] = useState(null);
  const [igEditCaption, setIgEditCaption] = useState("");
  const [igEditLoading, setIgEditLoading] = useState(false);

  // ------------- FB EDIT -------------
  const [fbEditingId, setFbEditingId] = useState(null);
  const [fbEditMessage, setFbEditMessage] = useState("");
  const [fbEditLoading, setFbEditLoading] = useState(false);

  // ------------- FB COMMENTS -------------
  const [activeFbPostForComments, setActiveFbPostForComments] = useState(null);
  const [fbComments, setFbComments] = useState([]);
  const [loadingFbComments, setLoadingFbComments] = useState(false);
  const [fbCommentError, setFbCommentError] = useState("");
  const [fbNewComment, setFbNewComment] = useState("");
  const [fbCommentLoading, setFbCommentLoading] = useState(false);

  // ---------- LOAD FEEDS ----------
  async function loadFeeds() {
    try {
      setLoadingFeeds(true);
      setError("");

      const [igRes, fbRes] = await Promise.all([
        fetch("/api/instagram/media"),
        fetch("/api/facebook/page-posts"),
      ]);

      const [igJson, fbJson] = await Promise.all([
        igRes.json(),
        fbRes.json(),
      ]);

      if (!igRes.ok) throw new Error(igJson.error || "Failed to load IG feed");
      if (!fbRes.ok)
        throw new Error(fbJson.error || "Failed to load Facebook feed");

      setIgFeed(igJson.data || []);
      setFbFeed(fbJson.data || []);
    } catch (err) {
      console.error("loadFeeds error", err);
      setError(err.message || String(err));
    } finally {
      setLoadingFeeds(false);
    }
  }

  useEffect(() => {
    loadFeeds();
  }, []);

  // ---------- AUTO PROCESSOR (EVERY 60s WHILE LOCAL PENDING) ----------
  const hasPendingLocal = useMemo(
    () =>
      scheduledPosts.some(
        (j) => j.status === "pending" || j.status === "processing"
      ),
    [scheduledPosts]
  );

  useEffect(() => {
    if (!hasPendingLocal) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/social/process-scheduled", {
          method: "POST",
        });
        await res.json().catch(() => {});

        // simple cleanup: drop jobs whose scheduled time is clearly in the past
        const now = Date.now();
        setScheduledPosts((prev) =>
          prev.filter((job) => {
            if (!job.scheduled_at) return true;
            const t = new Date(job.scheduled_at).getTime();
            if (isNaN(t)) return true;
            return t > now - 60_000; // keep for about 1 min after
          })
        );

        loadFeeds();
      } catch (err) {
        console.error("auto process-scheduled error", err);
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [hasPendingLocal]);

  // ---------- MEDIA UPLOAD ----------
  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
    setMediaType(file.type.startsWith("video") ? "VIDEO" : "IMAGE");
    setUploadedMediaUrl("");
  }

  async function ensureMediaUploaded() {
    if (!mediaFile) return "";
    if (uploadedMediaUrl) return uploadedMediaUrl;

    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("file", mediaFile);
      const res = await fetch("/api/uploads/social", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      const { url, isVideo } = parseUploadResponse(json);
      if (!url) throw new Error("Upload did not return a URL");
      setUploadedMediaUrl(url);
      if (isVideo) setMediaType("VIDEO");
      return url;
    } catch (err) {
      console.error("ensureMediaUploaded error", err);
      alert(err.message || "Upload failed");
      return "";
    } finally {
      setUploading(false);
    }
  }

  function resetForm() {
    setText("");
    setTags("");
    setMediaFile(null);
    setMediaPreview("");
    setMediaType("IMAGE");
    setUploadedMediaUrl("");
    setIsScheduled(false);
    setScheduledDate("");
    setScheduledTime("");
  }

  // ---------- AI COPY ----------
  async function runAiCopy() {
    const base = text.trim();
    if (!base) {
      alert("Base content is required");
      return;
    }

    try {
      setAiLoading(true);
      const res = await fetch("/api/ai/social-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseText: base,
          channel: "multichannel",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI error");

      if (json.caption) setText(String(json.caption));
      if (json.hashtags !== undefined) {
        const t = Array.isArray(json.hashtags)
          ? json.hashtags.join(" ")
          : String(json.hashtags);
        setTags(t);
      }
    } catch (err) {
      console.error("AI copy error", err);
      alert(err.message || "AI generation failed");
    } finally {
      setAiLoading(false);
    }
  }

  // ---------- POST NOW ----------
  async function handlePostNow() {
    if (!sendToInstagram && !sendToFacebook) {
      alert("Select at least one channel.");
      return;
    }
    if (!text.trim() && !mediaFile) {
      alert("Write something or attach a media file.");
      return;
    }

    const finalCaption = buildFinalCaption(text, tags);

    try {
      setPosting(true);

      let mediaUrl = uploadedMediaUrl;
      if (mediaFile) {
        mediaUrl = await ensureMediaUploaded();
        if (!mediaUrl) return;
      }

      const tasks = [];

      if (sendToInstagram) {
        if (!mediaUrl) {
          alert("Instagram requires an image or video.");
        } else {
          tasks.push(
            fetch("/api/instagram/media", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                caption: finalCaption,
                media_url: mediaUrl,
                media_type: mediaType,
              }),
            }).then((r) => r.json())
          );
        }
      }

      if (sendToFacebook) {
        tasks.push(
          fetch("/api/facebook/page-posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: finalCaption,
              media_url: mediaUrl || null,
            }),
          }).then((r) => r.json())
        );
      }

      await Promise.all(tasks);
      resetForm();
      loadFeeds();
    } catch (err) {
      console.error("handlePostNow error", err);
      alert(err.message || "Failed to post");
    } finally {
      setPosting(false);
    }
  }

  // ---------- SCHEDULE (LOCAL-LIST + API POST) ----------
  async function handleSchedule() {
    if (!sendToInstagram && !sendToFacebook) {
      alert("Select at least one channel.");
      return;
    }
    if (!text.trim() && !mediaFile) {
      alert("Write something or attach a media file.");
      return;
    }
    if (!scheduledDate || !scheduledTime) {
      alert("Pick date & time for scheduling.");
      return;
    }

    const scheduledLocal = new Date(`${scheduledDate}T${scheduledTime}`);
    if (isNaN(scheduledLocal.getTime())) {
      alert("Invalid schedule date or time.");
      return;
    }

    const finalCaption = buildFinalCaption(text, tags);

    try {
      setScheduling(true);

      let mediaUrl = uploadedMediaUrl;
      if (mediaFile) {
        mediaUrl = await ensureMediaUploaded();
        if (!mediaUrl) return;
      }

      const isoTime = scheduledLocal.toISOString();
      const newJobs = [];

      if (sendToInstagram) {
        const res = await fetch("/api/social/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: "instagram",
            channel: "instagram",
            caption: finalCaption,
            media_url: mediaUrl,
            media_type: mediaType,
            scheduled_at: isoTime,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to schedule IG");
        const job =
          json.data ||
          json.job || {
            id: `local-ig-${Date.now()}`,
            platform: "instagram",
            channel: "instagram",
            caption: finalCaption,
            media_url: mediaUrl,
            media_type: mediaType,
            scheduled_at: isoTime,
            status: "pending",
          };
        newJobs.push(job);
      }

      if (sendToFacebook) {
        const res = await fetch("/api/social/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: "facebook",
            channel: "facebook",
            caption: finalCaption,
            media_url: mediaUrl || null,
            media_type: mediaType,
            scheduled_at: isoTime,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to schedule FB");
        const job =
          json.data ||
          json.job || {
            id: `local-fb-${Date.now()}`,
            platform: "facebook",
            channel: "facebook",
            caption: finalCaption,
            media_url: mediaUrl,
            media_type: mediaType,
            scheduled_at: isoTime,
            status: "pending",
          };
        newJobs.push(job);
      }

      setScheduledPosts((prev) => [...newJobs, ...prev]);

      resetForm();
    } catch (err) {
      console.error("handleSchedule error", err);
      alert(err.message || "Failed to schedule");
    } finally {
      setScheduling(false);
    }
  }

  // ---------- IG EDIT / DELETE ----------
  function openIgEdit(item) {
    setIgEditingId(item.ig_media_id);
    setIgEditCaption(item.caption || "");
  }

  async function saveIgEdit() {
    if (!igEditingId || !igEditCaption.trim()) return;
    try {
      setIgEditLoading(true);
      const res = await fetch("/api/instagram/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ig_media_id: igEditingId,
          caption: igEditCaption,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to edit IG caption");
      setIgEditingId(null);
      setIgEditCaption("");
      loadFeeds();
    } catch (err) {
      console.error("saveIgEdit error", err);
      alert(err.message || "Edit failed");
    } finally {
      setIgEditLoading(false);
    }
  }

  async function deleteIgPost(item) {
    if (
      !confirm(
        "Delete this post from dashboard cache? (Instagram post itself may or may not be removed based on API implementation)"
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/instagram/media?ig_media_id=${encodeURIComponent(
          item.ig_media_id
        )}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete IG post");
      loadFeeds();
    } catch (err) {
      console.error("deleteIgPost error", err);
      alert(err.message || "Delete failed");
    }
  }

  // ---------- FB EDIT / DELETE ----------
  function openFbEdit(post) {
    setFbEditingId(post.fb_post_id);
    setFbEditMessage(post.message || "");
  }

  async function saveFbEdit() {
    if (!fbEditingId || !fbEditMessage.trim()) return;
    try {
      setFbEditLoading(true);
      const res = await fetch("/api/facebook/page-posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fb_post_id: fbEditingId,
          message: fbEditMessage,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to edit FB post");
      setFbEditingId(null);
      setFbEditMessage("");
      loadFeeds();
    } catch (err) {
      console.error("saveFbEdit error", err);
      alert(err.message || "Edit failed");
    } finally {
      setFbEditLoading(false);
    }
  }

  async function deleteFbPost(post) {
    if (!confirm("Delete this Facebook post? This removes it from Facebook.")) {
      return;
    }
    try {
      const res = await fetch(
        `/api/facebook/page-posts?fb_post_id=${encodeURIComponent(
          post.fb_post_id
        )}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete post");
      loadFeeds();
    } catch (err) {
      console.error("deleteFbPost error", err);
      alert(err.message || "Delete failed");
    }
  }

  // ---------- FB COMMENTS ----------
  async function openCommentsDrawer(post) {
    setActiveFbPostForComments(post);
    setFbComments([]);
    setFbCommentError("");
    setLoadingFbComments(true);
    try {
      const res = await fetch(
        `/api/facebook/comments?fb_post_id=${encodeURIComponent(
          post.fb_post_id
        )}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load comments");
      setFbComments(json.data || []);
    } catch (err) {
      console.error(err);
      setFbCommentError(err.message || String(err));
    } finally {
      setLoadingFbComments(false);
    }
  }

  function closeCommentsDrawer() {
    setActiveFbPostForComments(null);
    setFbComments([]);
    setFbNewComment("");
    setFbCommentError("");
  }

  async function sendFbComment(parentCommentId = null) {
    if (!activeFbPostForComments || !fbNewComment.trim()) return;
    try {
      setFbCommentLoading(true);
      const res = await fetch("/api/facebook/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fb_post_id: parentCommentId
            ? null
            : activeFbPostForComments.fb_post_id,
          parent_comment_id: parentCommentId,
          message: fbNewComment,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send comment");
      setFbComments((prev) => [json.data, ...prev]);
      setFbNewComment("");
    } catch (err) {
      console.error(err);
      alert("Comment failed: " + (err.message || err));
    } finally {
      setFbCommentLoading(false);
    }
  }

  async function deleteFbComment(commentId) {
    if (!confirm("Delete this comment on Facebook?")) return;
    try {
      const res = await fetch(
        `/api/facebook/comments?fb_comment_id=${encodeURIComponent(
          commentId
        )}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete comment");
      setFbComments((prev) => prev.filter((c) => c.fb_comment_id !== commentId));
    } catch (err) {
      console.error(err);
      alert("Delete comment failed: " + (err.message || err));
    }
  }

  async function toggleHideFbComment(comment, nextHidden) {
    try {
      const res = await fetch("/api/facebook/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fb_comment_id: comment.fb_comment_id,
          is_hidden: nextHidden,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update comment");
      setFbComments((prev) =>
        prev.map((c) =>
          c.fb_comment_id === comment.fb_comment_id ? json.data : c
        )
      );
    } catch (err) {
      console.error(err);
      alert("Hide/unhide failed: " + (err.message || err));
    }
  }

  // ---------- SCHEDULED LIST (LOCAL) ----------
  const visibleJobs = scheduledPosts
    .filter((j) => j.status === "pending" || j.status === "processing")
    .sort(
      (a, b) =>
        new Date(a.scheduled_at || 0).getTime() -
        new Date(b.scheduled_at || 0).getTime()
    );

  // ============== RENDER ==============
  return (
    <>
    <AdminBackBar title="Multichannel Marketing" to="/admin" />
    <div className="min-h-screen bg-[#02010a] text-zinc-100">
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
              Multichannel Campaign
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                <Instagram className="w-3 h-3" />
                <Facebook className="w-3 h-3" />
                Unified
              </span>
            </h1>
            <p className="text-xs text-zinc-400">
              Write once, publish or schedule to Instagram and Facebook
              together, and manage posts & comments in one place.
            </p>
          </div>
        </div>

        {/* Composer */}
        <section className="bg-[#050509] border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">
              Write the main content for both channels…
            </label>
            <textarea
              className="w-full rounded-xl border border-zinc-800 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500/60 min-h-[80px]"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Christmas from MadenKorea, wrapped with love…"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">
              Hashtags (optional)
            </label>
            <textarea
              className="w-full rounded-xl border border-zinc-800 bg-black/40 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500/60 min-h-[40px]"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="#kbeauty #skincare #christmas"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-full bg-zinc-900/70 border border-zinc-800 cursor-pointer hover:bg-zinc-900">
              <ImageIcon className="w-4 h-4" />
              <span>Photo / Video</span>
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={onFileChange}
              />
            </label>

            <button
              type="button"
              onClick={runAiCopy}
              disabled={aiLoading}
              className={cn(
                "inline-flex items-center gap-2 text-xs px-3 py-2 rounded-full bg-zinc-900/70 border border-emerald-500/40 text-emerald-200 hover:bg-zinc-900",
                aiLoading && "opacity-60 cursor-not-allowed"
              )}
            >
              {aiLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Wand2 className="w-3 h-3" />
              )}
              <span>AI optimize & hashtags</span>
            </button>

            <div className="flex flex-wrap gap-2 text-[11px] ml-auto">
              <label className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-900/60 border border-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-zinc-700 bg-black"
                  checked={sendToInstagram}
                  onChange={(e) => setSendToInstagram(e.target.checked)}
                />
                <Instagram className="w-3 h-3 text-pink-400" />
                <span>Instagram</span>
              </label>
              <label className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-900/60 border border-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-zinc-700 bg-black"
                  checked={sendToFacebook}
                  onChange={(e) => setSendToFacebook(e.target.checked)}
                />
                <Facebook className="w-3 h-3 text-blue-400" />
                <span>Facebook</span>
              </label>
            </div>
          </div>

          {mediaPreview && (
            <div className="rounded-xl border border-zinc-800 overflow-hidden bg-black max-h-64 flex items-center justify-center">
              {mediaType === "VIDEO" ? (
                <video
                  src={mediaPreview}
                  controls
                  playsInline
                  className="max-h-64 w-auto"
                />
              ) : (
                <img
                  src={mediaPreview}
                  alt="preview"
                  className="max-h-64 w-auto object-contain"
                />
              )}
            </div>
          )}

          {/* scheduling controls */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/70">
            <label className="inline-flex items-center gap-2 text-[11px] text-zinc-200">
              <input
                type="checkbox"
                className="rounded border-zinc-700 bg-black"
                checked={isScheduled}
                onChange={(e) => setIsScheduled(e.target.checked)}
              />
              <CalendarClock className="w-3 h-3" />
              <span>
                Schedule this campaign instead of posting immediately
              </span>
            </label>

            {isScheduled && (
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <div className="flex flex-col">
                  <span className="text-zinc-400 mb-0.5">Date</span>
                  <input
                    type="date"
                    className="rounded-lg border border-zinc-800 bg-black px-2 py-1 text-xs outline-none"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-zinc-400 mb-0.5">Time</span>
                  <input
                    type="time"
                    className="rounded-lg border border-zinc-800 bg-black px-2 py-1 text-xs outline-none"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                  />
                </div>
                <span className="text-zinc-500">
                  Uses your browser time zone.
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
            <div className="text-[11px] text-zinc-500 flex items-center gap-1">
              <span className="inline-flex items-center gap-1">
                <Instagram className="w-3 h-3 text-pink-400" />
                <Facebook className="w-3 h-3 text-blue-400" />
              </span>
              <span>Media upload happens only once for both channels.</span>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                disabled={posting || scheduling}
                onClick={resetForm}
                className="px-3 py-1.5 rounded-full text-xs bg-zinc-900/70 border border-zinc-800 hover:bg-zinc-900"
              >
                Clear
              </button>

              {!isScheduled ? (
                <button
                  type="button"
                  disabled={posting || (!text.trim() && !mediaFile)}
                  onClick={handlePostNow}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium bg-emerald-600 hover:bg-emerald-700",
                    posting && "opacity-60 cursor-not-allowed"
                  )}
                >
                  {posting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Post now to selected channels</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={
                    scheduling ||
                    (!text.trim() && !mediaFile) ||
                    !scheduledDate ||
                    !scheduledTime
                  }
                  onClick={handleSchedule}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium bg-indigo-600 hover:bg-indigo-700",
                    scheduling && "opacity-60 cursor-not-allowed"
                  )}
                >
                  {scheduling ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Schedule for both channels</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Scheduled campaigns (LOCAL ONLY) */}
        <section className="bg-[#050509] border border-zinc-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
              <CalendarClock className="w-4 h-4" />
              Scheduled campaigns (local)
            </div>
            <span className="text-[10px] text-zinc-500">
              Visible only in this browser. Scheduler backend still runs via
              existing APIs.
            </span>
          </div>

          {visibleJobs.length === 0 ? (
            <p className="text-[11px] text-zinc-500">
              No pending scheduled campaigns in this browser.
            </p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {visibleJobs.map((job) => {
                const ts = job.scheduled_at ? new Date(job.scheduled_at) : null;
                const label = ts ? ts.toLocaleString() : "Unknown time";
                return (
                  <div
                    key={job.id}
                    className="flex items-center justify-between rounded-lg bg-zinc-900/70 border border-zinc-800 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-black border border-zinc-700">
                        {job.platform === "instagram" ? (
                          <Instagram className="w-3 h-3 text-pink-400" />
                        ) : (
                          <Facebook className="w-3 h-3 text-blue-400" />
                        )}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-zinc-100 line-clamp-1">
                          {(job.caption || "").slice(0, 80) ||
                            "(no text / media only)"}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          Scheduled at: {label}
                        </span>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full capitalize",
                        job.status === "processing"
                          ? "bg-yellow-500/20 text-yellow-300"
                          : "bg-blue-500/20 text-blue-300"
                      )}
                    >
                      {job.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Feeds */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-zinc-300">
              Channel activity
            </div>
            <button
              type="button"
              onClick={loadFeeds}
              disabled={loadingFeeds}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-zinc-900/70 border border-zinc-800 hover:bg-zinc-900"
            >
              <RefreshCw
                className={cn(
                  "w-3 h-3",
                  loadingFeeds && "animate-spin text-emerald-400"
                )}
              />
              <span>Refresh feeds</span>
            </button>
          </div>

          {error && (
            <div className="text-[11px] text-red-300 bg-red-950/40 border border-red-800/60 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            {/* IG feed */}
            <div className="bg-[#050509] border border-zinc-800 rounded-2xl p-3 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Instagram className="w-4 h-4 text-pink-400" />
                  <span className="font-semibold">Latest Instagram posts</span>
                </div>
              </div>

              {igFeed.length === 0 ? (
                <p className="text-[11px] text-zinc-500">
                  No Instagram posts cached yet.
                </p>
              ) : (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3">
                  {igFeed.map((item) => {
                    const ts = item.timestamp ? new Date(item.timestamp) : null;
                    const dateLabel = ts
                      ? ts.toLocaleString()
                      : "Unknown date";
                    const type = (item.media_type || "").toUpperCase();
                    const isVideo = type === "VIDEO" || type === "REEL";

                    return (
                      <div
                        key={item.id || item.ig_media_id}
                        className="bg-[#050509] border border-zinc-800 rounded-xl overflow-hidden flex flex-col"
                      >
                        <div className="aspect-[4/5] bg-black flex items-center justify-center overflow-hidden">
                          {isVideo ? (
                            <video
                              src={item.media_url || undefined}
                              controls
                              playsInline
                              className="w-full h-full object-contain"
                            />
                          ) : item.media_url || item.thumbnail_url ? (
                            <img
                              src={item.media_url || item.thumbnail_url || ""}
                              alt="Instagram media"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-xs text-zinc-500">
                              No media preview
                            </div>
                          )}
                        </div>

                        <div className="px-3 py-2 flex flex-col gap-1 text-xs">
                          <div className="flex items-center justify-between text-[10px] text-zinc-400">
                            <span>{dateLabel}</span>
                            {item.permalink && (
                              <a
                                href={item.permalink}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-pink-400"
                              >
                                View
                              </a>
                            )}
                          </div>

                          {igEditingId === item.ig_media_id ? (
                            <div className="space-y-1">
                              <textarea
                                value={igEditCaption}
                                onChange={(e) =>
                                  setIgEditCaption(e.target.value)
                                }
                                className="w-full bg-zinc-900/80 rounded-lg px-2 py-1 text-[11px] outline-none resize-none min-h-[60px]"
                              />
                              <div className="flex justify-end gap-1 text-[10px]">
                                <button
                                  onClick={() => {
                                    setIgEditingId(null);
                                    setIgEditCaption("");
                                  }}
                                  className="px-2 py-0.5 rounded-full bg-zinc-800 hover:bg-zinc-700"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={saveIgEdit}
                                  disabled={
                                    igEditLoading || !igEditCaption.trim()
                                  }
                                  className={cn(
                                    "px-2 py-0.5 rounded-full bg-pink-600 hover:bg-pink-700",
                                    igEditLoading &&
                                      "opacity-60 cursor-not-allowed"
                                  )}
                                >
                                  {igEditLoading ? "Saving…" : "Save"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-zinc-100 line-clamp-3 whitespace-pre-wrap">
                              {item.caption || ""}
                            </p>
                          )}

                          <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-500">
                            <div className="flex items-center gap-2">
                              <span>❤️ {item.like_count ?? 0}</span>
                              <span>💬 {item.comments_count ?? 0}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openIgEdit(item)}
                                className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full hover:bg-zinc-800"
                              >
                                <Edit className="w-3 h-3" />
                            
                              </button>
                              <button
                                onClick={() => deleteIgPost(item)}
                                className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full hover:bg-zinc-800 text-red-300"
                              >
                                <Trash2 className="w-3 h-3" />
                                
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* FB feed */}
            <div className="bg-[#050509] border border-zinc-800 rounded-2xl p-3 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Facebook className="w-4 h-4 text-blue-400" />
                  <span className="font-semibold">
                    Latest Facebook page posts
                  </span>
                </div>
              </div>

              {fbFeed.length === 0 ? (
                <p className="text-[11px] text-zinc-500">
                  No Facebook posts cached yet.
                </p>
              ) : (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3">
                  {fbFeed.map((post) => {
                    const created = post.created_time
                      ? new Date(post.created_time)
                      : null;
                    const createdLabel = created
                      ? created.toLocaleString()
                      : "Unknown date";

                    const { isVideo, mediaUrl } = extractFacebookMedia(post);
                    const likes = post.reactions_count ?? 0;
                    const comments = post.comments_count ?? 0;

                    return (
                      <div
                        key={post.id || post.fb_post_id}
                        className="bg-[#050509] border border-zinc-800 rounded-xl overflow-hidden flex flex-col"
                      >
                        {mediaUrl && (
                          <div className="bg-black flex items-center justify-center aspect-[4/3] overflow-hidden">
                            {isVideo ? (
                              <video
                                src={mediaUrl}
                                controls
                                playsInline
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <img
                                src={mediaUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                        )}

                        <div className="px-3 py-2 flex flex-col gap-1 text-xs">
                          <div className="flex items-center justify-between text-[10px] text-zinc-400">
                            <span>{createdLabel}</span>
                            {post.permalink_url && (
                              <a
                                href={post.permalink_url}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-blue-400"
                              >
                                View
                              </a>
                            )}
                          </div>

                          {fbEditingId === post.fb_post_id ? (
                            <div className="space-y-1">
                              <textarea
                                value={fbEditMessage}
                                onChange={(e) =>
                                  setFbEditMessage(e.target.value)
                                }
                                className="w-full bg-zinc-900/80 rounded-lg px-2 py-1 text-[11px] outline-none resize-none min-h-[60px]"
                              />
                              <div className="flex justify-end gap-1 text-[10px]">
                                <button
                                  onClick={() => {
                                    setFbEditingId(null);
                                    setFbEditMessage("");
                                  }}
                                  className="px-2 py-0.5 rounded-full bg-zinc-800 hover:bg-zinc-700"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={saveFbEdit}
                                  disabled={
                                    fbEditLoading || !fbEditMessage.trim()
                                  }
                                  className={cn(
                                    "px-2 py-0.5 rounded-full bg-blue-600 hover:bg-blue-700",
                                    fbEditLoading &&
                                      "opacity-60 cursor-not-allowed"
                                  )}
                                >
                                  {fbEditLoading ? "Saving…" : "Save"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-zinc-100 line-clamp-3 whitespace-pre-wrap">
                              {post.message || ""}
                            </p>
                          )}

                          <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-500">
                            <div className="flex items-center gap-2">
                              <span>👍 {likes}</span>
                              <span>💬 {comments}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openCommentsDrawer(post)}
                                className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full hover:bg-zinc-800"
                              >
                                <MessageCircle className="w-3 h-3" />
                                Comments
                              </button>
                              <button
                                onClick={() => openFbEdit(post)}
                                className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full hover:bg-zinc-800"
                              >
                                <Edit className="w-3 h-3" />
                                Edit
                              </button>
                              <button
                                onClick={() => deleteFbPost(post)}
                                className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full hover:bg-zinc-800 text-red-300"
                              >
                                <Trash2 className="w-3 h-3" />
                                Del
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* FB comments drawer */}
      {activeFbPostForComments && (
        <div className="fixed inset-0 bg-black/50 z-40 flex justify-end">
          <div className="w-full max-w-md h-full bg-[#242526] border-l border-[#3a3b3c] flex flex-col">
            <div className="px-4 py-3 border-b border-[#3a3b3c] flex items-center justify-between">
              <div className="font-semibold text-sm flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Comments
              </div>
              <button
                onClick={closeCommentsDrawer}
                className="text-[#b0b3b8] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm">
              {loadingFbComments && (
                <div className="flex items-center justify-center py-4 text-[#b0b3b8]">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Loading comments…
                </div>
              )}
              {fbCommentError && (
                <div className="text-red-300 text-xs">{fbCommentError}</div>
              )}
              {!loadingFbComments && fbComments.length === 0 && (
                <div className="text-xs text-[#b0b3b8]">
                  No comments yet on this post.
                </div>
              )}
              {fbComments.map((c) => (
                <div
                  key={c.fb_comment_id}
                  className={cn(
                    "rounded-lg px-3 py-2 bg-[#3a3b3c]",
                    c.is_hidden && "opacity-60"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold text-xs">
                      {c.from_name || "User"}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[#b0b3b8]">
                      {c.like_count != null && (
                        <span>{c.like_count} likes</span>
                      )}
                      {c.created_time && (
                        <span>
                          {new Date(c.created_time).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs whitespace-pre-wrap">
                    {c.message}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px]">
                    <button
                      onClick={() => setFbNewComment(`@${c.from_name} `)}
                      className="hover:underline"
                    >
                      Reply
                    </button>
                    <button
                      onClick={() => toggleHideFbComment(c, !c.is_hidden)}
                      className="hover:underline"
                    >
                      {c.is_hidden ? "Unhide" : "Hide"}
                    </button>
                    <button
                      onClick={() => deleteFbComment(c.fb_comment_id)}
                      className="text-red-300 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-[#3a3b3c] p-3">
              <div className="flex items-center gap-2">
                <input
                  value={fbNewComment}
                  onChange={(e) => setFbNewComment(e.target.value)}
                  placeholder="Write a comment…"
                  className="flex-1 bg-[#3a3b3c] rounded-full px-3 py-2 text-xs outline-none"
                />
                <button
                  onClick={() => sendFbComment(null)}
                  disabled={fbCommentLoading || !fbNewComment.trim()}
                  className={cn(
                    "w-9 h-9 rounded-full bg-[#2374e1] flex items-center justify-center",
                    fbCommentLoading && "opacity-60 cursor-not-allowed"
                  )}
                >
                  {fbCommentLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
