// app/(admin)/social/facebook/CampaignList.jsx
"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  Facebook,
  Image as ImageIcon,
  Wand2,
  Send,
  Loader2,
  MessageCircle,
  ThumbsUp,
  Eye,
  Trash2,
  Edit,
  X,
  ChevronDown,
} from "lucide-react";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

const LS_KEY = "fb_scheduled_posts";

export default function CampaignList() {
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [error, setError] = useState("");

  // ⭐ Local scheduled posts (stored in localStorage)
  const [scheduledPosts, setScheduledPosts] = useState([]);

  // create composer
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState("");
  const [tags, setTags] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [mediaType, setMediaType] = useState("IMAGE"); // IMAGE | VIDEO
  const [creating, setCreating] = useState(false);

  // ⭐ Scheduling state (local-only)
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(""); // yyyy-MM-dd
  const [scheduledTime, setScheduledTime] = useState(""); // HH:mm
  const [scheduling, setScheduling] = useState(false);

  // edit
  const [editingId, setEditingId] = useState(null);
  const [editMessage, setEditMessage] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // comments drawer
  const [activePostForComments, setActivePostForComments] = useState(null);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [newComment, setNewComment] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);

  // ref to always have latest scheduledPosts inside interval
  const scheduledRef = useRef([]);
  useEffect(() => {
    scheduledRef.current = scheduledPosts;
  }, [scheduledPosts]);

  useEffect(() => {
    fetchPosts();

    // Load scheduled posts from localStorage
    try {
      const raw = typeof window !== "undefined"
        ? window.localStorage.getItem(LS_KEY)
        : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setScheduledPosts(parsed);
        }
      }
    } catch (err) {
      console.error("Error reading fb_scheduled_posts from localStorage", err);
    }
  }, []);

  // Persist scheduled posts to localStorage when changed
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LS_KEY, JSON.stringify(scheduledPosts));
      }
    } catch (err) {
      console.error("Error writing fb_scheduled_posts to localStorage", err);
    }
  }, [scheduledPosts]);

  async function fetchPosts() {
    try {
      setLoadingPosts(true);
      setError("");
      const res = await fetch("/api/facebook/page-posts");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load posts");
      }
      setPosts(json.data || []);
    } catch (err) {
      console.error(err);
      setError(String(err.message || err));
    } finally {
      setLoadingPosts(false);
    }
  }

  function resetCreateForm() {
    setMessage("");
    setTags("");
    setMediaFile(null);
    setMediaPreview("");
    setMediaType("IMAGE");
    setIsScheduled(false);
    setScheduledDate("");
    setScheduledTime("");
    setScheduling(false);
  }

  async function uploadMediaIfAny() {
    if (!mediaFile) return null;
    const formData = new FormData();
    formData.append("file", mediaFile);
    formData.append("folder", "facebook"); // uses facebook-media bucket
    const res = await fetch("/api/uploads/social", {
      method: "POST",
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || "Upload failed");
    }
    // Support {url} or {publicUrl}/etc
    return json.url || json.publicUrl || json.publicURL || null;
  }

  function buildFullMessage(msg, hash) {
    const m = (msg || "").trim();
    const h = (hash || "").trim();
    if (!m && !h) return "";
    if (!h) return m;
    if (!m) return h;
    return `${m}\n\n${h}`;
  }

  // 👉 Post immediately (unchanged)
  async function handleCreatePost(e) {
    if (e) e.preventDefault();

    if (!message.trim() && !mediaFile) {
      alert("Write something or attach a media file before posting.");
      return;
    }

    try {
      setCreating(true);
      setError("");

      const fullMessage = buildFullMessage(message, tags);
      const mediaUrl = await uploadMediaIfAny();

      const res = await fetch("/api/facebook/page-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: fullMessage,
          media_url: mediaUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create post");
      }

      resetCreateForm();
      setShowCreate(false);
      fetchPosts();
    } catch (err) {
      console.error(err);
      setError(String(err.message || err));
    } finally {
      setCreating(false);
    }
  }

  // ⭐ Local-only scheduler: store in localStorage and a JS timer posts later
  async function handleSchedulePost() {
    if (!message.trim() && !mediaFile) {
      alert("Write something or attach a media file before scheduling.");
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

    const fullMessage = buildFullMessage(message, tags);

    try {
      setScheduling(true);
      setError("");

      // Upload media now so we only need a URL at fire time
      const mediaUrl = await uploadMediaIfAny();

      const job = {
        id: `fb-local-${Date.now()}`,
        channel: "facebook",
        message: fullMessage,
        media_url: mediaUrl,
        media_type: mediaType,
        scheduled_at: scheduledLocal.toISOString(),
        status: "pending",
        created_at: new Date().toISOString(),
      };

      setScheduledPosts((prev) => [job, ...prev]);

      alert(
        `Facebook post scheduled locally for ${scheduledLocal.toLocaleString()}. ` +
          "Keep this admin page open around that time to let it auto-post."
      );

      resetCreateForm();
      setShowCreate(false);
    } catch (err) {
      console.error("handleSchedulePost error:", err);
      alert("Failed to schedule post: " + (err.message || err));
    } finally {
      setScheduling(false);
    }
  }

  // 🔁 Background timer: auto-post when local scheduled time is reached
  useEffect(() => {
    const interval = setInterval(async () => {
      const now = Date.now();
      const snapshot = scheduledRef.current;

      // find due jobs that are still pending
      const dueJobs = snapshot.filter((job) => {
        if (job.status !== "pending") return false;
        if (!job.scheduled_at) return false;
        const t = new Date(job.scheduled_at).getTime();
        return !isNaN(t) && t <= now;
      });

      if (!dueJobs.length) return;

      for (const job of dueJobs) {
        await publishScheduledJob(job);
      }
    }, 30_000); // check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Helper: publish one scheduled job via /api/facebook/page-posts
  async function publishScheduledJob(job) {
    // mark as processing
    setScheduledPosts((prev) =>
      prev.map((j) =>
        j.id === job.id ? { ...j, status: "processing" } : j
      )
    );

    try {
      const res = await fetch("/api/facebook/page-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: job.message,
          media_url: job.media_url || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to auto-post scheduled job");
      }

      // mark as posted
      setScheduledPosts((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? {
                ...j,
                status: "posted",
                posted_at: new Date().toISOString(),
              }
            : j
        )
      );

      // refresh feed from Facebook (so if a post was deleted on FB, next refresh hides it)
      fetchPosts();
    } catch (err) {
      console.error("publishScheduledJob error:", err);
      setScheduledPosts((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? {
                ...j,
                status: "failed",
                error_message: err.message || String(err),
              }
            : j
        )
      );
    }
  }

  // ✅ AI optimize using same /api/ai/social-copy as Instagram
  async function handleGenerateCopy() {
    const baseText = message.trim();
    if (!baseText) {
      alert("Base caption / text is required");
      return;
    }

    try {
      setAiLoading(true);
      const res = await fetch("/api/ai/social-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseText,
          channel: "facebook",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI error");

      if (json.caption) {
        setMessage(String(json.caption));
      }

      if (json.hashtags !== undefined) {
        let t = "";
        if (Array.isArray(json.hashtags)) {
          t = json.hashtags.join(" ");
        } else {
          t = String(json.hashtags);
        }
        setTags(t);
      }
    } catch (err) {
      console.error(err);
      alert("AI generation failed: " + (err.message || err));
    } finally {
      setAiLoading(false);
    }
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
    setMediaType(file.type.startsWith("video") ? "VIDEO" : "IMAGE");
  }

  // edit post
  function openEdit(post) {
    setEditingId(post.fb_post_id);
    setEditMessage(post.message || "");
  }

  async function saveEdit() {
    if (!editingId || !editMessage.trim()) return;
    try {
      setEditLoading(true);
      const res = await fetch("/api/facebook/page-posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fb_post_id: editingId,
          message: editMessage,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to edit post");
      setEditingId(null);
      setEditMessage("");
      fetchPosts();
    } catch (err) {
      console.error(err);
      alert("Edit failed: " + (err.message || err));
    } finally {
      setEditLoading(false);
    }
  }

  async function deletePost(post) {
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
      if (!res.ok) throw new Error(json.error || "Failed to delete");
      fetchPosts();
    } catch (err) {
      console.error(err);
      alert("Delete failed: " + (err.message || err));
    }
  }

  // comments
  async function openCommentsDrawer(post) {
    setActivePostForComments(post);
    setComments([]);
    setCommentError("");
    setLoadingComments(true);
    try {
      const res = await fetch(
        `/api/facebook/comments?fb_post_id=${encodeURIComponent(
          post.fb_post_id
        )}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load comments");
      setComments(json.data || []);
    } catch (err) {
      console.error(err);
      setCommentError(String(err.message || err));
    } finally {
      setLoadingComments(false);
    }
  }

  function closeCommentsDrawer() {
    setActivePostForComments(null);
    setComments([]);
    setNewComment("");
    setCommentError("");
  }

  async function sendComment(parentCommentId = null) {
    if (!activePostForComments || !newComment.trim()) return;
    try {
      setCommentLoading(true);
      const res = await fetch("/api/facebook/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fb_post_id: parentCommentId ? null : activePostForComments.fb_post_id,
          parent_comment_id: parentCommentId,
          message: newComment,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send comment");
      setComments((prev) => [json.data, ...prev]);
      setNewComment("");
    } catch (err) {
      console.error(err);
      alert("Comment failed: " + (err.message || err));
    } finally {
      setCommentLoading(false);
    }
  }

  async function deleteComment(commentId) {
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
      setComments((prev) => prev.filter((c) => c.fb_comment_id !== commentId));
    } catch (err) {
      console.error(err);
      alert("Delete comment failed: " + (err.message || err));
    }
  }

  async function toggleHideComment(comment, nextHidden) {
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
      setComments((prev) =>
        prev.map((c) =>
          c.fb_comment_id === comment.fb_comment_id ? json.data : c
        )
      );
    } catch (err) {
      console.error(err);
      alert("Hide/unhide failed: " + (err.message || err));
    }
  }

  const visibleScheduled = scheduledPosts.filter(
    (job) => job.status === "pending" || job.status === "processing"
  );

  return (
    <div className="min-h-screen bg-[#18191a] text-[#e4e6eb]">
      {/* top bar */}
      <div className="border-b border-[#3a3b3c] px-6 py-4 flex items-center justify-between sticky top-0 z-20 bg-[#18191a]/90 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#2374e1] flex items-center justify-center">
            <Facebook className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-semibold flex items-center gap-2">
              Facebook Campaigns
              <span className="px-2 py-0.5 text-xs rounded-full bg-[#3a3b3c] text-[#b0b3b8]">
                Admin
              </span>
            </div>
            <div className="text-xs text-[#b0b3b8]">
              Manage posts, comments & AI copy
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#2374e1] hover:bg-[#1b63c9] text-sm font-medium"
        >
          <ImageIcon className="w-4 h-4" />
          {showCreate ? "Close composer" : "Create post"}
        </button>
      </div>

      {error && (
        <div className="px-6 pt-3">
          <div className="bg-[#3a3b3c] text-red-300 text-sm rounded-lg px-4 py-2 border border-red-500/40">
            {error}
          </div>
        </div>
      )}

      {/* composer */}
      {showCreate && (
        <div className="px-6 pt-4">
          <div className="max-w-2xl bg-[#242526] rounded-xl border border-[#3a3b3c] p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm">Create post</div>
              <button
                onClick={() => {
                  setShowCreate(false);
                  resetCreateForm();
                }}
                className="text-[#b0b3b8] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePost} className="space-y-3">
              <textarea
                className="w-full bg-[#3a3b3c] rounded-lg px-3 py-2 text-sm outline-none resize-none min-h-[80px]"
                placeholder="What's on your mind?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />

              <textarea
                className="w-full bg-[#3a3b3c] rounded-lg px-3 py-2 text-xs outline-none resize-none min-h-[40px]"
                placeholder="#hashtags (optional)"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-full bg-[#3a3b3c] cursor-pointer hover:bg-[#4a4b4d]">
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
                  onClick={handleGenerateCopy}
                  disabled={aiLoading}
                  className={cn(
                    "inline-flex items-center gap-2 text-xs px-3 py-2 rounded-full bg-[#3a3b3c] hover:bg-[#4a4b4d]",
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
              </div>

              {mediaPreview && (
                <div className="rounded-lg overflow-hidden border border-[#3a3b3c] bg-black max-h-64 flex items-center justify-center">
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

              {/* ⭐ Scheduling controls */}
              <div className="space-y-2 pt-2 border-t border-[#3a3b3c]">
                <label className="inline-flex items-center gap-2 text-[11px] text-[#e4e6eb]">
                  <input
                    type="checkbox"
                    className="rounded border-[#3a3b3c] bg-[#18191a]"
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                  />
                  <span>Schedule this post instead of posting now (local)</span>
                </label>

                {isScheduled && (
                  <div className="flex flex-wrap items-center gap-3 text-[11px]">
                    <div className="flex flex-col">
                      <span className="text-[#b0b3b8] mb-0.5">Date</span>
                      <input
                        type="date"
                        className="rounded-lg border border-[#3a3b3c] bg-[#18191a] px-2 py-1 text-xs outline-none"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[#b0b3b8] mb-0.5">Time</span>
                      <input
                        type="time"
                        className="rounded-lg border border-[#3a3b3c] bg-[#18191a] px-2 py-1 text-xs outline-none"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                      />
                    </div>
                    <span className="text-[#b0b3b8]">
                      Uses your local timezone and this browser tab.
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={resetCreateForm}
                  className="px-3 py-1.5 rounded-full text-xs bg-[#3a3b3c] hover:bg-[#4a4b4d]"
                  disabled={creating || scheduling}
                >
                  Clear
                </button>

                {!isScheduled ? (
                  <button
                    type="submit"
                    disabled={creating || (!message.trim() && !mediaFile)}
                    className={cn(
                      "inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium bg-[#2374e1] hover:bg-[#1b63c9]",
                      creating && "opacity-70 cursor-not-allowed"
                    )}
                  >
                    {creating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>Post now</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={
                      scheduling ||
                      (!message.trim() && !mediaFile) ||
                      !scheduledDate ||
                      !scheduledTime
                    }
                    onClick={handleSchedulePost}
                    className={cn(
                      "inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium bg-indigo-600 hover:bg-indigo-700",
                      scheduling && "opacity-70 cursor-not-allowed"
                    )}
                  >
                    {scheduling ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>Schedule (local)</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* posts feed + scheduled list */}
      <div className="px-6 pt-4 pb-10 max-w-3xl mx-auto">
        {/* Scheduled posts panel */}
        {visibleScheduled.length > 0 && (
          <div className="mb-4 bg-[#242526] border border-[#3a3b3c] rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-[#e4e6eb]">
                Scheduled Facebook posts (local to this browser)
              </div>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {visibleScheduled.map((job) => {
                const when = job.scheduled_at
                  ? new Date(job.scheduled_at)
                  : null;
                const whenLabel = when
                  ? when.toLocaleString()
                  : "Unknown time";
                const shortMsg =
                  job.message && job.message.length > 100
                    ? job.message.slice(0, 97) + "..."
                    : job.message || "(no message)";

                return (
                  <div
                    key={job.id}
                    className="flex items-center justify-between rounded-lg bg-[#3a3b3c] px-3 py-2 text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[#e4e6eb] line-clamp-1">
                        {shortMsg}
                      </div>
                      <div className="text-[10px] text-[#b0b3b8]">
                        Scheduled at: {whenLabel}
                      </div>
                    </div>
                    <div className="ml-3 text-[10px]">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full capitalize",
                          job.status === "processing"
                            ? "bg-yellow-500/20 text-yellow-300"
                            : "bg-blue-500/20 text-blue-300"
                        )}
                      >
                        {job.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent posts header */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold flex items-center gap-2">
            Recent posts
            <button
              onClick={fetchPosts}
              className="text-xs px-2 py-1 rounded-full bg-[#3a3b3c] hover:bg-[#4a4b4d]"
            >
              Refresh
            </button>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#b0b3b8]">
            <ChevronDown className="w-3 h-3" />
            Newest first
          </div>
        </div>

        {loadingPosts && (
          <div className="flex items-center justify-center py-10 text-[#b0b3b8]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading posts…
          </div>
        )}

        {!loadingPosts && posts.length === 0 && (
          <div className="text-center text-[#b0b3b8] text-sm py-10 bg-[#242526] border border-[#3a3b3c] rounded-xl">
            No posts yet. Create your first campaign post above.
          </div>
        )}

        <div className="space-y-4">
          {posts.map((post) => {
            const created = post.created_time
              ? new Date(post.created_time)
              : null;
            const createdLabel = created
              ? created.toLocaleString()
              : "Unknown date";

            const rawAttachments = post.attachments;
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

            const likes =
              post.reactions_count ??
              post.insights?.find((i) => i.name === "post_engaged_users")
                ?.values?.[0]?.value ??
              0;
            const commentsCount = post.comments_count ?? 0;

            return (
              <article
                key={post.id || post.fb_post_id}
                className="bg-[#242526] rounded-xl border border-[#3a3b3c] overflow-hidden"
              >
                {/* header */}
                <div className="px-4 pt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#3a3b3c]" />
                    <div>
                      <div className="text-sm font-semibold">
                        Facebook Page
                      </div>
                      <div className="text-[11px] text-[#b0b3b8]">
                        {createdLabel}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#b0b3b8]">
                    {post.permalink_url && (
                      <a
                        href={post.permalink_url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        View on Facebook
                      </a>
                    )}
                  </div>
                </div>

                {/* body */}
                <div className="px-4 pt-2 pb-1 text-sm whitespace-pre-wrap">
                  {editingId === post.fb_post_id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editMessage}
                        onChange={(e) => setEditMessage(e.target.value)}
                        className="w-full bg-[#3a3b3c] rounded-lg px-3 py-2 text-sm outline-none resize-none min-h-[70px]"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          className="text-xs px-3 py-1 rounded-full bg-[#3a3b3c]"
                          onClick={() => {
                            setEditingId(null);
                            setEditMessage("");
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveEdit}
                          disabled={editLoading || !editMessage.trim()}
                          className={cn(
                            "text-xs px-3 py-1 rounded-full bg-[#2374e1] hover:bg-[#1b63c9]",
                            editLoading && "opacity-60 cursor-not-allowed"
                          )}
                        >
                          {editLoading ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>{post.message}</>
                  )}
                </div>

                {/* media */}
                {mediaUrl && (
                  <div className="mt-1 bg-black flex items-center justify-center max-h-[480px]">
                    {isVideo ? (
                      <video
                        key={post.fb_post_id}
                        src={mediaUrl}
                        controls
                        playsInline
                        className="max-h-[480px] w-full object-contain"
                      />
                    ) : (
                      <img
                        src={mediaUrl}
                        alt=""
                        className="max-h-[480px] w-full object-contain"
                      />
                    )}
                  </div>
                )}

                {/* footer */}
                <div className="px-4 pt-2 pb-2 border-t border-[#3a3b3c]">
                  <div className="flex items-center justify-between text-[11px] text-[#b0b3b8] mb-1.5">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <ThumbsUp className="w-3 h-3" />
                        {likes || 0} likes
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" />
                        {commentsCount || 0} comments
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {post.insights ? "Insights captured" : "No insights"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-[#3a3b3c]/80 mt-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openCommentsDrawer(post)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-[#3a3b3c]"
                      >
                        <MessageCircle className="w-3 h-3" />
                        Comments
                      </button>
                      <button
                        onClick={() => openEdit(post)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-[#3a3b3c]"
                      >
                        <Edit className="w-3 h-3" />
                        Edit
                      </button>
                    </div>
                    <button
                      onClick={() => deletePost(post)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-[#3a3b3c] text-red-300"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* comments drawer */}
      {activePostForComments && (
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
              {loadingComments && (
                <div className="flex items-center justify-center py-4 text-[#b0b3b8]">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Loading comments…
                </div>
              )}
              {commentError && (
                <div className="text-red-300 text-xs">{commentError}</div>
              )}
              {!loadingComments && comments.length === 0 && (
                <div className="text-xs text-[#b0b3b8]">
                  No comments yet on this post.
                </div>
              )}
              {comments.map((c) => (
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
                      onClick={() => setNewComment(`@${c.from_name} `)}
                      className="hover:underline"
                    >
                      Reply
                    </button>
                    <button
                      onClick={() => toggleHideComment(c, !c.is_hidden)}
                      className="hover:underline"
                    >
                      {c.is_hidden ? "Unhide" : "Hide"}
                    </button>
                    <button
                      onClick={() => deleteComment(c.fb_comment_id)}
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
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment…"
                  className="flex-1 bg-[#3a3b3c] rounded-full px-3 py-2 text-xs outline-none"
                />
                <button
                  onClick={() => sendComment(null)}
                  disabled={commentLoading || !newComment.trim()}
                  className={cn(
                    "w-9 h-9 rounded-full bg-[#2374e1] flex items-center justify-center",
                    commentLoading && "opacity-60 cursor-not-allowed"
                  )}
                >
                  {commentLoading ? (
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
  );
}
