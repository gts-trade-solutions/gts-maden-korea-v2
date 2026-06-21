"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import type { Banner } from "@/types";
import { supabaseImageLoader } from "@/lib/supabaseImageLoader";

interface HeroBannerProps {
  banners: Banner[];
}

export function HeroBanner({ banners }: HeroBannerProps) {
  const t = useTranslations("home");
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [banners.length]);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  // Touch swipe nav. Threshold is 60px horizontal, and we only trigger
  // when horizontal movement dominates vertical — otherwise a normal
  // page scroll would accidentally flip the slide. Refs (not state) so
  // we don't trigger re-renders mid-gesture.
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const startX = touchStartX.current;
    const startY = touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (startX == null || startY == null || banners.length <= 1) return;
    const endX = e.changedTouches[0]?.clientX ?? startX;
    const endY = e.changedTouches[0]?.clientY ?? startY;
    const dx = endX - startX;
    const dy = endY - startY;
    // Require: >60px horizontal AND horizontal dominates vertical.
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) goToPrevious();
      else goToNext();
    }
  };

  if (banners.length === 0) return null;

  return (
    <div
      className="relative w-full h-[23vh] md:h-[54vh] lg:h-[66vh] xl:h-[78vh] 2xl:h-[84vh] bg-muted overflow-hidden touch-pan-y"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {banners.map((banner, index) => {
        const isActive = index === currentIndex;
        const isVideo =
          // treat as video if you have a dedicated field OR a file-like URL
          // adjust this check to match your Banner type
          (banner as any).video_url ||
          (/\.mp4$|\.webm$|\.ogg$/i.test(banner.image || "") && !(banner as any).link_url);

        const videoSrc =
          (banner as any).video_url ||
          (/\.(mp4|webm|ogg)$/i.test(banner.image || "") ? banner.image : undefined);

        const poster = banner.image && !videoSrc ? undefined : banner.image || undefined;

        const media = isVideo ? (
          <video
            key={banner.id + (isActive ? "-active" : "-inactive")}
            className="absolute inset-0 w-full h-full object-cover"
            src={videoSrc as string}
            poster={poster}
            // "normal" quality playback; keep light on bandwidth
            preload={isActive ? "metadata" : "none"}
            playsInline
            muted
            loop
            autoPlay={isActive}
            controls={false}
            aria-label={banner.alt || t("promoVideoAlt")}
          />
        ) : (
          <Image
            src={banner.image || ""}
            alt={banner.alt}
            fill
            // Serve sharper assets for big screens while staying efficient
            sizes="(min-width: 1536px) 1536px, (min-width: 1280px) 1280px, (min-width: 1024px) 1024px, 100vw"
            quality={95}
            priority={index === 0}
            loading={index === 0 ? "eager" : "lazy"}
            className="object-cover select-none"
            draggable={false}
            loader={supabaseImageLoader}
          />
        );

        // Videos render with `controls={false}` and no native UI, so we can
        // safely overlay a click target without fighting playback controls.
        const slide = (
          <div
            key={banner.id}
            className={`absolute inset-0 transition-opacity duration-500 ${
              isActive ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden={!isActive}
          >
            <div className="relative w-full h-full">
              {media}
              {banner.link_url && (
                <Link
                  href={banner.link_url}
                  className="absolute inset-0 z-[1]"
                  aria-label={banner.alt}
                  tabIndex={isActive ? 0 : -1}
                />
              )}
            </div>
          </div>
        );

        return slide;
      })}

      {banners.length > 1 && (
        <>
          {/* Side chevrons are desktop-only. On mobile they were
              overlaying the banner's headline/CTA copy. The 5-second
              auto-rotation plus the tappable pagination dots below
              cover navigation on small screens, matching what users
              expect from carousels in Instagram, Netflix, etc. */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background/90"
            onClick={goToPrevious}
            aria-label={t("prevBanner")}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background/90"
            onClick={goToNext}
            aria-label={t("nextBanner")}
          >
            <ChevronRight className="h-6 w-6" />
          </Button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
            {banners.map((_, index) => (
              <button
                key={index}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentIndex ? "bg-white w-8" : "bg-white/50"
                }`}
                onClick={() => setCurrentIndex(index)}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
