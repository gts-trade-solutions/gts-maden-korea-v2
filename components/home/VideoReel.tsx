"use client";

import Image from "next/image";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX } from "lucide-react";
import { supabaseImageLoader } from "@/lib/supabaseImageLoader";

// Shared carousel primitive used by both home-page video sections.
// It owns: scroll-snap loop, single-active-video pattern, autoplay tick,
// lazy mount via IntersectionObserver, page dot indicators, in-card mute.
//
// The two carousels (product + influencer) differ only in heading copy and
// the per-card overlay. Both pass an `onCardClick(index)` to open the
// shared VideoPlayerModal at that index.

// Tracks the user's `prefers-reduced-motion` media query. Returns true
// when motion should be minimised — used to skip the 4s carousel
// auto-advance and to leave videos paused on poster frames. Vestibular
// disorders make autoplaying carousels and unsolicited video genuinely
// uncomfortable; respecting the OS-level pref is both correct UX and
// good for the indirect bounce-rate signal.
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

export type ReelItem = {
  id: string | number;
  video_url?: string | null;
  thumbnail_url?: string | null;
};

type Props<T extends ReelItem> = {
  heading: string;
  subheading?: string;
  items: T[];
  // Render a per-card overlay (caption, post link, etc.). The carousel
  // component supplies the video element + thumbnail + active-state ring.
  renderOverlay?: (item: T, isActive: boolean) => ReactNode;
  onCardClick: (index: number) => void;
  // When the modal is open we want to pause the auto-tick.
  paused?: boolean;
};

export function VideoReel<T extends ReelItem>({
  heading,
  subheading,
  items: rawItems,
  renderOverlay,
  onCardClick,
  paused = false,
}: Props<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const [isHoverPaused, setIsHoverPaused] = useState(false);
  const [slidesPerView, setSlidesPerView] = useState(6);
  const [currentPage, setCurrentPage] = useState(0);
  const [activeId, setActiveId] = useState<string | number | null>(null);
  const reducedMotion = useReducedMotion();

  const items = useMemo(
    () => rawItems.filter((v) => !!v.video_url),
    [rawItems]
  );

  useEffect(() => {
    if (activeId == null && items.length > 0) setActiveId(items[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  // Duplicate once for seamless infinite scroll.
  const loopItems = useMemo(
    () =>
      [
        ...items,
        ...items.map((v, i) => ({ ...v, id: `${v.id}-dup-${i}` as any })),
      ] as T[],
    [items]
  );

  const readSlidesFromCSSVar = () => {
    const el = scrollRef.current;
    if (!el) return slidesPerView;
    const val = getComputedStyle(el).getPropertyValue("--slides").trim();
    const n = parseInt(val || "6", 10);
    return Number.isFinite(n) && n > 0 ? n : slidesPerView;
  };

  const getStep = () => {
    const el = scrollRef.current;
    if (!el) return 0;
    const firstCard = el.querySelector<HTMLElement>('[data-card="true"]');
    if (!firstCard) return 0;
    const gap = parseFloat(getComputedStyle(el).gap || "0") || 0;
    return Math.round(firstCard.getBoundingClientRect().width + gap);
  };

  const alignToSnap = () => {
    const el = scrollRef.current;
    if (!el) return;
    const s = getStep();
    if (!s) return;
    const idx = Math.round(el.scrollLeft / s);
    el.scrollLeft = idx * s;
  };

  const totalPages = Math.max(
    1,
    Math.ceil(items.length / Math.max(1, slidesPerView))
  );

  const computeFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const s = getStep();
    if (!s) return;
    const idxRaw = Math.round(el.scrollLeft / s);
    const idx = ((idxRaw % items.length) + items.length) % items.length;
    const newActive = items[idx]?.id ?? null;
    if (newActive != null) setActiveId(newActive);
    const spv = readSlidesFromCSSVar();
    const page = Math.floor(idx / Math.max(1, spv));
    setCurrentPage(Math.min(totalPages - 1, Math.max(0, page)));
  }, [items, totalPages]);

  useEffect(() => {
    if (items.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;

    const syncSpv = () => setSlidesPerView(readSlidesFromCSSVar());
    syncSpv();
    alignToSnap();
    computeFromScroll();

    let tickTimer: number | null = null;
    let afterScrollTimer: number | null = null;

    const tick = () => {
      if (paused || isHoverPaused || reducedMotion) return;
      const s = getStep();
      if (!s) return;
      const curIdx = Math.round(el.scrollLeft / s);
      const targetLeft = (curIdx + 1) * s;
      el.scrollTo({ left: targetLeft, behavior: "smooth" });

      if (afterScrollTimer) window.clearTimeout(afterScrollTimer);
      afterScrollTimer = window.setTimeout(() => {
        const half = el.scrollWidth / 2;
        if (el.scrollLeft >= half - s / 2) {
          el.scrollLeft = el.scrollLeft - half;
        }
        alignToSnap();
        computeFromScroll();
      }, 450) as unknown as number;
    };

    tickTimer = window.setInterval(tick, 4000) as unknown as number;

    const onScroll = () => {
      const half = el.scrollWidth / 2;
      if (el.scrollLeft >= half - 2) el.scrollLeft = el.scrollLeft - half;
      computeFromScroll();
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    const onResize = () => {
      syncSpv();
      requestAnimationFrame(() => {
        alignToSnap();
        computeFromScroll();
      });
    };
    window.addEventListener("resize", onResize);

    return () => {
      if (tickTimer) window.clearInterval(tickTimer);
      if (afterScrollTimer) window.clearTimeout(afterScrollTimer);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [paused, isHoverPaused, reducedMotion, computeFromScroll]);

  // Empty-list early return goes AFTER all hooks have been declared so the
  // hook order stays stable across renders.
  if (items.length === 0) return null;

  const goToPage = (pageIndex: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const s = getStep();
    const spv = readSlidesFromCSSVar();
    if (!s || !spv) return;

    const half = el.scrollWidth / 2;
    const pageWidth = s * spv;
    const targetInFirst = pageIndex * pageWidth;
    const targetInSecond = targetInFirst + half;
    const cur = el.scrollLeft;
    const target =
      Math.abs(cur - targetInFirst) <= Math.abs(cur - targetInSecond)
        ? targetInFirst
        : targetInSecond;

    setIsHoverPaused(true);
    el.scrollTo({ left: target, behavior: "smooth" });

    window.setTimeout(() => {
      alignToSnap();
      computeFromScroll();
      setIsHoverPaused(false);
    }, 500);
  };

  return (
    <section className="relative">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">{heading}</h2>
        {subheading && <p className="text-muted-foreground">{subheading}</p>}
      </div>

      <div
        className="relative"
        onMouseEnter={() => setIsHoverPaused(true)}
        onMouseLeave={() => setIsHoverPaused(false)}
      >
        <div
          ref={scrollRef}
          className="
            flex overflow-x-auto scrollbar-hide
            snap-x snap-mandatory [scroll-snap-stop:always]
            [--slide-gap:1rem] gap-[var(--slide-gap)]
            [--slides:2] md:[--slides:3] lg:[--slides:4] xl:[--slides:5] 2xl:[--slides:6]
            [scrollbar-width:none] [-ms-overflow-style:none]
          "
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {loopItems.map((video, loopIdx) => {
            // Map clone IDs back to the original index so the modal opens
            // at the correct video regardless of which copy was clicked.
            const realIdx = loopIdx % items.length;
            return (
              <ReelCard
                key={String(video.id)}
                video={video}
                activeId={activeId}
                onRequestActive={(id) => setActiveId(id)}
                onCardClick={() => onCardClick(realIdx)}
                renderOverlay={renderOverlay}
              />
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            {Array.from({ length: totalPages }).map((_, i) => {
              const active = i === currentPage;
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to page ${i + 1}`}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "h-2 rounded-full transition-all",
                    active
                      ? "w-8 bg-foreground/90"
                      : "w-2 bg-foreground/30 hover:bg-foreground/50",
                  ].join(" ")}
                  onClick={() => goToPage(i)}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function ReelCard<T extends ReelItem>({
  video,
  activeId,
  onRequestActive,
  onCardClick,
  renderOverlay,
}: {
  video: T;
  activeId: string | number | null;
  onRequestActive: (id: string | number) => void;
  onCardClick: () => void;
  renderOverlay?: (item: T, isActive: boolean) => ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const t = useTranslations("home");

  const [isMuted, setIsMuted] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [inView, setInView] = useState(false);
  const reducedMotion = useReducedMotion();

  const isActive = activeId != null && activeId === video.id;

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => setInView(!!entries[0]?.isIntersecting),
      { threshold: 0.25, rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Only the active+visible card plays. Others paused. Reduced-motion
  // users see the poster frame only — they can still tap the card to
  // open the modal player and watch on demand.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isActive && inView && !reducedMotion) {
      el.muted = isMuted;
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [isActive, inView, isMuted, reducedMotion]);

  useEffect(() => {
    if (!inView) setVideoReady(false);
  }, [inView]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    el.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  return (
    <div
      ref={cardRef}
      data-card="true"
      className="
        shrink-0 snap-start relative group cursor-pointer
        basis-[calc((100%-(var(--slide-gap)*(var(--slides)-1)))/var(--slides))]
        max-w-full
      "
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onClick={onCardClick}
    >
      <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-muted shadow-lg">
        {!!video.thumbnail_url && (
          <Image
            src={video.thumbnail_url}
            // Generic descriptive alt — the thumbnail is a transient
            // placeholder behind the actual <video> element below, but
            // it's the only image asset Googlebot sees on this card. A
            // generic "Product video preview" is more useful than empty.
            alt={t("productVideoAlt")}
            fill
            className={[
              "object-cover transition-opacity duration-300",
              videoReady ? "opacity-0" : "opacity-100",
            ].join(" ")}
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 16vw"
            loader={supabaseImageLoader}
          />
        )}

        {(inView || isActive) && (
          <video
            ref={videoRef}
            className="absolute inset-0 z-0 w-full h-full object-cover"
            loop
            muted={isMuted}
            playsInline
            preload="metadata"
            poster={video.thumbnail_url ?? undefined}
            onLoadedData={() => setVideoReady(true)}
            onCanPlay={() => setVideoReady(true)}
            controls={false}
            disablePictureInPicture
            controlsList="nodownload noplaybackrate"
          >
            <source src={video.video_url ?? ""} type="video/mp4" />
          </video>
        )}

        {/* Per-carousel overlay (caption, post link, etc.) */}
        {renderOverlay && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div className="pointer-events-auto h-full w-full">
              {renderOverlay(video, isActive)}
            </div>
          </div>
        )}

        {/* In-card mute. Stops propagation so clicking it doesn't open the modal. */}
        {showControls && isActive && (
          <div className="absolute top-4 right-4 z-30">
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full shadow-lg backdrop-blur-sm bg-white/90 hover:bg-white h-8 w-8"
              onClick={toggleMute}
              aria-label={isMuted ? t("unmute") : t("mute")}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          </div>
        )}

        {/* Active-card ring */}
        <div
          className={[
            "absolute inset-0 z-10 ring-2 ring-white/0 transition pointer-events-none",
            isActive ? "ring-white/40" : "ring-transparent",
          ].join(" ")}
        />
      </div>
    </div>
  );
}
