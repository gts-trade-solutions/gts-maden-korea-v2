"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { InfluencerVideo } from "@/types/influencer_video";
import { VideoReel } from "./VideoReel";
import { VideoPlayerModal, type VideoModalItem } from "./VideoPlayerModal";

export function InstagramVideoCarousel({ videos }: { videos: InfluencerVideo[] }) {
  const t = useTranslations("home");
  const items = useMemo(
    () => (videos ?? []).filter((v) => !!v.video_url),
    [videos]
  );

  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const modalItems: VideoModalItem[] = useMemo(
    () =>
      items.map((v) => ({
        id: v.id,
        video_url: v.video_url ?? "",
        thumbnail_url: v.thumbnail_url ?? null,
        caption: v.caption ?? null,
        externalLink: v.instagram_link ?? null,
        externalLinkLabel: t("viewPost"),
        products: v.products ?? [],
      })),
    [items, t]
  );

  return (
    <>
      <VideoReel
        heading={t("creatorVideosHeading")}
        subheading={t("creatorVideosSubheading")}
        items={items.map((v) => ({
          id: v.id,
          video_url: v.video_url,
          thumbnail_url: v.thumbnail_url,
          // Pass through fields the overlay needs.
          caption: v.caption,
        }))}
        onCardClick={(idx) => setOpenIndex(idx)}
        paused={openIndex !== null}
        renderOverlay={(v) => {
          const caption = (v as any).caption as string | null | undefined;
          if (!caption) return null;
          return (
            <div className="absolute inset-x-0 bottom-0 z-10 p-4 text-white pointer-events-none">
              <div
                className="absolute inset-0 -z-10"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.18) 50%, rgba(0,0,0,0) 100%)",
                }}
              />
              <p className="text-xs text-white/85 line-clamp-1">{caption}</p>
            </div>
          );
        }}
      />

      <VideoPlayerModal
        open={openIndex !== null}
        items={modalItems}
        startIndex={openIndex ?? 0}
        onClose={() => setOpenIndex(null)}
      />
    </>
  );
}
