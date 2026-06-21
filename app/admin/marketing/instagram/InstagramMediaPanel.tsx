"use client";

import React, { useEffect, useState, useRef } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabaseClient";

type InstagramMedia = {
  id: string;
  ig_media_id: string;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  like_count: number | null;
  comments_count: number | null;
  timestamp: string | null;
};

type InstagramComment = {
  id: string;
  ig_comment_id: string;
  ig_media_id: string;
  from_username: string | null;
  message: string | null;
  like_count: number | null;
  created_time: string | null;
};

type AiCopyResponse = {
  caption: string;
  hashtags?: string | string[];
};

type ScheduledPost = {
  id: string;
  platform: string;
  message: string | null;
  media_url: string | null;
  media_type: string | null;
  scheduled_at: string;
  status: string;
  last_error: string | null;
  error_message: string | null;
  ig_media_id: string | null;
  posted_at: string | null;
  created_at: string;
  payload?: any;
};

/* ---------- Media preview (image / video) ---------- */

function MediaPreview({ media }: { media: InstagramMedia }) {
  const type = (media.media_type || "").toUpperCase();

  if (type === "VIDEO" || type === "REEL") {
    return (
      <div className="w-full aspect-square bg-black rounded-t-lg overflow-hidden flex items-center justify-center">
        <video
          key={media.ig_media_id}
          controls
          playsInline
          preload="metadata"
          className="w-full h-full object-contain"
        >
          {media.media_url && (
            <source src={media.media_url} type="video/mp4" />
          )}
          Your browser does not support HTML5 video.
        </video>
      </div>
    );
  }

  // image / carousel
  return (
    <div className="w-full aspect-square bg-gray-900 rounded-t-lg overflow-hidden flex items-center justify-center">
      {media.media_url ? (
        <img
          src={media.media_url}
          alt={media.caption || "Instagram media"}
          className="w-full h-full object-cover"
        />
      ) : media.thumbnail_url ? (
        <img
          src={media.thumbnail_url}
          alt={media.caption || "Instagram media"}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="text-[11px] text-gray-400">No media preview</div>
      )}
    </div>
  );
}

/* ---------- Main panel ---------- */

export default function InstagramMediaPanel() {
  const [media, setMedia] = useState<InstagramMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New post modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newMediaUrl, setNewMediaUrl] = useState("");
  const [newMediaType, setNewMediaType] = useState<"IMAGE" | "VIDEO">("IMAGE");
  const [newCaption, setNewCaption] = useState("");
  const [newTags, setNewTags] = useState("");
  const [aiLoadingNew, setAiLoadingNew] = useState(false);

  // Scheduling state
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(""); // yyyy-MM-dd
  const [scheduledTime, setScheduledTime] = useState(""); // HH:mm
  const [scheduling, setScheduling] = useState(false);

  // Scheduled posts (pending only)
  const [scheduled, setScheduled] = useState<ScheduledPost[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduledError, setScheduledError] = useState<string | null>(null);

// 👇 NEW: store the next scheduled timestamp (ms since epoch)
const nextScheduledTimeRef = useRef<number | null>(null);

  // Edit caption modal
  const [editMedia, setEditMedia] = useState<InstagramMedia | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editTags, setEditTags] = useState("");
  const [aiLoadingEdit, setAiLoadingEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Comments drawer
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsMedia, setCommentsMedia] = useState<InstagramMedia | null>(
    null
  );
  const [comments, setComments] = useState<InstagramComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);

  /* ---------- Helpers ---------- */

  const parseUploadResponse = (json: any, file?: File) => {
    // Support both {url, mimeType} and {publicUrl, contentType} etc.
    const url: string =
      json?.url || json?.publicUrl || json?.publicURL || json?.path || "";
    const mime: string =
      json?.mimeType || json?.contentType || file?.type || "";
    const isVideo =
      mime.startsWith("video/") || (file && file.type.startsWith("video/"));
    return { url, mime, isVideo };
  };

  const resetNewPostState = () => {
    setNewFileName("");
    setNewMediaUrl("");
    setNewMediaType("IMAGE");
    setNewCaption("");
    setNewTags("");
    setAiLoadingNew(false);
    setUploading(false);
    setIsScheduled(false);
    setScheduledDate("");
    setScheduledTime("");
    setScheduling(false);
  };

  const buildFinalCaption = (caption: string, tags: string) => {
    const c = caption.trim();
    const t = tags.trim();
    if (!c && !t) return "";
    if (!t) return c;
    if (!c) return t;
    return `${c}\n\n${t}`;
  };

  /* ---------- Load media ---------- */

  const fetchMedia = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/instagram/media");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load Instagram media");
      }
      setMedia(json.data || []);
    } catch (e: any) {
      console.error("fetchMedia error", e);
      setError(e.message || "Failed to load Instagram media");
    } finally {
      setLoading(false);
    }
  };

  const refreshMedia = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await fetch("/api/instagram/media");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to refresh Instagram media");
      }
      setMedia(json.data || []);
    } catch (e: any) {
      console.error("refreshMedia error", e);
      setError(e.message || "Failed to refresh Instagram media");
    } finally {
      setRefreshing(false);
    }
  };

  /* ---------- Load scheduled posts (pending only) ---------- */

  const loadScheduledPosts = async () => {
    try {
      setScheduledLoading(true);
      setScheduledError(null);

      const { data, error } = await supabase
        .from("social_scheduled_posts")
        .select(
          "id, platform, message, media_url, media_type, scheduled_at, status, last_error, error_message, ig_media_id, posted_at, created_at, payload"
        )
        .eq("platform", "instagram")
        .eq("status", "pending")
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      setScheduled((data || []) as ScheduledPost[]);
    } catch (e: any) {
      console.error("loadScheduledPosts error", e);
      setScheduledError(
        e.message || e?.details || "Failed to load scheduled posts"
      );
    } finally {
      setScheduledLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
    loadScheduledPosts();
  }, []);

  /* ---------- Lightweight frontend "cron" ---------- */
  // Ping backend processor every 60s and refresh pending schedules.
// Dynamically schedule the processor only near the next post time
useEffect(() => {
  if (!scheduled.length) {
    nextScheduledTimeRef.current = null;
    return;
  }

  const next = scheduled[0]; // because we sorted ascending
  if (!next?.scheduled_at) {
    nextScheduledTimeRef.current = null;
    return;
  }

  const ts = new Date(next.scheduled_at).getTime();
  if (Number.isFinite(ts)) {
    nextScheduledTimeRef.current = ts;
  } else {
    nextScheduledTimeRef.current = null;
  }
}, [scheduled]);

useEffect(() => {
  const interval = setInterval(() => {
    const nextTime = nextScheduledTimeRef.current;

    // No pending jobs → do nothing
    if (!nextTime) return;

    const now = Date.now();
    const diff = nextTime - now;

    // Only trigger when we're close to the scheduled time
    const windowMs = 5 * 60_000; // 5 minutes
    if (diff > windowMs) {
      // Next job is more than 5 minutes away → skip this cycle
      return;
    }

    // Within 5 minutes (or already passed) → run processor once
    fetch("/api/social/process-scheduled", { method: "POST" })
      .then(() => {
        // Refresh pending list; this will recompute nextScheduledTimeRef
        loadScheduledPosts();
      })
      .catch((err) => {
        console.error("process-scheduled error", err);
      });
  }, 60_000); // check every minute

  return () => clearInterval(interval);
}, []); // NOTE: empty deps on purpose


  /* ---------- AI caption helper ---------- */

  const runAiOptimization = async (
    baseText: string,
    setterCaption: (v: string) => void,
    setterTags: (v: string) => void,
    setLoadingFlag: (v: boolean) => void
  ) => {
    const text = baseText.trim();
    if (!text) {
      alert("Base caption / text is required");
      return;
    }

    try {
      setLoadingFlag(true);
      const res = await fetch("/api/ai/social-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseText: text,
          channel: "instagram",
        }),
      });

      const json: AiCopyResponse & { error?: string } = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "AI optimization failed");
      }

      // Always keep caption as string
      if (json.caption) {
        setterCaption(String(json.caption));
      }

      // Normalize hashtags into a single string
      if (json.hashtags !== undefined) {
        let tags = "";
        if (Array.isArray(json.hashtags)) {
          tags = json.hashtags.join(" ");
        } else {
          tags = String(json.hashtags);
        }
        setterTags(tags);
      }
    } catch (e: any) {
      console.error("AI optimize error", e);
      alert(e.message || "AI optimization failed");
    } finally {
      setLoadingFlag(false);
    }
  };

  /* ---------- New post: upload + publish ---------- */

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      setNewFileName(file.name);

      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/uploads/social", {
        method: "POST",
        body: fd,
      });

      const json = await res.json();
      if (!res.ok) {
        console.error("Upload error:", json);
        throw new Error(json.error || "Upload failed");
      }

      const { url, isVideo } = parseUploadResponse(json, file);
      if (!url) {
        throw new Error("Upload did not return a URL");
      }

      setNewMediaUrl(url);
      setNewMediaType(isVideo ? "VIDEO" : "IMAGE");
    } catch (e: any) {
      console.error("handleFileChange error", e);
      alert(e.message || "Upload failed");
      setNewFileName("");
      setNewMediaUrl("");
    } finally {
      setUploading(false);
    }
  };

  const handleCreatePost = async () => {
    if (!newMediaUrl) {
      alert("Please upload an image or video first.");
      return;
    }

    const finalCaption = buildFinalCaption(newCaption, newTags);

    try {
      setUploading(true);
      const res = await fetch("/api/instagram/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: finalCaption,
          media_url: newMediaUrl,
          media_type: newMediaType,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        console.error("POST /api/instagram/media", json);
        throw new Error(json.error || "Failed to publish Instagram media");
      }

      if (json.data) {
        setMedia((prev) => [json.data, ...prev]);
      }

      resetNewPostState();
      setShowNewModal(false);
    } catch (e: any) {
      console.error("handleCreatePost error", e);
      alert(e.message || "Failed to publish Instagram media");
    } finally {
      setUploading(false);
    }
  };

  /* ---------- Schedule post ---------- */

  const handleSchedulePost = async () => {
    if (!newMediaUrl) {
      alert("Please upload an image or video first.");
      return;
    }

    if (!scheduledDate || !scheduledTime) {
      alert("Please select both date and time for scheduling.");
      return;
    }

    const scheduledLocal = new Date(`${scheduledDate}T${scheduledTime}`);
    if (isNaN(scheduledLocal.getTime())) {
      alert("Invalid schedule date or time.");
      return;
    }

    if (scheduledLocal.getTime() < Date.now() - 60_000) {
      if (
        !confirm(
          "The selected time is in the past or very close to now. Schedule anyway?"
        )
      ) {
        return;
      }
    }

    const finalCaption = buildFinalCaption(newCaption, newTags);

    try {
      setScheduling(true);
      const res = await fetch("/api/social/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "instagram",
          caption: finalCaption,
          media_url: newMediaUrl,
          media_type: newMediaType,
          scheduled_at: scheduledLocal.toISOString(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        console.error("POST /api/social/schedule", json);
        throw new Error(json.error || "Failed to schedule Instagram post");
      }

      alert("Post scheduled successfully.");
      loadScheduledPosts(); // show at top immediately
      resetNewPostState();
      setShowNewModal(false);
    } catch (e: any) {
      console.error("handleSchedulePost error", e);
      alert(e.message || "Failed to schedule Instagram post");
    } finally {
      setScheduling(false);
    }
  };

  /* ---------- Edit caption ---------- */

  const openEditModal = (item: InstagramMedia) => {
    setEditMedia(item);
    setEditCaption(item.caption || "");
    setEditTags("");
    setAiLoadingEdit(false);
    setSavingEdit(false);
  };

  const handleSaveEdit = async () => {
    if (!editMedia) return;

    const finalCaption = buildFinalCaption(editCaption, editTags);

    if (!finalCaption) {
      alert("Caption cannot be empty.");
      return;
    }

    try {
      setSavingEdit(true);
      const res = await fetch("/api/instagram/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ig_media_id: editMedia.ig_media_id,
          caption: finalCaption,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        console.error("PATCH /api/instagram/media", json);
        throw new Error(json.error || "Failed to update caption");
      }

      if (json.data) {
        setMedia((prev) =>
          prev.map((m) =>
            m.ig_media_id === editMedia.ig_media_id
              ? { ...m, caption: json.data.caption }
              : m
          )
        );
      }

      setEditMedia(null);
    } catch (e: any) {
      console.error("handleSaveEdit error", e);
      alert(e.message || "Failed to update caption");
    } finally {
      setSavingEdit(false);
    }
  };

  /* ---------- Comments ---------- */

  const openComments = async (item: InstagramMedia) => {
    setCommentsMedia(item);
    setCommentsOpen(true);
    setReplyText("");
    try {
      setCommentsLoading(true);
      const res = await fetch(
        `/api/instagram/comments?ig_media_id=${encodeURIComponent(
          item.ig_media_id
        )}`
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load comments");
      }
      setComments(json.data || []);
    } catch (e: any) {
      console.error("openComments error", e);
      alert(e.message || "Failed to load comments");
    } finally {
      setCommentsLoading(false);
    }
  };

  const sendReply = async () => {
    if (!commentsMedia) return;
    const msg = replyText.trim();
    if (!msg) {
      alert("Reply cannot be empty");
      return;
    }
    try {
      setReplySending(true);
      const res = await fetch("/api/instagram/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ig_media_id: commentsMedia.ig_media_id,
          message: msg,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to send reply");
      }

      if (json.data) {
        setComments((prev) => [json.data, ...prev]);
      }
      setReplyText("");
    } catch (e: any) {
      console.error("sendReply error", e);
      alert(e.message || "Failed to send reply");
    } finally {
      setReplySending(false);
    }
  };

  /* ---------- Render ---------- */

  return (
    <div className="w-full px-4 py-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            Instagram Manager
          </h1>
          <p className="text-xs text-gray-500">
            Post with AI help, schedule posts and manage comments.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={refreshMedia}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <button
            type="button"
            onClick={() => {
              resetNewPostState();
              setShowNewModal(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-1 text-xs font-medium text-white shadow-sm hover:brightness-110"
          >
            + New Instagram Post
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* ---------- Scheduled Posts (top, pending only) ---------- */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold">Scheduled Posts</h2>
          {scheduledLoading && (
            <span className="text-[11px] text-gray-400">Loading…</span>
          )}
        </div>

        {scheduledError && (
          <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] text-red-700">
            {scheduledError}
          </div>
        )}

        {scheduled.length === 0 ? (
          <p className="text-[11px] text-gray-500">
            No pending scheduled posts. Use “Schedule this post” in the New Post
            modal.
          </p>
        ) : (
          <div className="space-y-2">
            {scheduled.map((sp) => (
              <div
                key={sp.id}
                className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg bg-gray-50 px-3 py-1.5"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[11px] text-gray-600 mb-0.5">
                    <span className="font-medium">
                      {sp.scheduled_at
                        ? format(
                            new Date(sp.scheduled_at),
                            "dd MMM yyyy, HH:mm"
                          )
                        : "Unknown time"}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                      PENDING
                    </span>
                  </div>
                  {sp.message && (
                    <p className="text-[11px] text-gray-800 whitespace-pre-wrap line-clamp-1">
                      {sp.message}
                    </p>
                  )}
                </div>
                {sp.media_url && (
                  <div className="w-9 h-9 rounded overflow-hidden border border-gray-300 flex-shrink-0">
                    <img
                      src={sp.media_url}
                      alt="scheduled media"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid of media */}
      {loading ? (
        <div className="py-6 text-center text-gray-500 text-xs">
          Loading Instagram media…
        </div>
      ) : media.length === 0 ? (
        <div className="py-6 text-center text-gray-500 text-xs">
          No Instagram media found. Try refreshing after posting.
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {media.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-lg shadow-sm flex flex-col overflow-hidden border border-gray-100 text-xs"
            >
              <MediaPreview media={item} />

              <div className="p-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>
                    {item.timestamp
                      ? format(new Date(item.timestamp), "dd MMM yyyy, hh:mm a")
                      : "Unknown date"}
                  </span>
                  {item.permalink && (
                    <a
                      href={item.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      View
                    </a>
                  )}
                </div>

                {item.caption && (
                  <p className="text-[12px] text-gray-800 whitespace-pre-wrap line-clamp-2">
                    {item.caption}
                  </p>
                )}

                <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                  <span>❤️ {item.like_count ?? 0}</span>
                  <span>💬 {item.comments_count ?? 0}</span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    className="px-2.5 py-0.5 text-[11px] rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => openComments(item)}
                    className="px-2.5 py-0.5 text-[11px] rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Comments
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        !confirm(
                          "Remove this media from the dashboard list? (Instagram post itself will NOT be deleted.)"
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
                        if (!res.ok) {
                          throw new Error(
                            json.error || "Failed to remove from dashboard"
                          );
                        }
                        setMedia((prev) =>
                          prev.filter(
                            (m) => m.ig_media_id !== item.ig_media_id
                          )
                        );
                      } catch (e: any) {
                        console.error("remove error", e);
                        alert(
                          e.message ||
                            "Failed to remove media from dashboard cache"
                        );
                      }
                    }}
                    className="ml-auto px-2.5 py-0.5 text-[11px] rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- New Post Modal ---------- */}
      {showNewModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl p-6 relative">
            <button
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
              onClick={() => {
                setShowNewModal(false);
                resetNewPostState();
              }}
            >
              ✕
            </button>

            <h2 className="text-lg font-semibold mb-3">New Instagram Post</h2>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Media file
                </label>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                  className="block w-full text-xs text-gray-700 file:mr-3 file:rounded-lg file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-50"
                />
                {newFileName && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    Selected: {newFileName} ({newMediaType})
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Caption
                </label>
                <textarea
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pink-500"
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>Need help with caption & tags?</span>
                <button
                  type="button"
                  disabled={aiLoadingNew}
                  onClick={() =>
                    runAiOptimization(
                      newCaption,
                      setNewCaption,
                      setNewTags,
                      setAiLoadingNew
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-pink-300 px-3 py-1 text-[11px] font-medium text-pink-600 hover:bg-pink-50 disabled:opacity-60"
                >
                  {aiLoadingNew ? "Optimizing…" : "Use AI to optimize"}
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Hashtags (optional)
                </label>
                <textarea
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-pink-500"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="#kbeauty #skincare ..."
                />
              </div>

              {/* Scheduling controls */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                  />
                  <span>Schedule this post instead of posting now</span>
                </label>

                {isScheduled && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-col">
                      <span className="text-[11px] text-gray-500 mb-0.5">
                        Date
                      </span>
                      <input
                        type="date"
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-pink-500"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-gray-500 mb-0.5">
                        Time
                      </span>
                      <input
                        type="time"
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-pink-500"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                      />
                    </div>
                    <span className="text-[11px] text-gray-400">
                      Uses your local timezone (browser time).
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewModal(false);
                    resetNewPostState();
                  }}
                  className="px-4 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>

                {!isScheduled ? (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={handleCreatePost}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 text-xs text-white font-medium shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {uploading ? "Posting…" : "Post now"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={scheduling || uploading}
                    onClick={handleSchedulePost}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 text-xs text-white font-medium shadow-sm hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {scheduling ? "Scheduling…" : "Schedule post"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Edit Caption Modal ---------- */}
      {editMedia && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl p-6 relative">
            <button
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
              onClick={() => setEditMedia(null)}
            >
              ✕
            </button>

            <h2 className="text-lg font-semibold mb-3">Edit caption</h2>

            <div className="space-y-4 text-sm">
              <div className="text-xs text-gray-500">
                Editing post:{" "}
                <span className="font-mono">{editMedia.ig_media_id}</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Caption
                </label>
                <textarea
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pink-500"
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Need better copy?</span>
                <button
                  type="button"
                  disabled={aiLoadingEdit}
                  onClick={() =>
                    runAiOptimization(
                      editCaption,
                      setEditCaption,
                      setEditTags,
                      setAiLoadingEdit
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-pink-300 px-3 py-1 text-[11px] font-medium text-pink-600 hover:bg-pink-50 disabled:opacity-60"
                >
                  {aiLoadingEdit ? "Optimizing…" : "Use AI to optimize"}
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Extra hashtags (optional)
                </label>
                <textarea
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-pink-500"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="#kbeauty #skincare ..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditMedia(null)}
                  className="px-4 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={handleSaveEdit}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 text-xs text-white font-medium shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                >
                  {savingEdit ? "Saving…" : "Save caption"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Comments Drawer ---------- */}
      {commentsOpen && commentsMedia && (
        <div className="fixed inset-0 z-40 flex">
          <div
            className="flex-1 bg-black/40"
            onClick={() => setCommentsOpen(false)}
          />
          <div className="w-full max-w-md bg-white shadow-xl h-full flex flex-col">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Comments</h3>
                <p className="text-xs text-gray-500 line-clamp-1">
                  {commentsMedia.caption}
                </p>
              </div>
              <button
                className="text-gray-400 hover:text-gray-600"
                onClick={() => setCommentsOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {commentsLoading ? (
                <div className="text-xs text-gray-500">
                  Loading comments…
                </div>
              ) : comments.length === 0 ? (
                <div className="text-xs text-gray-500">No comments yet.</div>
              ) : (
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">
                          {c.from_username || "User"}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {c.created_time
                            ? format(
                                new Date(c.created_time),
                                "dd MMM, HH:mm"
                              )
                            : ""}
                        </span>
                      </div>
                      <p className="text-gray-700 text-sm whitespace-pre-wrap">
                        {c.message}
                      </p>
                      <div className="text-[11px] text-gray-400 mt-1">
                        ❤️ {c.like_count ?? 0}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t px-4 py-3">
              <textarea
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pink-500"
                placeholder="Reply as page…"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  disabled={replySending}
                  onClick={sendReply}
                  className="px-4 py-1.5 rounded-lg bg-pink-600 text-xs font-medium text-white shadow-sm hover:bg-pink-700 disabled:opacity-60"
                >
                  {replySending ? "Sending…" : "Reply"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
