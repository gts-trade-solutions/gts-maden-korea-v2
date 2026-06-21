"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";

type Props = {
  beforeUrl: string;
  afterUrl: string;
  beforeAlt?: string;
  afterAlt?: string;
};

export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeAlt = "Before",
  afterAlt = "After",
}: Props) {
  const [pos, setPos] = useState(50);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const move = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, next)));
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none overflow-hidden touch-none cursor-ew-resize focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      role="slider"
      tabIndex={0}
      aria-label="Before and after comparison — use left and right arrow keys to nudge"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 5;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setPos((p) => Math.max(0, p - step));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setPos((p) => Math.min(100, p + step));
        } else if (e.key === "Home") {
          e.preventDefault();
          setPos(0);
        } else if (e.key === "End") {
          e.preventDefault();
          setPos(100);
        }
      }}
      onPointerDown={(e) => {
        draggingRef.current = true;
        try {
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        } catch {}
        move(e.clientX);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) move(e.clientX);
      }}
      onPointerUp={(e) => {
        draggingRef.current = false;
        try {
          (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
        } catch {}
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
    >
      <Image
        src={beforeUrl}
        alt={beforeAlt}
        fill
        className="pointer-events-none object-cover"
        sizes="(min-width: 768px) 50vw, 100vw"
      />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        <Image
          src={afterUrl}
          alt={afterAlt}
          fill
          className="pointer-events-none object-cover"
          sizes="(min-width: 768px) 50vw, 100vw"
        />
      </div>
      <div
        className="pointer-events-none absolute top-0 bottom-0"
        style={{ left: `${pos}%` }}
      >
        <div className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-white/95 shadow-[0_0_8px_rgba(0,0,0,0.35)]" />
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow ring-1 ring-black/10">
          <span className="text-[10px] font-bold tracking-wider text-neutral-700">
            ‹›
          </span>
        </div>
      </div>
      <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
        Before
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
        After
      </span>
    </div>
  );
}
