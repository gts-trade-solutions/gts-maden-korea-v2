"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { ImageFit } from "@/lib/types/productStory";

type Props = {
  open: boolean;
  imageUrl: string | null;
  initialX?: number | null;
  initialY?: number | null;
  initialFit?: ImageFit | null;
  initialZoom?: number | null;
  /** Aspect ratio of the destination tile (width / height). */
  aspectRatio: number;
  onSave: (
    x: number,
    y: number,
    fit: ImageFit,
    zoom: number
  ) => void;
  onClose: () => void;
};

const FIT_OPTIONS: { value: ImageFit; label: string; help: string }[] = [
  {
    value: "cover",
    label: "Cover",
    help: "Fill the tile, crop overflow. Drag the dot + zoom slider.",
  },
  {
    value: "contain",
    label: "Contain",
    help: "Fit the whole image inside the tile. Pick a tile background to fill the empty area.",
  },
];

const ADVANCED_FITS: { value: ImageFit; label: string; help: string }[] = [
  {
    value: "fill",
    label: "Fill",
    help: "Stretch the image to fill the tile (distorts).",
  },
  {
    value: "original",
    label: "Original",
    help: "Treat as contain with no upscaling.",
  },
];

/**
 * Backwards-compat export name. v3 expanded this picker beyond focal
 * point to also choose fit mode + zoom; the new behaviour is exposed
 * through `<ImageFitPicker>` while the old name still works.
 */
export function FocalPointPicker(props: Props) {
  return <ImageFitPicker {...props} />;
}

export function ImageFitPicker({
  open,
  imageUrl,
  initialX,
  initialY,
  initialFit,
  initialZoom,
  aspectRatio,
  onSave,
  onClose,
}: Props) {
  const [x, setX] = useState<number>(
    typeof initialX === "number" ? initialX : 50
  );
  const [y, setY] = useState<number>(
    typeof initialY === "number" ? initialY : 50
  );
  const [fit, setFit] = useState<ImageFit>(initialFit ?? "cover");
  const [zoom, setZoom] = useState<number>(
    typeof initialZoom === "number" ? initialZoom : 1
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setX(typeof initialX === "number" ? initialX : 50);
      setY(typeof initialY === "number" ? initialY : 50);
      setFit(initialFit ?? "cover");
      setZoom(typeof initialZoom === "number" ? initialZoom : 1);
    }
  }, [open, initialX, initialY, initialFit, initialZoom]);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = stageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const px = ((clientX - rect.left) / rect.width) * 100;
      const py = ((clientY - rect.top) / rect.height) * 100;
      setX(Math.max(0, Math.min(100, Math.round(px * 10) / 10)));
      setY(Math.max(0, Math.min(100, Math.round(py * 10) / 10)));
    },
    []
  );

  const focalDraggable = fit === "cover";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Image fit</DialogTitle>
          <DialogDescription>
            Pick how the image fills the tile. The white rectangle shows
            what the customer will see at the chosen tile aspect ratio.
          </DialogDescription>
        </DialogHeader>

        {imageUrl ? (
          <div className="space-y-4">
            {/* Fit segmented control */}
            <div className="flex flex-wrap items-center gap-2">
              {FIT_OPTIONS.concat(showAdvanced ? ADVANCED_FITS : []).map(
                (opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFit(opt.value)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs",
                      fit === opt.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    )}
                    title={opt.help}
                  >
                    {opt.label}
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-[11px] text-muted-foreground hover:underline"
              >
                {showAdvanced ? "Hide advanced" : "Show advanced fits"}
              </button>
            </div>

            <div
              ref={stageRef}
              className={cn(
                "relative w-full max-h-[55vh] overflow-hidden rounded-md border bg-black",
                focalDraggable
                  ? "select-none touch-none cursor-crosshair"
                  : "select-none"
              )}
              onPointerDown={(e) => {
                if (!focalDraggable) return;
                draggingRef.current = true;
                try {
                  (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                } catch {}
                updateFromPointer(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (draggingRef.current) updateFromPointer(e.clientX, e.clientY);
              }}
              onPointerUp={(e) => {
                draggingRef.current = false;
                try {
                  (e.currentTarget as Element).releasePointerCapture?.(
                    e.pointerId
                  );
                } catch {}
              }}
              onPointerCancel={() => {
                draggingRef.current = false;
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt=""
                className="block max-h-[55vh] w-full object-contain"
                draggable={false}
              />
              {fit === "cover" ? (
                <CropOverlay aspectRatio={aspectRatio} x={x} y={y} zoom={zoom} />
              ) : null}
              {focalDraggable ? <FocalDot x={x} y={y} /> : null}
            </div>

            {/* Zoom slider — only meaningful for cover */}
            {fit === "cover" ? (
              <div className="grid gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Zoom · {zoom.toFixed(2)}×
                  </span>
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:underline"
                    onClick={() => setZoom(1)}
                  >
                    Reset
                  </button>
                </div>
                <Slider
                  value={[zoom]}
                  min={1}
                  max={3}
                  step={0.05}
                  onValueChange={(v) => setZoom(Number(v[0]) || 1)}
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {focalDraggable ? (
                <>
                  <span>
                    Focal: <strong>{x.toFixed(1)}% × {y.toFixed(1)}%</strong>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setX(50);
                      setY(50);
                    }}
                  >
                    Reset focal
                  </Button>
                </>
              ) : (
                <span>Focal point not used in {fit} mode.</span>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Upload an image first.
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!imageUrl}
            onClick={() => {
              onSave(x, y, fit, zoom);
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FocalDot({ x, y }: { x: number; y: number }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
      )}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <div className="h-6 w-6 rounded-full bg-white/90 ring-2 ring-black/40 shadow" />
      <div className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-black/80" />
    </div>
  );
}

/**
 * Renders a translucent rectangle representing the area that will
 * actually be visible when the renderer applies object-cover at the
 * given aspect ratio + zoom centered on (x, y). Geometry follows
 * `object-position` semantics with a uniform scale.
 */
function CropOverlay({
  aspectRatio,
  x,
  y,
  zoom,
}: {
  aspectRatio: number;
  x: number;
  y: number;
  zoom: number;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [imgRect, setImgRect] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = stageRef.current?.parentElement?.querySelector("img");
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setImgRect({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!imgRect) return <div ref={stageRef} className="hidden" />;

  const imgRatio = imgRect.w / Math.max(imgRect.h, 1);
  // Cover-mode visible window in image %, divided by zoom.
  let visW = 100;
  let visH = 100;
  if (aspectRatio > imgRatio) {
    visH = (imgRatio / aspectRatio) * 100;
  } else {
    visW = (aspectRatio / imgRatio) * 100;
  }
  const z = Math.max(1, Math.min(3, zoom));
  visW = visW / z;
  visH = visH / z;
  const left = ((100 - visW) * x) / 100;
  const top = ((100 - visH) * y) / 100;

  return (
    <>
      <div
        ref={stageRef}
        className="pointer-events-none absolute inset-0 bg-black/55"
      />
      <div
        className="pointer-events-none absolute border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
        style={{
          left: `${left}%`,
          top: `${top}%`,
          width: `${visW}%`,
          height: `${visH}%`,
        }}
      />
    </>
  );
}

export default FocalPointPicker;
