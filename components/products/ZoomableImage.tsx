"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  alt: string;
  /** Sizes hint forwarded to next/image. */
  sizes?: string;
  /** Optional aria label / title used by screen readers + the close-button cluster. */
  className?: string;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const STEP = 0.25;

/**
 * Inline image viewer used inside the Discover lightbox. Supports:
 *   - wheel zoom (focused on cursor position)
 *   - +/− buttons + reset
 *   - drag-pan once zoomed past 1×
 *
 * At scale=1 the image renders identically to a plain `object-contain`
 * <Image fill> so behaviour outside zoom interaction is unchanged.
 */
export function ZoomableImage({ src, alt, sizes, className }: Props) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  // Reset state if the source image changes.
  useEffect(() => {
    reset();
  }, [src, reset]);

  // Clamp pan so the image can't be flung entirely out of view.
  const clamp = useCallback(
    (nextScale: number, x: number, y: number): { x: number; y: number } => {
      const el = containerRef.current;
      if (!el || nextScale <= 1) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      const overX = (rect.width * (nextScale - 1)) / 2;
      const overY = (rect.height * (nextScale - 1)) / 2;
      return {
        x: Math.max(-overX, Math.min(overX, x)),
        y: Math.max(-overY, Math.min(overY, y)),
      };
    },
    []
  );

  const setScaleAt = useCallback(
    (nextScale: number, anchorX?: number, anchorY?: number) => {
      const el = containerRef.current;
      if (!el) return;
      const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
      if (clamped === 1) {
        setScale(1);
        setTx(0);
        setTy(0);
        return;
      }
      // Zoom focus point: keep the pixel under the cursor stable.
      const rect = el.getBoundingClientRect();
      const cx = typeof anchorX === "number" ? anchorX - rect.left - rect.width / 2 : 0;
      const cy = typeof anchorY === "number" ? anchorY - rect.top - rect.height / 2 : 0;
      const ratio = clamped / scale;
      const nextTx = cx - (cx - tx) * ratio;
      const nextTy = cy - (cy - ty) * ratio;
      const { x, y } = clamp(clamped, nextTx, nextTy);
      setScale(clamped);
      setTx(x);
      setTy(y);
    },
    [scale, tx, ty, clamp]
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      // Ctrl-wheel is browser zoom; ignore. Otherwise hijack vertical
      // scroll for image zoom — the lightbox isn't scrollable.
      if (e.ctrlKey) return;
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      const nextScale = scale + direction * STEP;
      setScaleAt(nextScale, e.clientX, e.clientY);
    },
    [scale, setScaleAt]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (scale <= 1) return;
      draggingRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseX: tx,
        baseY: ty,
      };
      try {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      } catch {}
    },
    [scale, tx, ty]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const { x, y } = clamp(scale, drag.baseX + dx, drag.baseY + dy);
      setTx(x);
      setTy(y);
    },
    [scale, clamp]
  );

  const stopDrag = useCallback((e: React.PointerEvent) => {
    draggingRef.current = null;
    try {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    } catch {}
  }, []);

  const cursor =
    scale > 1 ? (draggingRef.current ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in";

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden select-none touch-none",
        cursor,
        className
      )}
      ref={containerRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onClick={(e) => {
        // Click-to-zoom for non-wheel users when not panning.
        if (scale === 1) {
          e.stopPropagation();
          setScaleAt(2, e.clientX, e.clientY);
        }
      }}
    >
      <div
        className="absolute inset-0 transition-transform duration-150 ease-out"
        style={{
          transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes ?? "100vw"}
          className="pointer-events-none object-contain"
          priority
        />
      </div>

      {/* Toolbar — pinned top-right (under the close button) so the
          bottom-anchored caption overlay never covers it. */}
      <div
        className="absolute right-3 top-16 z-10 flex items-center gap-1 rounded-md border border-white/15 bg-black/60 px-1 py-1 text-white shadow backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Zoom out"
          className="inline-flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-white/10 disabled:opacity-40"
          onClick={() => setScaleAt(scale - STEP)}
          disabled={scale <= MIN_SCALE}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[3.5rem] text-center text-[11px] font-medium tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          className="inline-flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-white/10 disabled:opacity-40"
          onClick={() => setScaleAt(scale + STEP)}
          disabled={scale >= MAX_SCALE}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-white/10 disabled:opacity-40"
          onClick={reset}
          disabled={scale === 1 && tx === 0 && ty === 0}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default ZoomableImage;
