"use client";

import { useEffect, useState } from "react";
import { AdminBackBar } from "@/components/admin/AdminBackBar";

export default function InstagramCommentsPage() {
  const [posts, setPosts] = useState([]);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [comments, setComments] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingComments, setLoadingComments] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [replyText, setReplyText] = useState({});
  const [replyingId, setReplyingId] = useState(null);
  const [message, setMessage] = useState("");

  // Load published posts with instagram_media_id
  useEffect(() => {
    const loadPosts = async () => {
      setLoadingPosts(true);
      try {
        // Via admin service-role endpoint — the anon Supabase client is
        // RLS-blocked from `campaign_posts` under NextAuth.
        const res = await fetch("/api/instagram/campaign-posts");
        const json = await res.json();
        if (!res.ok || !json.ok) {
          console.error("Load posts error:", json.error);
          setMessage("Failed to load posts.");
          return;
        }
        const data = json.data;

        const filtered = (data || []).filter(
          (p) => p.status === "published" && p.instagram_media_id
        );

        setPosts(filtered);
        if (filtered.length > 0) {
          setSelectedPostId(filtered[0].id);
        }
      } catch (err) {
        console.error(err);
        setMessage("Error loading posts.");
      } finally {
        setLoadingPosts(false);
      }
    };

    loadPosts();
  }, []);

  const loadComments = async (postId) => {
    if (!postId) return;
    setLoadingComments(true);
    setMessage("");
    try {
      const res = await fetch(`/api/instagram/posts/${postId}/comments`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load comments");
      }
      setComments(json.comments || []);
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Error loading comments.");
    } finally {
      setLoadingComments(false);
    }
  };

  // Load comments when selected post changes
  useEffect(() => {
    if (!selectedPostId) return;
    loadComments(selectedPostId);
  }, [selectedPostId]);

  const handleSync = async () => {
    if (!selectedPostId) return;
    setSyncing(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/instagram/posts/${selectedPostId}/comments/sync`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to sync comments");
      }
      setMessage(`Synced ${json.synced_count || 0} comments from Instagram.`);
      await loadComments(selectedPostId);
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Error syncing comments.");
    } finally {
      setSyncing(false);
    }
  };

  const handleReplyChange = (commentId, value) => {
    setReplyText((prev) => ({ ...prev, [commentId]: value }));
  };

  const handleReply = async (commentId) => {
    const text = replyText[commentId];
    if (!text) {
      setMessage("Reply text cannot be empty.");
      return;
    }
    setReplyingId(commentId);
    setMessage("");
    try {
      const res = await fetch(
        `/api/instagram/comments/${commentId}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to reply");
      }
      setMessage("Reply posted on Instagram.");
      setReplyText((prev) => ({ ...prev, [commentId]: "" }));
      await loadComments(selectedPostId);
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Error posting reply.");
    } finally {
      setReplyingId(null);
    }
  };

  return (
    <>
    <AdminBackBar title="Instagram Comments" to="/admin" />
    <main className="min-h-screen px-4 py-10 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">
        Instagram Comments Manager
      </h1>

      {message && (
        <div className="mb-4 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
          {message}
        </div>
      )}

      {/* Post selector */}
      <section className="mb-6">
        <label className="block text-sm font-medium mb-1">
          Select Published Post
        </label>
        {loadingPosts ? (
          <p>Loading posts...</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-gray-600">
            No published posts with Instagram media yet.
          </p>
        ) : (
          <select
            className="border rounded-md px-3 py-2 text-sm w-full max-w-xl"
            value={selectedPostId}
            onChange={(e) => setSelectedPostId(e.target.value)}
          >
            {posts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.caption
                  ? p.caption.slice(0, 60)
                  : "Untitled post"}{" "}
                {p.published_at
                  ? ` • ${new Date(p.published_at).toLocaleString()}`
                  : ""}
              </option>
            ))}
          </select>
        )}

        <div className="mt-3 flex gap-3">
          <button
            onClick={handleSync}
            disabled={!selectedPostId || syncing}
            className="px-4 py-2 rounded-md text-sm font-medium bg-black text-white disabled:opacity-60"
          >
            {syncing ? "Syncing..." : "Sync comments from Instagram"}
          </button>
        </div>
      </section>

      {/* Comments list */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Comments</h2>
        {loadingComments ? (
          <p>Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-gray-600">
            No comments yet. Click sync to fetch from Instagram.
          </p>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <div
                key={c.id}
                className="border rounded-lg p-3 bg-white text-sm"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="font-semibold">
                    {c.from_username || "Unknown user"}
                  </div>
                  <div className="text-xs text-gray-500">
                    {c.direction === "inbound" ? "Incoming" : "Your reply"} •{" "}
                    {c.commented_at
                      ? new Date(c.commented_at).toLocaleString()
                      : ""}
                  </div>
                </div>
                <div className="mb-2 whitespace-pre-wrap">{c.text}</div>

                {c.direction === "inbound" && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      className="w-full border rounded-md px-2 py-1 text-xs"
                      rows={2}
                      placeholder="Write a reply..."
                      value={replyText[c.id] || ""}
                      onChange={(e) =>
                        handleReplyChange(c.id, e.target.value)
                      }
                    />
                    <button
                      onClick={() => handleReply(c.id)}
                      disabled={replyingId === c.id}
                      className="px-3 py-1 rounded-md text-xs font-medium bg-black text-white disabled:opacity-60"
                    >
                      {replyingId === c.id ? "Replying..." : "Reply"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
    </>
  );
}
