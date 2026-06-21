"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AdminBackBar } from "@/components/admin/AdminBackBar";

export default function InstagramPostsPage() {
    const [campaigns, setCampaigns] = useState([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState("");
    const [posts, setPosts] = useState([]);
    const [loadingPosts, setLoadingPosts] = useState(false);
    const [creating, setCreating] = useState(false);
    const [publishingId, setPublishingId] = useState(null);
    const [message, setMessage] = useState("");

    const [form, setForm] = useState({
        caption: "",
        media_url: "",
        media_type: "image",
    });

    // Load campaigns on mount
    useEffect(() => {
        const loadCampaigns = async () => {
            const { data, error } = await supabase
                .from("campaigns")
                .select("id, name")
                .order("created_at", { ascending: false });

            if (error) {
                console.error("Load campaigns error:", error);
                setMessage("Failed to load campaigns.");
                return;
            }
            setCampaigns(data || []);
            if (data && data.length > 0) {
                setSelectedCampaignId(data[0].id);
            }
        };

        loadCampaigns();
    }, []);

    // Load posts when campaign changes
    useEffect(() => {
        if (!selectedCampaignId) return;

        const loadPosts = async () => {
            setLoadingPosts(true);
            setMessage("");
            try {
                const res = await fetch(
                    `/api/instagram/posts?campaign_id=${selectedCampaignId}`
                );
                const json = await res.json();
                if (!res.ok) {
                    throw new Error(json.error || "Failed to load posts");
                }
                setPosts(json.posts || []);
            } catch (err) {
                console.error(err);
                setMessage(err.message || "Error loading posts.");
            } finally {
                setLoadingPosts(false);
            }
        };

        loadPosts();
    }, [selectedCampaignId]);

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleCreatePost = async (e) => {
        e.preventDefault();
        if (!selectedCampaignId) {
            setMessage("Please select a campaign first.");
            return;
        }
        setCreating(true);
        setMessage("");

        try {
            const res = await fetch("/api/instagram/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    campaign_id: selectedCampaignId,
                    caption: form.caption,
                    media_url: form.media_url,
                    media_type: form.media_type,
                }),
            });

            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || "Failed to create post");
            }

            setPosts((prev) => [json.post, ...prev]);
            setForm({ caption: "", media_url: "", media_type: "image" });
            setMessage("Post created as draft.");
        } catch (err) {
            console.error(err);
            setMessage(err.message || "Error creating post.");
        } finally {
            setCreating(false);
        }
    };

    const handlePublish = async (postId) => {
        setPublishingId(postId);
        setMessage("");
        try {
            const res = await fetch(`/api/instagram/posts/${postId}/publish`, {
                method: "POST",
            });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || "Failed to publish post");
            }

            setPosts((prev) =>
                prev.map((p) => (p.id === postId ? json.post : p))
            );
            setMessage("Post published to Instagram.");
        } catch (err) {
            console.error(err);
            setMessage(err.message || "Error publishing post.");
        } finally {
            setPublishingId(null);
        }
    };

    return (
        <>
        <AdminBackBar title="Instagram Posts" to="/admin" />
        <main className="min-h-screen px-4 py-10 max-w-4xl mx-auto">
            <h1 className="text-2xl font-semibold mb-4">Instagram Campaign Posts</h1>

            {message && (
                <div className="mb-4 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
                    {message}
                </div>
            )}

            {/* Campaign selector */}
            <div className="mb-6">
                <label className="block text-sm font-medium mb-1">
                    Select Campaign
                </label>
                <select
                    className="border rounded-md px-3 py-2 text-sm w-full max-w-md"
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                >
                    <option value="">-- Choose a campaign --</option>
                    {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name}
                        </option>
                    ))}
                </select>
            </div>

            {/* New post form */}
            <section className="mb-8 border rounded-lg p-4 bg-white">
                <h2 className="text-lg font-semibold mb-3">Create New Post</h2>
                <form onSubmit={handleCreatePost} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Caption</label>
                        <textarea
                            name="caption"
                            value={form.caption}
                            onChange={handleFormChange}
                            rows={3}
                            className="w-full border rounded-md px-3 py-2 text-sm"
                            placeholder="Write your caption..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Media URL (image)
                        </label>
                        <input
                            type="text"
                            name="media_url"
                            value={form.media_url}
                            onChange={handleFormChange}
                            className="w-full border rounded-md px-3 py-2 text-sm"
                            placeholder="https://example.com/your-image.jpg"
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Must be a publicly accessible URL for Instagram to fetch.
                        </p>
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="submit"
                            disabled={creating}
                            className="px-4 py-2 rounded-md text-sm font-medium bg-black text-white disabled:opacity-60"
                        >
                            {creating ? "Creating..." : "Create Draft Post"}
                        </button>
                    </div>
                </form>
            </section>

            {/* Posts list */}
            <section>
                <h2 className="text-lg font-semibold mb-3">Posts</h2>
                {loadingPosts ? (
                    <p>Loading posts...</p>
                ) : posts.length === 0 ? (
                    <p className="text-sm text-gray-600">No posts yet for this campaign.</p>
                ) : (
                    <div className="space-y-3">
                        {posts.map((post) => (
                            <div
                                key={post.id}
                                className="border rounded-lg p-3 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                            >
                                <div>
                                    <div className="text-xs uppercase text-gray-500 mb-1">
                                        Status:{" "}
                                        <span className="font-semibold">{post.status}</span>
                                    </div>
                                    <div className="text-sm mb-1">
                                        {post.caption ? post.caption : <em>No caption</em>}
                                    </div>
                                    {post.permalink && (
                                        <a
                                            href={post.permalink}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-blue-600 underline"
                                        >
                                            View on Instagram
                                        </a>
                                    )}
                                    {post.error_message && (
                                        <div className="text-xs text-red-600 mt-1">
                                            Error: {post.error_message}
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    {post.media_url && (
                                        <a
                                            href={post.media_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs underline text-gray-600"
                                        >
                                            Media
                                        </a>
                                    )}
                                    <button
                                        onClick={() => handlePublish(post.id)}
                                        disabled={
                                            publishingId === post.id || post.status === "published"
                                        }
                                        className="px-3 py-1 rounded-md text-xs font-medium bg-black text-white disabled:opacity-60"
                                    >
                                        {post.status === "published"
                                            ? "Published"
                                            : publishingId === post.id
                                                ? "Publishing..."
                                                : "Publish"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </main>
        </>
    );
}
