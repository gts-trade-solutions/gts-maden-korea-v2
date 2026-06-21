"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Plus,
  Trash2,
  ImageIcon,
  ImagePlus,
  LayoutGrid,
  Star,
  GitCompare,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabaseClient";
import { adminWrite } from "@/lib/admin/catalog-write";
import { uploadMedia, deleteMedia } from "@/lib/storage/upload-client";
import { storyMediaUrl } from "@/lib/storyMediaUrl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  StoryTile,
  aspectClassForSize,
} from "@/components/products/StoryTile";
import { FocalPointPicker } from "@/components/admin/FocalPointPicker";
import { HexColorPicker } from "react-colorful";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  analyzeImageColor,
  contrastRatio,
  passesAA,
  COLOR_PRESETS,
  type ColorSuggestion,
} from "@/lib/colorSuggester";
import {
  packBlocks,
  tidyOrder,
  DEFAULT_COLS,
  type PackResult,
} from "@/lib/gridPacker";
import type {
  StoryBlock,
  StoryBlockMode,
  StoryBlockSize,
  StoryBlockType,
  StatsItem,
  TextPosition,
  SplitDirection,
  TextSize,
} from "@/lib/types/productStory";
import {
  STORY_BLOCK_SIZES,
  TEXT_POSITIONS,
  SPLIT_DIRECTIONS,
  TEXT_SIZES,
  TEXT_WEIGHTS,
} from "@/lib/types/productStory";
import type { CaptionMode, TextWeight } from "@/lib/types/productStory";

const SELECT_COLUMNS =
  "id, product_id, position, block_type, size, mode, headline, body, text_position, text_color, text_bg, text_size, text_weight, caption_mode, caption_backdrop, split_direction, image_path, image_alt, image_focal_x, image_focal_y, image_fit, image_zoom, image_bg, caption, stats_items, before_image_path, after_image_path, comparison_caption, created_at, updated_at";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB

type Props = { productId: string };

type SaveStatus = "idle" | "saving" | "saved" | "error";

type BlockTypeMeta = {
  type: StoryBlockType;
  label: string;
  description: string;
  Icon: typeof Star;
  defaultMode: StoryBlockMode;
};

const BLOCK_TYPE_META: BlockTypeMeta[] = [
  {
    type: "hero",
    label: "Hero",
    description: "Big image with overlaid headline. Use to open the section.",
    Icon: Star,
    defaultMode: "A",
  },
  {
    type: "feature",
    label: "Feature",
    description: "Image + text. Highlight a benefit, ingredient, or claim.",
    Icon: LayoutGrid,
    defaultMode: "A",
  },
  {
    type: "stats",
    label: "Stats",
    description:
      "2–4 numbers (e.g. '94%' / '28 days') to back up your claims.",
    Icon: BarChart3,
    defaultMode: "A",
  },
  {
    type: "comparison",
    label: "Comparison",
    description: "Before/after image slider.",
    Icon: GitCompare,
    defaultMode: "A",
  },
  {
    type: "image",
    label: "Image",
    description: "Pure image with optional caption.",
    Icon: ImageIcon,
    defaultMode: "C",
  },
];

function randomKey() {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  ).slice(0, 16);
}

const SIZE_ASPECT: Record<StoryBlockSize, number> = {
  "1x1": 1,
  "2x1": 2,
  "1x2": 0.5,
  "2x2": 1,
  "4x1": 4,
};

function suggestedSizeForRatio(ratio: number): StoryBlockSize {
  if (ratio < 0.7) return "1x2";
  if (ratio <= 1.3) return "1x1";
  if (ratio <= 2.3) return "2x1";
  return "4x1";
}

function readImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      URL.revokeObjectURL(url);
      resolve({ width: w, height: h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

function fileExt(name: string) {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export default function ProductStoryEditor({ productId }: Props) {
  if (!productId) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Save the product first to start adding Discover blocks.
      </div>
    );
  }
  return <Editor productId={productId} />;
}

function Editor({ productId }: Props) {
  const [blocks, setBlocks] = useState<StoryBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<StoryBlock | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [previewMode, setPreviewMode] = useState<"tile" | "grid">("tile");
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">(
    "desktop"
  );
  // v3 save model: serverSnapshot is the last-saved state per block;
  // dirtyIds is the set of blocks with unflushed local edits.
  const [serverSnapshot, setServerSnapshot] = useState<
    Record<string, StoryBlock>
  >({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

  const debounceRef = useRef<number | null>(null);
  const pendingPatchRef = useRef<Partial<StoryBlock> | null>(null);
  const pendingTargetRef = useRef<string | null>(null);

  // Debounced cache-bust for the public product page. The customer page
  // wraps the block fetch in `unstable_cache` and the route in
  // `revalidate = 300`, so without this every admin edit lingers on the
  // storefront for up to five minutes.
  const revalidateTimerRef = useRef<number | null>(null);
  const requestRevalidate = useCallback(() => {
    if (revalidateTimerRef.current) {
      window.clearTimeout(revalidateTimerRef.current);
    }
    revalidateTimerRef.current = window.setTimeout(async () => {
      revalidateTimerRef.current = null;
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        await fetch("/api/admin/story-blocks/revalidate", {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ productId }),
        });
      } catch {
        // Best-effort — admin still saw their change locally.
      }
    }, 1500);
  }, [productId]);

  useEffect(() => {
    return () => {
      if (revalidateTimerRef.current) {
        window.clearTimeout(revalidateTimerRef.current);
      }
    };
  }, []);

  // Load blocks
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("product_story_blocks")
        .select(SELECT_COLUMNS)
        .eq("product_id", productId)
        .order("position", { ascending: true });

      if (cancelled) return;
      if (error) {
        toast.error(`Failed to load Discover blocks: ${error.message}`);
        setBlocks([]);
        setServerSnapshot({});
      } else {
        const list = (data ?? []) as StoryBlock[];
        setBlocks(list);
        setServerSnapshot(
          Object.fromEntries(list.map((b) => [b.id, b])) as Record<
            string,
            StoryBlock
          >
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const selectedBlock = useMemo(
    () => blocks.find((b) => b.id === selectedId) ?? null,
    [blocks, selectedId]
  );

  // ── Patch + persist (debounced) ───────────────────────────────────
  const persistNow = useCallback(async () => {
    const patch = pendingPatchRef.current;
    const target = pendingTargetRef.current;
    pendingPatchRef.current = null;
    pendingTargetRef.current = null;
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (!patch || !target) return;

    setSaveStatus("saving");
    try {
      await adminWrite({
        table: "product_story_blocks",
        op: "update",
        data: patch,
        match: { id: target },
        mirrorScope: productId,
      });
    } catch (e: any) {
      setSaveStatus("error");
      toast.error(`Save failed: ${e?.message || String(e)}`);
      return;
    }

    // Mark this block clean (unless a fresh patch was queued mid-save).
    setDirtyIds((prev) => {
      if (pendingTargetRef.current === target) return prev;
      const next = new Set(prev);
      next.delete(target);
      return next;
    });
    // Roll the patch into the server snapshot so Discard reverts here.
    setServerSnapshot((prev) => {
      const existing = prev[target];
      if (!existing) return prev;
      return { ...prev, [target]: { ...existing, ...patch } };
    });

    setSaveStatus("saved");
    window.setTimeout(() => {
      setSaveStatus((s) => (s === "saved" ? "idle" : s));
    }, 1200);
    requestRevalidate();
  }, [productId, requestRevalidate]);

  const queuePatch = useCallback(
    (id: string, patch: Partial<StoryBlock>) => {
      // Optimistic: merge into local list
      setBlocks((list) =>
        list.map((b) => (b.id === id ? { ...b, ...patch } : b))
      );

      // Mark this block dirty until the next successful save settles it.
      setDirtyIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      // Merge with any in-flight pending patch for the same target
      if (pendingTargetRef.current && pendingTargetRef.current !== id) {
        // Different block — flush the previous one immediately
        void persistNow();
      }
      pendingTargetRef.current = id;
      pendingPatchRef.current = {
        ...(pendingPatchRef.current ?? {}),
        ...patch,
      };

      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void persistNow();
      }, 300);
    },
    [persistNow]
  );

  /** Save now: cancel the debounce and persist any pending patch. */
  const saveNow = useCallback(async () => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await persistNow();
  }, [persistNow]);

  /** Discard local edits for a single block (or all dirty blocks). */
  const discardChanges = useCallback(
    (blockId?: string) => {
      // Cancel any pending patch
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      pendingPatchRef.current = null;
      pendingTargetRef.current = null;

      if (blockId) {
        const snap = serverSnapshot[blockId];
        if (snap) {
          setBlocks((list) =>
            list.map((b) => (b.id === blockId ? snap : b))
          );
        }
        setDirtyIds((prev) => {
          if (!prev.has(blockId)) return prev;
          const next = new Set(prev);
          next.delete(blockId);
          return next;
        });
      } else {
        setBlocks((list) =>
          list.map((b) => serverSnapshot[b.id] ?? b)
        );
        setDirtyIds(new Set());
      }
      setSaveStatus("idle");
    },
    [serverSnapshot]
  );

  // beforeunload guard while edits are in flight or pending.
  useEffect(() => {
    const hasPending =
      dirtyIds.size > 0 || pendingPatchRef.current != null;
    if (!hasPending) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the message but require returnValue set.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyIds]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      void persistNow();
    };
  }, [persistNow]);

  // ── Add block ─────────────────────────────────────────────────────
  const onAddBlock = useCallback(
    async (type: StoryBlockType) => {
      const meta = BLOCK_TYPE_META.find((m) => m.type === type)!;
      const nextPos = blocks.length;

      const defaultTextSize: TextSize = type === "hero" ? "xl" : "md";
      const insert: any = {
        product_id: productId,
        position: nextPos,
        block_type: type,
        size: type === "stats" || type === "comparison" ? "2x1" : "2x1",
        mode: meta.defaultMode,
        text_position: "bottom-left",
        text_color: "light",
        text_size: defaultTextSize,
        split_direction: "image-left",
        stats_items: type === "stats" ? [] : null,
      };

      let created: StoryBlock;
      try {
        created = (await adminWrite({
          table: "product_story_blocks",
          op: "insert",
          data: insert,
        })) as StoryBlock;
      } catch (e: any) {
        toast.error(`Could not create block: ${e?.message || String(e)}`);
        return;
      }
      setBlocks((list) => [...list, created]);
      setServerSnapshot((prev) => ({ ...prev, [created.id]: created }));
      setSelectedId(created.id);
      setPickerOpen(false);
      requestRevalidate();
    },
    [blocks.length, productId, requestRevalidate]
  );

  // ── Delete block ──────────────────────────────────────────────────
  const onConfirmDelete = useCallback(async () => {
    const target = confirmDelete;
    if (!target) return;
    setConfirmDelete(null);

    // Best-effort delete the storage objects
    const paths = [
      target.image_path,
      target.before_image_path,
      target.after_image_path,
    ].filter((p): p is string => !!p);
    if (paths.length) {
      await Promise.all(
        paths.map((p) =>
          deleteMedia(
            "product-story-media",
            p.replace(/^product-story-media\//, "")
          )
        )
      );
    }

    try {
      await adminWrite({
        table: "product_story_blocks",
        op: "delete",
        match: { id: target.id },
        mirrorScope: productId,
      });
    } catch (e: any) {
      toast.error(`Delete failed: ${e?.message || String(e)}`);
      return;
    }

    // Local state + repack positions
    const remaining = blocks
      .filter((b) => b.id !== target.id)
      .map((b, i) => ({ ...b, position: i }));
    setBlocks(remaining);
    setServerSnapshot((prev) => {
      const next = { ...prev };
      delete next[target.id];
      remaining.forEach((b) => {
        if (next[b.id]) next[b.id] = { ...next[b.id], position: b.position };
      });
      return next;
    });
    setDirtyIds((prev) => {
      if (!prev.has(target.id)) return prev;
      const next = new Set(prev);
      next.delete(target.id);
      return next;
    });
    if (selectedId === target.id) setSelectedId(null);

    // Persist new positions in parallel
    await Promise.all(
      remaining.map((b) =>
        adminWrite({
          table: "product_story_blocks",
          op: "update",
          data: { position: b.position },
          match: { id: b.id },
          mirrorScope: productId,
        })
      )
    );

    toast.success("Block deleted");
    requestRevalidate();
  }, [blocks, confirmDelete, selectedId, productId, requestRevalidate]);

  // ── Reorder ───────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = arrayMove(blocks, oldIndex, newIndex).map((b, i) => ({
        ...b,
        position: i,
      }));
      setBlocks(reordered);
      setServerSnapshot((prev) => {
        const next = { ...prev };
        reordered.forEach((b) => {
          if (next[b.id]) next[b.id] = { ...next[b.id], position: b.position };
        });
        return next;
      });

      try {
        await Promise.all(
          reordered.map((b) =>
            adminWrite({
              table: "product_story_blocks",
              op: "update",
              data: { position: b.position },
              match: { id: b.id },
              mirrorScope: productId,
            })
          )
        );
        requestRevalidate();
      } catch (e: any) {
        toast.error(`Reorder failed: ${e?.message || String(e)}`);
      }
    },
    [blocks, productId, requestRevalidate]
  );

  /** Apply a tidy-grid reorder produced by lib/gridPacker. */
  const applyTidyOrder = useCallback(
    async (orderedIds: string[]) => {
      const byId = new Map(blocks.map((b) => [b.id, b]));
      const reordered = orderedIds
        .map((id, i) => {
          const b = byId.get(id);
          return b ? { ...b, position: i } : null;
        })
        .filter((b): b is StoryBlock => !!b);
      if (reordered.length !== blocks.length) return;
      setBlocks(reordered);
      setServerSnapshot((prev) => {
        const next = { ...prev };
        reordered.forEach((b) => {
          if (next[b.id]) next[b.id] = { ...next[b.id], position: b.position };
        });
        return next;
      });
      try {
        await Promise.all(
          reordered.map((b) =>
            adminWrite({
              table: "product_story_blocks",
              op: "update",
              data: { position: b.position },
              match: { id: b.id },
              mirrorScope: productId,
            })
          )
        );
        toast.success("Grid tidied");
        requestRevalidate();
      } catch (e: any) {
        toast.error(`Tidy failed: ${e?.message || String(e)}`);
      }
    },
    [blocks, productId, requestRevalidate]
  );

  // ── Upload helper ─────────────────────────────────────────────────
  const uploadImage = useCallback(
    async (file: File): Promise<string | null> => {
      if (!file.type.startsWith("image/")) {
        toast.error("Only image files are allowed");
        return null;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error("Image must be 4 MB or smaller");
        return null;
      }
      const ext = fileExt(file.name) || "jpg";
      const key = `${productId}/${randomKey()}.${ext}`;
      try {
        const { path } = await uploadMedia("product-story-media", key, file, {
          upsert: false,
        });
        return path;
      } catch (e: any) {
        toast.error(`Upload failed: ${e?.message || String(e)}`);
        return null;
      }
    },
    [productId]
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-[40%,60%] gap-6">
      {/* Left: list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Blocks ({blocks.length})
          </h3>
          <SaveBadge status={saveStatus} dirty={dirtyIds.size > 0} />
        </div>

        {loading ? (
          <div className="space-y-2">
            <div className="h-16 rounded-md bg-muted animate-pulse" />
            <div className="h-16 rounded-md bg-muted animate-pulse" />
          </div>
        ) : blocks.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No blocks yet. Click <strong>Add block</strong> to start.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={blocks.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-2">
                {blocks.map((b) => (
                  <SortableRow
                    key={b.id}
                    block={b}
                    selected={b.id === selectedId}
                    onSelect={() => setSelectedId(b.id)}
                    onDelete={() => setConfirmDelete(b)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        <Button
          type="button"
          className="w-full"
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" /> Add block
        </Button>
      </div>

      {/* Right: form + preview */}
      <div className="space-y-6">
        {selectedBlock ? (
          <BlockForm
            key={selectedBlock.id}
            block={selectedBlock}
            saveStatus={saveStatus}
            isDirty={dirtyIds.has(selectedBlock.id)}
            onSaveNow={saveNow}
            onDiscard={() => discardChanges(selectedBlock.id)}
            queuePatch={(patch) => queuePatch(selectedBlock.id, patch)}
            uploadImage={uploadImage}
          />
        ) : (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
            Select a block on the left, or add a new one.
          </div>
        )}

        <PreviewPane
          blocks={blocks}
          selectedBlock={selectedBlock}
          previewMode={previewMode}
          setPreviewMode={setPreviewMode}
          previewWidth={previewWidth}
          setPreviewWidth={setPreviewWidth}
          onApplyTidy={applyTidyOrder}
        />
      </div>

      {/* Type picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose a block type</DialogTitle>
            <DialogDescription>
              Pick the kind of block you want to add to this product.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BLOCK_TYPE_META.map((meta) => {
              const Icon = meta.Icon;
              return (
                <button
                  key={meta.type}
                  type="button"
                  onClick={() => onAddBlock(meta.type)}
                  className="group flex flex-col gap-2 rounded-md border p-4 text-left hover:bg-muted/60 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{meta.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {meta.description}
                  </p>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this block?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the block and any uploaded images for
              it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SaveBadge({
  status,
  dirty,
}: {
  status: SaveStatus;
  dirty?: boolean;
}) {
  if (status === "saving")
    return <span className="text-xs text-muted-foreground">Saving…</span>;
  if (status === "error")
    return <span className="text-xs text-destructive">Save failed</span>;
  if (dirty)
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
        Unsaved changes
      </span>
    );
  if (status === "saved")
    return <span className="text-xs text-emerald-600">Saved</span>;
  return null;
}

function SortableRow({
  block,
  selected,
  onSelect,
  onDelete,
}: {
  block: StoryBlock;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const thumb =
    block.image_path ?? block.before_image_path ?? block.after_image_path;
  const thumbUrl = storyMediaUrl(thumb);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card p-2 pr-3 transition-colors",
        selected && "ring-2 ring-primary"
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 items-center gap-3 text-left"
      >
        <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded bg-muted">
          {thumbUrl ? (
            // Tiny thumb — img is fine here vs next/image to skip per-row sizing churn
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {block.block_type}
            </Badge>
            <span className="text-xs text-muted-foreground">{block.size}</span>
          </div>
          <div className="mt-1 truncate text-sm">
            {block.headline || (
              <span className="text-muted-foreground">(no headline)</span>
            )}
          </div>
        </div>
      </button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onDelete}
        aria-label="Delete block"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

// ──────────────────────────────────────────────────────────────────
// Block form (right pane)
// ──────────────────────────────────────────────────────────────────

function BlockForm({
  block,
  saveStatus,
  isDirty,
  onSaveNow,
  onDiscard,
  queuePatch,
  uploadImage,
}: {
  block: StoryBlock;
  saveStatus: SaveStatus;
  isDirty: boolean;
  onSaveNow: () => Promise<void> | void;
  onDiscard: () => void;
  queuePatch: (patch: Partial<StoryBlock>) => void;
  uploadImage: (file: File) => Promise<string | null>;
}) {
  const isHeroOrFeature =
    block.block_type === "hero" || block.block_type === "feature";
  const showCommonImage =
    block.block_type === "hero" ||
    block.block_type === "feature" ||
    block.block_type === "image";
  const isFeatureModeB =
    block.block_type === "feature" && block.mode === "B";

  const saveDisabled =
    saveStatus === "saving" || (!isDirty && saveStatus !== "error");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold capitalize">
          {block.block_type} block
        </h3>
        <div className="flex items-center gap-2">
          <SaveBadge status={saveStatus} dirty={isDirty} />
          {isDirty && saveStatus !== "saving" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDiscard}
            >
              Discard
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={saveStatus === "error" ? "destructive" : "default"}
            disabled={saveDisabled}
            onClick={() => void onSaveNow()}
          >
            {saveStatus === "saving"
              ? "Saving…"
              : saveStatus === "error"
                ? "Retry save"
                : isDirty
                  ? "Save changes"
                  : "Saved"}
          </Button>
        </div>
      </div>

      {/* Size */}
      <div className="grid gap-2">
        <Label>Size</Label>
        <Select
          value={block.size}
          onValueChange={(v) =>
            queuePatch({ size: v as StoryBlockSize })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STORY_BLOCK_SIZES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Desktop bento footprint. Mobile stacks every tile to one column.
        </p>
      </div>

      {/* Common image */}
      {showCommonImage ? (
        <ImagePickerField
          label="Image"
          path={block.image_path}
          onUpload={async (file) => {
            const path = await uploadImage(file);
            if (!path) return;
            // Reset focal/zoom/fit so an old crop doesn't disfigure the new image.
            queuePatch({
              image_path: path,
              image_focal_x: null,
              image_focal_y: null,
              image_zoom: 1,
              image_fit: "cover",
            });
            // Size recommendation is shown by <RecommendedSize> below
            // the picker, not by a transient toast.
          }}
          onRemove={() =>
            queuePatch({
              image_path: null,
              image_focal_x: null,
              image_focal_y: null,
              image_zoom: 1,
              image_fit: "cover",
              image_bg: null,
            })
          }
        />
      ) : null}

      {/* Image alt — only when there is an image */}
      {showCommonImage && block.image_path ? (
        <div className="grid gap-2">
          <Label htmlFor="psb-alt">Image alt text</Label>
          <Input
            id="psb-alt"
            value={block.image_alt ?? ""}
            onChange={(e) =>
              queuePatch({ image_alt: e.target.value || null })
            }
            placeholder="Describe the image for screen readers"
          />
        </div>
      ) : null}

      {/* Image fit / focal / zoom — common image only */}
      {showCommonImage && block.image_path ? (
        <FocalPointButton
          block={block}
          queuePatch={queuePatch}
        />
      ) : null}

      {/* Image background — only when fit leaves empty space */}
      {showCommonImage &&
      block.image_path &&
      (block.image_fit ?? "cover") !== "cover" ? (
        <ColorControl
          label="Image background"
          value={block.image_bg ?? null}
          defaultLegacy={null}
          block={block}
          onChange={(v) => queuePatch({ image_bg: v })}
          nullable
        />
      ) : null}

      {/* Recommended size — always-on, replaces the upload toast */}
      {showCommonImage && block.image_path ? (
        <RecommendedSize block={block} queuePatch={queuePatch} />
      ) : null}

      {/* Hero / Feature: mode + headline + body + position/color/split */}
      {isHeroOrFeature ? (
        <>
          {block.block_type === "feature" ? (
            <div className="grid gap-2">
              <Label>Layout mode</Label>
              <RadioGroup
                value={block.mode}
                onValueChange={(v) =>
                  queuePatch({ mode: v as StoryBlockMode })
                }
                className="grid grid-cols-1 sm:grid-cols-2 gap-2"
              >
                <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 hover:bg-muted/60">
                  <RadioGroupItem value="A" />
                  <div>
                    <div className="text-sm font-medium">A · Text on image</div>
                    <div className="text-xs text-muted-foreground">
                      Headline overlaid on the image.
                    </div>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 hover:bg-muted/60">
                  <RadioGroupItem value="B" />
                  <div>
                    <div className="text-sm font-medium">B · Text beside image</div>
                    <div className="text-xs text-muted-foreground">
                      Image and text split into halves.
                    </div>
                  </div>
                </label>
              </RadioGroup>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="psb-headline">Headline</Label>
            <Input
              id="psb-headline"
              value={block.headline ?? ""}
              onChange={(e) =>
                queuePatch({ headline: e.target.value || null })
              }
              placeholder="A short, punchy line"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="psb-body">Body / tagline</Label>
            <Textarea
              id="psb-body"
              value={block.body ?? ""}
              maxLength={280}
              onChange={(e) =>
                queuePatch({ body: e.target.value || null })
              }
              placeholder="Optional supporting line (≤ 280 chars)"
            />
            <div className="text-right text-[11px] text-muted-foreground">
              {(block.body ?? "").length}/280
            </div>
          </div>

          <TextStyleControls block={block} queuePatch={queuePatch} />

          {isFeatureModeB ? (
            <div className="grid gap-2">
              <Label>Split direction</Label>
              <Select
                value={block.split_direction}
                onValueChange={(v) =>
                  queuePatch({ split_direction: v as SplitDirection })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPLIT_DIRECTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </>
      ) : null}

      {/* Image block: caption + text controls */}
      {block.block_type === "image" ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="psb-caption">Caption (optional)</Label>
            <Input
              id="psb-caption"
              value={block.caption ?? ""}
              onChange={(e) =>
                queuePatch({ caption: e.target.value || null })
              }
              placeholder="Small caption rendered below the image"
            />
          </div>
          <TextStyleControls
            block={block}
            queuePatch={queuePatch}
            note="Applied to the caption."
          />
        </>
      ) : null}

      {/* Stats */}
      {block.block_type === "stats" ? (
        <>
          <StatsField
            headline={block.headline}
            items={
              Array.isArray(block.stats_items)
                ? block.stats_items
                : []
            }
            onChangeHeadline={(h) => queuePatch({ headline: h || null })}
            onChange={(items) =>
              queuePatch({ stats_items: items.length ? items : [] })
            }
          />
          <TextStyleControls
            block={block}
            queuePatch={queuePatch}
            note="Applied to the headline, values, and labels."
          />
        </>
      ) : null}

      {/* Comparison */}
      {block.block_type === "comparison" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ImagePickerField
              label="Before image"
              path={block.before_image_path}
              onUpload={async (file) => {
                const path = await uploadImage(file);
                if (path) queuePatch({ before_image_path: path });
              }}
              onRemove={() =>
                queuePatch({ before_image_path: null })
              }
            />
            <ImagePickerField
              label="After image"
              path={block.after_image_path}
              onUpload={async (file) => {
                const path = await uploadImage(file);
                if (path) queuePatch({ after_image_path: path });
              }}
              onRemove={() =>
                queuePatch({ after_image_path: null })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="psb-cmp-cap">Caption (optional)</Label>
            <Input
              id="psb-cmp-cap"
              value={block.comparison_caption ?? ""}
              onChange={(e) =>
                queuePatch({
                  comparison_caption: e.target.value || null,
                })
              }
            />
          </div>
          <TextStyleControls
            block={block}
            queuePatch={queuePatch}
            note="Applied to the caption."
          />
        </div>
      ) : null}
    </div>
  );
}

function TextStyleControls({
  block,
  queuePatch,
  note,
}: {
  block: StoryBlock;
  queuePatch: (patch: Partial<StoryBlock>) => void;
  note?: string;
}) {
  const currentSize: TextSize = block.text_size ?? "md";
  const currentReveal: CaptionMode = block.caption_mode ?? "always";
  // Reveal-on-hover is only meaningful for text-on-image scenarios.
  // Hero is always overlay, feature Mode A is overlay, image-with-caption
  // overlays its caption when hover is chosen. Other types ignore it.
  const revealApplicable =
    block.block_type === "hero" ||
    (block.block_type === "feature" && block.mode === "A") ||
    (block.block_type === "image" && !!block.caption?.trim());
  // Frosted backdrop is meaningful anywhere text rides directly on the
  // image — same scopes as reveal, plus comparison captions.
  const frostApplicable =
    revealApplicable ||
    (block.block_type === "comparison" &&
      !!block.comparison_caption?.trim());
  const currentFrost = !!block.caption_backdrop;

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Text style
        </Label>
        {note ? (
          <span className="text-[11px] text-muted-foreground">{note}</span>
        ) : null}
      </div>

      <ColorControl
        label="Text color"
        value={block.text_color}
        defaultLegacy="light"
        block={block}
        onChange={(v) => queuePatch({ text_color: v ?? "light" })}
      />

      <ColorControl
        label="Text background (optional)"
        value={block.text_bg ?? null}
        defaultLegacy={null}
        block={block}
        onChange={(v) => queuePatch({ text_bg: v })}
        nullable
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="grid gap-2">
          <Label>Size</Label>
          <Select
            value={currentSize}
            onValueChange={(v) => queuePatch({ text_size: v as TextSize })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEXT_SIZES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Weight</Label>
          <Select
            value={(block.text_weight ?? "bold") as TextWeight}
            onValueChange={(v) =>
              queuePatch({ text_weight: v as TextWeight })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEXT_WEIGHTS.map((w) => (
                <SelectItem key={w} value={w}>
                  {w.charAt(0).toUpperCase() + w.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Position / alignment</Label>
          <Select
            value={block.text_position}
            onValueChange={(v) =>
              queuePatch({ text_position: v as TextPosition })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEXT_POSITIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {revealApplicable ? (
        <div className="grid gap-2">
          <Label>Reveal</Label>
          <div className="inline-flex w-fit rounded-md border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => queuePatch({ caption_mode: "always" })}
              className={cn(
                "px-2 py-1 rounded",
                currentReveal === "always"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              Always visible
            </button>
            <button
              type="button"
              onClick={() => queuePatch({ caption_mode: "hover" })}
              className={cn(
                "px-2 py-1 rounded",
                currentReveal === "hover"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              On hover
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            On hover keeps the image clean at rest; text fades in when a
            customer hovers (or focuses) the tile.
          </p>
        </div>
      ) : null}

      {frostApplicable ? (
        <label className="flex items-start gap-2 rounded-md border bg-background p-3 text-xs">
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5"
            checked={currentFrost}
            onChange={(e) =>
              queuePatch({ caption_backdrop: e.target.checked })
            }
          />
          <span>
            <span className="block font-medium">Frosted backdrop on text</span>
            <span className="text-muted-foreground">
              Adds a small blurred pill behind the glyphs only — useful when
              the image is too busy for the text-shadow alone to keep the
              text readable. Default: off.
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Color picker (Light / Dark / Custom + spectrum + image suggestion)
// ──────────────────────────────────────────────────────────────────

function isHexColor(v: string | null | undefined): boolean {
  return !!v && /^#[0-9a-fA-F]{3,8}$/.test(v);
}

function ColorControl({
  label,
  value,
  defaultLegacy,
  nullable = false,
  block,
  onChange,
}: {
  label: string;
  value: string | null;
  defaultLegacy: "light" | "dark" | null;
  nullable?: boolean;
  block: StoryBlock;
  onChange: (next: string | null) => void;
}) {
  const mode: "light" | "dark" | "custom" | "none" =
    value === "light"
      ? "light"
      : value === "dark"
        ? "dark"
        : value && isHexColor(value)
          ? "custom"
          : nullable && value == null
            ? "none"
            : "light";

  // The hex shown in the swatch / used by HexColorPicker. When the
  // user is in light/dark/none mode we display a sensible preview hex
  // but don't write it back unless they switch to custom.
  const previewHex = isHexColor(value) ? (value as string) : "#0f172a";

  const [busySuggesting, setBusySuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<ColorSuggestion[] | null>(null);
  const [suggestMode, setSuggestMode] = useState<
    "best-contrast" | "match-dominant" | "image-palette"
  >("best-contrast");
  const [aaOnly, setAaOnly] = useState(false);

  const runSuggest = async (
    mode:
      | "best-contrast"
      | "match-dominant"
      | "image-palette" = suggestMode,
    aa: boolean = aaOnly
  ) => {
    const url = storyMediaUrl(block.image_path);
    if (!url) {
      toast.error("Add an image first to use color suggestions.");
      return;
    }
    try {
      setBusySuggesting(true);
      const result = await analyzeImageColor(url, { mode, aaOnly: aa });
      setSuggestions(result.suggestions);
    } catch (e) {
      toast.error("Could not read the image colors (it may be cross-origin).");
    } finally {
      setBusySuggesting(false);
    }
  };
  const onSuggest = () => void runSuggest();

  // WCAG badge: only meaningful when both fg + bg are hex. When
  // `label` is the text-color one, the bg comes from block.text_bg
  // (if hex) or from the analyzed image (skipped for now to avoid
  // analyzing on every re-render).
  const fgHex = isHexColor(value) ? (value as string) : null;
  const bgHex = isHexColor(block.text_bg) ? (block.text_bg as string) : null;
  const ratio = fgHex && bgHex ? contrastRatio(fgHex, bgHex) : null;

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5 text-xs">
          {defaultLegacy === "light" || defaultLegacy === null ? (
            <button
              type="button"
              onClick={() => onChange("light")}
              className={cn(
                "px-2 py-1 rounded",
                mode === "light"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              Light
            </button>
          ) : null}
          {defaultLegacy === "dark" || defaultLegacy === null ? (
            <button
              type="button"
              onClick={() => onChange("dark")}
              className={cn(
                "px-2 py-1 rounded",
                mode === "dark"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              Dark
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onChange(previewHex)}
            className={cn(
              "px-2 py-1 rounded",
              mode === "custom"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            Custom
          </button>
          {nullable ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className={cn(
                "px-2 py-1 rounded",
                mode === "none"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              None
            </button>
          ) : null}
        </div>

        {mode === "custom" ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="h-9 w-9 rounded-md border shadow-sm"
                style={{ backgroundColor: previewHex }}
                aria-label="Open color picker"
              />
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3">
              <div className="space-y-3">
                <HexColorPicker
                  color={previewHex}
                  onChange={(v) => onChange(v)}
                />
                <Input
                  value={previewHex}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (isHexColor(v)) onChange(v);
                  }}
                  className="font-mono text-xs"
                  placeholder="#000000"
                />
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Presets
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {COLOR_PRESETS.map((p) => (
                      <button
                        key={p.hex}
                        type="button"
                        onClick={() => onChange(p.hex)}
                        className="h-8 w-full rounded border"
                        style={{ backgroundColor: p.hex }}
                        aria-label={p.label}
                        title={p.label}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : null}

        {block.image_path ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSuggest}
            disabled={busySuggesting}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            {busySuggesting ? "Analyzing…" : "Suggest from image"}
          </Button>
        ) : null}

        {ratio != null ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              passesAA(ratio)
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-800"
            )}
            title={`Contrast ratio: ${ratio.toFixed(2)}:1`}
          >
            {passesAA(ratio) ? "AA ✓" : "AA ✗"} ({ratio.toFixed(1)})
          </span>
        ) : null}
      </div>

      {suggestions ? (
        <div className="rounded-md border bg-background p-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Suggestions
              </span>
              <span
                className="cursor-help text-[10px] text-muted-foreground"
                title="We sample your image's pixels, build a colour histogram, and rank suggestions. 'Best contrast' picks from a fixed brand palette by WCAG contrast against the dominant colour. 'Match dominant' synthesises lightness variations of the image's colour. 'Image palette' returns the top dominant colours actually present in the image (de-duplicated)."
              >
                ⓘ
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded border p-0.5 text-[10px]">
                <button
                  type="button"
                  className={cn(
                    "px-1.5 py-0.5 rounded",
                    suggestMode === "best-contrast"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                  onClick={() => {
                    setSuggestMode("best-contrast");
                    void runSuggest("best-contrast", aaOnly);
                  }}
                >
                  Best contrast
                </button>
                <button
                  type="button"
                  className={cn(
                    "px-1.5 py-0.5 rounded",
                    suggestMode === "match-dominant"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                  onClick={() => {
                    setSuggestMode("match-dominant");
                    void runSuggest("match-dominant", aaOnly);
                  }}
                >
                  Match dominant
                </button>
                <button
                  type="button"
                  className={cn(
                    "px-1.5 py-0.5 rounded",
                    suggestMode === "image-palette"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                  onClick={() => {
                    setSuggestMode("image-palette");
                    void runSuggest("image-palette", aaOnly);
                  }}
                >
                  Image palette
                </button>
              </div>
              <label
                className={cn(
                  "flex items-center gap-1 text-[10px]",
                  suggestMode === "image-palette"
                    ? "text-muted-foreground/50 line-through"
                    : "text-muted-foreground"
                )}
                title={
                  suggestMode === "image-palette"
                    ? "AA filter doesn't apply to image-palette suggestions — these colours come from the image itself."
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={aaOnly}
                  disabled={suggestMode === "image-palette"}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setAaOnly(next);
                    void runSuggest(suggestMode, next);
                  }}
                />
                AA only
              </label>
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:underline"
                onClick={() => setSuggestions(null)}
              >
                Hide
              </button>
            </div>
          </div>
          {suggestMode === "image-palette" ? (
            <div className="mt-1 mb-2 text-[10px] text-muted-foreground">
              These colours come from the image itself, so they may not pass
              AA contrast against it. Pair with a frosted backdrop for
              readability.
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.hex}
                type="button"
                onClick={() => onChange(s.hex)}
                className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-[11px] hover:bg-muted"
                title={`${s.label} · ${s.contrast.toFixed(2)}:1`}
              >
                <span
                  className="inline-block h-4 w-4 rounded border"
                  style={{ backgroundColor: s.hex }}
                />
                <span className="font-mono">{s.hex}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-semibold",
                    s.passesAA
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-800"
                  )}
                >
                  {s.contrast.toFixed(1)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatsField({
  headline,
  items,
  onChangeHeadline,
  onChange,
}: {
  headline: string | null;
  items: StatsItem[];
  onChangeHeadline: (h: string) => void;
  onChange: (items: StatsItem[]) => void;
}) {
  const updateItem = (i: number, patch: Partial<StatsItem>) => {
    const next = items.map((it, idx) =>
      idx === i ? { ...it, ...patch } : it
    );
    onChange(next);
  };
  const addItem = () => {
    if (items.length >= 6) return;
    onChange([...items, { label: "", value: "" }]);
  };
  const removeItem = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <Label htmlFor="psb-stats-head">Headline (optional)</Label>
        <Input
          id="psb-stats-head"
          value={headline ?? ""}
          onChange={(e) => onChangeHeadline(e.target.value)}
          placeholder="e.g. Clinically tested results"
        />
      </div>

      <div className="space-y-2">
        <Label>Stats (1–6 items)</Label>
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            No stats yet. Click <strong>Add stat</strong> to start.
          </div>
        ) : null}
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr,1fr,auto] gap-2">
            <Input
              value={it.value}
              onChange={(e) => updateItem(i, { value: e.target.value })}
              placeholder="Value (e.g. 94%)"
            />
            <Input
              value={it.label}
              onChange={(e) => updateItem(i, { label: e.target.value })}
              placeholder="Label (e.g. saw firmer skin)"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeItem(i)}
              aria-label="Remove stat"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addItem}
          disabled={items.length >= 6}
        >
          <Plus className="h-4 w-4 mr-2" /> Add stat
        </Button>
      </div>
    </div>
  );
}

function PreviewPane({
  blocks,
  selectedBlock,
  previewMode,
  setPreviewMode,
  previewWidth,
  setPreviewWidth,
  onApplyTidy,
}: {
  blocks: StoryBlock[];
  selectedBlock: StoryBlock | null;
  previewMode: "tile" | "grid";
  setPreviewMode: (m: "tile" | "grid") => void;
  previewWidth: "desktop" | "mobile";
  setPreviewWidth: (w: "desktop" | "mobile") => void;
  onApplyTidy: (orderedIds: string[]) => Promise<void> | void;
}) {
  if (!selectedBlock && blocks.length === 0) return null;

  const showGrid = previewMode === "grid";
  const frameStyle: React.CSSProperties =
    previewWidth === "mobile"
      ? { width: 375, maxWidth: "100%" }
      : { width: "100%", maxWidth: 1200 };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Preview
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            <button
              type="button"
              className={cn(
                "px-2 py-1 rounded",
                previewMode === "tile"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
              onClick={() => setPreviewMode("tile")}
              disabled={!selectedBlock}
            >
              Tile
            </button>
            <button
              type="button"
              className={cn(
                "px-2 py-1 rounded",
                previewMode === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
              onClick={() => setPreviewMode("grid")}
              disabled={blocks.length === 0}
            >
              Full grid
            </button>
          </div>
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            <button
              type="button"
              className={cn(
                "px-2 py-1 rounded",
                previewWidth === "desktop"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
              onClick={() => setPreviewWidth("desktop")}
            >
              Desktop
            </button>
            <button
              type="button"
              className={cn(
                "px-2 py-1 rounded",
                previewWidth === "mobile"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
              onClick={() => setPreviewWidth("mobile")}
            >
              Mobile
            </button>
          </div>
        </div>
      </div>
      {/* Always-visible grid health strip — diagnostic info should be
          reachable without flipping the preview mode. */}
      {blocks.length > 0 ? (
        <GridHealth blocks={blocks} onApplyTidy={onApplyTidy} />
      ) : null}

      <div className="rounded-lg border bg-background p-4 overflow-x-auto">
        {showGrid ? (
          <div className="mx-auto" style={frameStyle}>
            <GridPreview
              blocks={blocks}
              selectedId={selectedBlock?.id ?? null}
              mobile={previewWidth === "mobile"}
            />
          </div>
        ) : selectedBlock ? (
          <div
            className={cn(
              "relative mx-auto",
              aspectClassForSize(selectedBlock.size)
            )}
            style={{
              width: previewWidth === "mobile" ? 375 : 600,
              maxWidth: "100%",
            }}
          >
            <StoryTile block={selectedBlock} preview />
          </div>
        ) : (
          <div className="text-center text-xs text-muted-foreground">
            Select a block to preview it.
          </div>
        )}
      </div>
    </div>
  );
}

function GridHealth({
  blocks,
  onApplyTidy,
}: {
  blocks: StoryBlock[];
  onApplyTidy: (orderedIds: string[]) => Promise<void> | void;
}) {
  const result: PackResult = packBlocks(
    blocks.map((b) => b.size),
    DEFAULT_COLS
  );
  const tidy = tidyOrder(blocks, DEFAULT_COLS);
  const wouldImprove =
    tidy.changed && tidy.after.emptyCells < result.emptyCells;
  const empty = result.emptyCells;
  const status =
    empty === 0 ? "clean" : wouldImprove ? "fixable" : "ragged";

  const tidyDisabled = !wouldImprove;
  const tidyTitle = wouldImprove
    ? `Reorder blocks to free ${empty - tidy.after.emptyCells} empty cell${
        empty - tidy.after.emptyCells === 1 ? "" : "s"
      }.`
    : "Already optimal — no reorder would shrink the grid further.";

  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-xs",
        status === "clean"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : status === "fixable"
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-neutral-200 bg-neutral-50 text-neutral-800"
      )}
    >
      <div className="flex items-center gap-2">
        {status === "clean" ? (
          <span>
            ✓ Grid fills cleanly across {result.totalRows} row
            {result.totalRows === 1 ? "" : "s"}.
          </span>
        ) : (
          <span>
            <strong>{empty}</strong> empty cell
            {empty === 1 ? "" : "s"} across {result.totalRows} row
            {result.totalRows === 1 ? "" : "s"}.
          </span>
        )}
        <span
          className="cursor-help text-[10px] opacity-70"
          title="Empty cells = positions on the bento grid that no tile occupies. Tidy reorders blocks (largest-first / tallest-first heuristics) to minimize empty cells."
        >
          ⓘ
        </span>
      </div>
      {/* Button is always rendered so the action is discoverable, even
          when no improvement is possible (it's then disabled with a
          tooltip explaining why). */}
      <Button
        type="button"
        size="sm"
        variant={wouldImprove ? "secondary" : "outline"}
        disabled={tidyDisabled}
        title={tidyTitle}
        onClick={() => void onApplyTidy(tidy.ordered.map((b) => b.id))}
      >
        {wouldImprove
          ? `Tidy grid (would save ${empty - tidy.after.emptyCells} cell${empty - tidy.after.emptyCells === 1 ? "" : "s"})`
          : "Tidy grid"}
      </Button>
    </div>
  );
}

function GridPreview({
  blocks,
  selectedId,
  mobile,
}: {
  blocks: StoryBlock[];
  selectedId: string | null;
  mobile: boolean;
}) {
  if (blocks.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-xs text-muted-foreground">
        No blocks yet.
      </div>
    );
  }

  // In mobile preview we force a single column regardless of editor
  // viewport width (Tailwind responsive classes key off viewport, not
  // container, so we use plain styles for stable scaling).
  const gridStyle: React.CSSProperties = mobile
    ? {
        display: "grid",
        gridTemplateColumns: "1fr",
        gridAutoRows: "180px",
        gap: 12,
      }
    : {
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gridAutoRows: "180px",
        gap: 16,
      };

  return (
    <div style={gridStyle}>
      {blocks.map((block) => {
        const span = mobile
          ? { gridColumn: "span 1", gridRow: "span 1" }
          : gridSpanInline(block.size);
        const isSelected = block.id === selectedId;
        return (
          <div
            key={block.id}
            style={span}
            className={cn(
              "relative",
              isSelected && "ring-2 ring-primary ring-offset-2 rounded-xl"
            )}
          >
            <StoryTile block={block} preview />
          </div>
        );
      })}
    </div>
  );
}

function gridSpanInline(size: StoryBlockSize): React.CSSProperties {
  switch (size) {
    case "1x1":
      return { gridColumn: "span 1", gridRow: "span 1" };
    case "2x1":
      return { gridColumn: "span 2", gridRow: "span 1" };
    case "1x2":
      return { gridColumn: "span 1", gridRow: "span 2" };
    case "2x2":
      return { gridColumn: "span 2", gridRow: "span 2" };
    case "4x1":
      return { gridColumn: "span 4", gridRow: "span 1" };
  }
}

function RecommendedSize({
  block,
  queuePatch,
}: {
  block: StoryBlock;
  queuePatch: (patch: Partial<StoryBlock>) => void;
}) {
  const url = storyMediaUrl(block.image_path);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(
    null
  );

  useEffect(() => {
    if (!url) {
      setDims(null);
      return;
    }
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      setDims({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      if (cancelled) return;
      setDims(null);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!dims || dims.width === 0 || dims.height === 0) return null;

  const ratio = dims.width / dims.height;
  const suggested = suggestedSizeForRatio(ratio);
  const matches = suggested === block.size;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-xs",
        matches
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-amber-200 bg-amber-50 text-amber-900"
      )}
    >
      <div>
        {matches ? (
          <>✓ Tile size matches the image&rsquo;s aspect ratio.</>
        ) : (
          <>
            Image is <strong>{ratio.toFixed(2)}:1</strong>. Current size{" "}
            <strong>{block.size}</strong>. Recommended:{" "}
            <strong>{suggested}</strong>.
          </>
        )}
        <span
          className="ml-2 cursor-help text-[10px] opacity-70"
          title="Recommendation maps the image's aspect ratio to the closest bento footprint: <0.7→1x2, ≤1.3→1x1, ≤2.3→2x1, >2.3→4x1."
        >
          ⓘ
        </span>
      </div>
      {!matches ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => queuePatch({ size: suggested })}
        >
          Apply {suggested}
        </Button>
      ) : null}
    </div>
  );
}

function FocalPointButton({
  block,
  queuePatch,
}: {
  block: StoryBlock;
  queuePatch: (patch: Partial<StoryBlock>) => void;
}) {
  const [open, setOpen] = useState(false);
  const url = storyMediaUrl(block.image_path);
  const aspect = SIZE_ASPECT[block.size] ?? 2;
  const fit = block.image_fit ?? "cover";
  const zoom =
    typeof block.image_zoom === "number" ? block.image_zoom : 1;
  const fx = typeof block.image_focal_x === "number" ? block.image_focal_x : 50;
  const fy = typeof block.image_focal_y === "number" ? block.image_focal_y : 50;
  const isCustomized =
    fit !== "cover" ||
    zoom !== 1 ||
    typeof block.image_focal_x === "number" ||
    typeof block.image_focal_y === "number";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!url}
      >
        <ImageIcon className="h-4 w-4 mr-2" />
        {isCustomized
          ? `Image fit: ${fit}${fit === "cover" && zoom !== 1 ? ` ${zoom.toFixed(1)}×` : ""}${fit === "cover" ? ` · ${fx.toFixed(0)},${fy.toFixed(0)}` : ""}`
          : "Adjust image fit"}
      </Button>
      {isCustomized ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            queuePatch({
              image_fit: "cover",
              image_zoom: 1,
              image_focal_x: null,
              image_focal_y: null,
            })
          }
        >
          Reset
        </Button>
      ) : null}
      <span className="text-[11px] text-muted-foreground">
        Cover crops to fill, Contain fits the whole image.
      </span>
      <FocalPointPicker
        open={open}
        imageUrl={url}
        initialX={typeof block.image_focal_x === "number" ? block.image_focal_x : null}
        initialY={typeof block.image_focal_y === "number" ? block.image_focal_y : null}
        initialFit={fit}
        initialZoom={zoom}
        aspectRatio={aspect}
        onSave={(x, y, nextFit, nextZoom) =>
          queuePatch({
            image_focal_x: nextFit === "cover" ? x : null,
            image_focal_y: nextFit === "cover" ? y : null,
            image_fit: nextFit,
            image_zoom: nextFit === "cover" ? nextZoom : 1,
          })
        }
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

function ImagePickerField({
  label,
  path,
  onUpload,
  onRemove,
}: {
  label: string;
  path: string | null;
  onUpload: (file: File) => Promise<void> | void;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const url = storyMediaUrl(path);

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="flex items-start gap-3">
        <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-md border bg-muted">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImagePlus className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                await onUpload(file);
              } finally {
                setBusy(false);
                if (inputRef.current) inputRef.current.value = "";
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4 mr-2" />
            {busy ? "Uploading…" : url ? "Replace" : "Upload"}
          </Button>
          {url ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            JPG / PNG / WebP, ≤ 4 MB.
          </p>
        </div>
      </div>
    </div>
  );
}
