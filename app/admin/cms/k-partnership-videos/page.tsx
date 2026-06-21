"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2, Upload, Video } from "lucide-react";
import {
  SUPPORTED_COUNTRIES,
  COUNTRY_PROFILES,
  type CountryCode,
} from "@/lib/countries";
import { CountryFlag } from "@/components/CountryFlag";
import { STORAGE_BACKEND, resolveMediaUrl } from "@/lib/storage/backend";
import { useAuth } from "@/lib/contexts/AuthContext";

type VideoRow = {
  country_code: string;
  storage_path: string;
  updated_at?: string;
};

const STORAGE_BUCKET = "site-assets";
const PUBLIC_URL = (path: string) => resolveMediaUrl(STORAGE_BUCKET, path) ?? "";

// S3 presigned-PUT with progress (browser PUTs the bytes straight to S3; PUT
// supports XHR upload progress natively).
function putToS3WithProgress(
  url: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !onProgress) return;
      onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      resolve(xhr.status >= 200 && xhr.status < 300 ? {} : { error: `${xhr.status} ${xhr.statusText}` });
    xhr.onerror = () => resolve({ error: "Network error during upload" });
    xhr.send(file);
  });
}

// Upload via XMLHttpRequest so we can stream the byte count back as
// progress events. The supabase-js storage client uses `fetch`, which
// doesn't expose upload progress in browsers. Hitting Supabase's REST
// storage endpoint directly with the user's session token bypasses
// that limitation while still going through the same RLS policies.
function uploadWithProgress(opts: {
  bucket: string;
  path: string;
  file: File;
  accessToken: string;
  upsert?: boolean;
  onProgress?: (pct: number) => void;
}): Promise<{ error?: string }> {
  return new Promise((resolve) => {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${opts.bucket}/${opts.path}`;
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Authorization", `Bearer ${opts.accessToken}`);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
    xhr.setRequestHeader(
      "Content-Type",
      opts.file.type || "application/octet-stream"
    );
    xhr.setRequestHeader("Cache-Control", "max-age=31536000");
    if (opts.upsert) xhr.setRequestHeader("x-upsert", "true");

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !opts.onProgress) return;
      opts.onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({});
      } else {
        let msg = `${xhr.status} ${xhr.statusText}`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed?.message) msg = parsed.message;
        } catch {}
        resolve({ error: msg });
      }
    };
    xhr.onerror = () => resolve({ error: "Network error during upload" });
    xhr.send(opts.file);
  });
}

export default function KPartnershipVideosAdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [videos, setVideos] = useState<Record<string, VideoRow>>({});
  const [defaultCountry, setDefaultCountry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDefault, setSavingDefault] = useState(false);
  const [busyCountry, setBusyCountry] = useState<string | null>(null);
  // 0..100 while uploading, null when idle. Lives per-country so two
  // simultaneous uploads (which we don't gate but the UI allows) each
  // show their own bar.
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {}
  );

  // Gate: admin only — backend-aware via the auth context (Supabase OR NextAuth).
  // The old getUser() + is_admin RPC both rely on auth.uid(), null under NextAuth.
  const { isAdmin: ctxIsAdmin, ready: authReady } = useAuth();
  useEffect(() => {
    if (!authReady) return;
    const bounceUrl =
      typeof window !== "undefined"
        ? `/admin?from=${encodeURIComponent(window.location.pathname)}`
        : "/admin";
    if (!ctxIsAdmin) {
      router.replace(bounceUrl);
      return;
    }
    setIsAdmin(true);
    setReady(true);
  }, [authReady, ctxIsAdmin, router]);

  // Load videos + default-country pointer
  const load = async () => {
    setLoading(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/admin/k-partnership-videos", {
        credentials: "include",
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        toast.error(body?.error || "Failed to load");
        return;
      }
      const map: Record<string, VideoRow> = {};
      for (const v of body.videos ?? []) {
        map[String(v.country_code).toUpperCase()] = v;
      }
      setVideos(map);
      setDefaultCountry(body.default_country ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready && isAdmin) void load();
  }, [ready, isAdmin]);

  // Client-side size cap. The HTML5 player streams progressively but
  // the original file still has to download fully on the first edge
  // cache miss — anything bigger than ~100 MB starts to drag on mobile
  // connections. Matches the comment originally on the server.
  const MAX_BYTES = 100 * 1024 * 1024;

  const uploadFor = async (country: string, file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error(
        `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 100 MB.`
      );
      return;
    }
    setBusyCountry(country);
    setUploadProgress((p) => ({ ...p, [country]: 0 }));
    try {
      const ext = (() => {
        const m = (file.type || "").toLowerCase();
        if (m.includes("webm")) return "webm";
        if (m.includes("ogg")) return "ogg";
        return "mp4";
      })();
      const path = `k-partnership/${country.toLowerCase()}.${ext}`;
      const onProgress = (pct: number) =>
        setUploadProgress((p) => ({ ...p, [country]: pct }));

      // Step 1: upload the bytes with XHR progress. Under S3 we presign a PUT
      // (cookie-auth via /api/uploads/presign — no Supabase session needed);
      // under Supabase we PUT to its REST endpoint with the session token.
      let upErr: string | undefined;
      if (STORAGE_BACKEND === "s3") {
        const presignRes = await fetch("/api/uploads/presign", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bucket: STORAGE_BUCKET, key: path, contentType: file.type || "video/mp4" }),
        });
        const presign = await presignRes.json().catch(() => ({} as any));
        if (!presignRes.ok || presign.mode !== "s3" || !presign.uploadUrl) {
          upErr = presign?.error || "Upload authorization failed";
        } else {
          upErr = (await putToS3WithProgress(presign.uploadUrl, file, onProgress)).error;
        }
      } else {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        if (!token) {
          toast.error("Session expired — please sign in again");
          return;
        }
        upErr = (
          await uploadWithProgress({ bucket: STORAGE_BUCKET, path, file, accessToken: token, upsert: true, onProgress })
        ).error;
      }
      if (upErr) {
        toast.error(upErr || "Storage upload failed");
        return;
      }

      // Step 2: register the path (cookie-auth via requireAdmin).
      const res = await fetch("/api/admin/k-partnership-videos", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ country_code: country, storage_path: path }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        toast.error(body?.error || "Failed to register video");
        return;
      }
      toast.success(`Uploaded ${COUNTRY_PROFILES[country as CountryCode]?.name}`);
      await load();
    } finally {
      setBusyCountry(null);
      setUploadProgress((p) => {
        const next = { ...p };
        delete next[country];
        return next;
      });
    }
  };

  const removeFor = async (country: string) => {
    if (!confirm(`Remove the video for ${COUNTRY_PROFILES[country as CountryCode]?.name}?`)) {
      return;
    }
    setBusyCountry(country);
    try {
      const res = await fetch(
        `/api/admin/k-partnership-videos?country=${encodeURIComponent(country)}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        toast.error(body?.error || "Delete failed");
        return;
      }
      toast.success("Removed");
      await load();
    } finally {
      setBusyCountry(null);
    }
  };

  const setDefault = async (country: string | null) => {
    setSavingDefault(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/admin/k-partnership-videos", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ default_country: country }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        toast.error(body?.error || "Failed to update default");
        return;
      }
      setDefaultCountry(country);
      toast.success(
        country
          ? `Default set to ${COUNTRY_PROFILES[country as CountryCode]?.name}`
          : "Default cleared"
      );
    } finally {
      setSavingDefault(false);
    }
  };

  if (!ready || !isAdmin) return null;

  const countriesWithVideos = SUPPORTED_COUNTRIES.filter((c) => !!videos[c]);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push("/admin/cms")}>
              ← Back
            </Button>
            <h1 className="text-lg sm:text-2xl font-bold">K-Partnership Videos</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 sm:py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Default country</CardTitle>
            <CardDescription>
              Visitors whose country has no video uploaded will see this
              country's video instead. Pick a country that already has a
              video.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={defaultCountry ?? ""}
                onChange={(e) => setDefault(e.target.value || null)}
                disabled={savingDefault}
                className="rounded-md border bg-background px-3 py-2 text-sm min-w-[12rem]"
              >
                <option value="">— No default (no fallback video) —</option>
                {countriesWithVideos.map((c) => (
                  <option key={c} value={c}>
                    {COUNTRY_PROFILES[c]?.name ?? c}
                  </option>
                ))}
              </select>
              {savingDefault && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {countriesWithVideos.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Upload at least one video below before picking a default.
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Videos by country</CardTitle>
            <CardDescription className="space-y-1">
              <p>
                One video per country. MP4 (H.264) preferred; WebM and Ogg
                also work. The customer-facing player uses the first frame
                as the poster image.
              </p>
              <p className="font-medium text-foreground/80">
                Recommended size for smooth playback:{" "}
                <span className="text-emerald-700">under 15 MB</span>{" "}
                <span className="text-muted-foreground">
                  (30-60s clip at 720p, ~2-3 Mbps bitrate)
                </span>
              </p>
              <p>
                Hard limit: <strong>100 MB</strong>. Larger files load
                slowly on mobile connections even after the CDN warms up
                — visitors will see a long initial buffer before playback
                starts.
              </p>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                Loading…
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SUPPORTED_COUNTRIES.map((code) => {
                  const profile = COUNTRY_PROFILES[code];
                  const row = videos[code];
                  const isDefault = defaultCountry === code;
                  return (
                    <CountryRow
                      key={code}
                      code={code}
                      name={profile?.name ?? code}
                      video={row}
                      isDefault={isDefault}
                      busy={busyCountry === code}
                      progress={uploadProgress[code]}
                      onUpload={(file) => uploadFor(code, file)}
                      onRemove={() => removeFor(code)}
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CountryRow({
  code,
  name,
  video,
  isDefault,
  busy,
  progress,
  onUpload,
  onRemove,
}: {
  code: string;
  name: string;
  video?: VideoRow;
  isDefault: boolean;
  busy: boolean;
  progress?: number;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const hasVideo = !!video?.storage_path;
  const isUploading = busy && typeof progress === "number";
  return (
    <div className="rounded-lg border bg-background p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CountryFlag
            code={code}
            className="inline-block h-5 w-auto rounded-[1px] shrink-0"
          />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{name}</div>
            <div className="text-[11px] text-muted-foreground">{code}</div>
          </div>
        </div>
        {isDefault && (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            Default
          </span>
        )}
      </div>

      {/* Upload progress bar. Visible only while a transfer is
          actually in flight. Once the byte stream finishes the bar
          disappears and the preview repaints with the new file. */}
      {isUploading && (
        <div className="mb-3 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Uploading…</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-150 ease-linear"
              style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
            />
          </div>
        </div>
      )}

      {hasVideo ? (
        <div className="space-y-3">
          <div className="relative w-full aspect-video bg-black rounded-md overflow-hidden">
            <video
              src={PUBLIC_URL(video.storage_path)}
              controls
              playsInline
              preload="metadata"
              className="absolute inset-0 w-full h-full object-contain"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                asChild
              >
                <span>
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 mr-1" />
                  )}
                  Replace
                </span>
              </Button>
              <input
                type="file"
                accept="video/mp4,video/webm,video/ogg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRemove}
              disabled={busy}
              className="text-red-600 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-muted/30 p-4 text-center space-y-2">
          <Video className="h-6 w-6 mx-auto text-muted-foreground" />
          <div className="text-xs text-muted-foreground">No video uploaded</div>
          <label className="inline-block">
            <Button type="button" size="sm" disabled={busy} asChild>
              <span>
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-1" />
                )}
                Upload video
              </span>
            </Button>
            <input
              type="file"
              accept="video/mp4,video/webm,video/ogg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
