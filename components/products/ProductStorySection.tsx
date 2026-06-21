"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  StoryTile,
  aspectClassForSize,
  gridSpanClassForSize,
} from "./StoryTile";
import { StoryTileExpanded } from "./StoryTileExpanded";
import type { StoryBlock } from "@/lib/types/productStory";

type Props = {
  productId: string;
  /**
   * When the parent has already fetched the blocks (e.g. from a server
   * component), pass them here to skip the client-side roundtrip and
   * any loading state. Empty array → section renders nothing.
   */
  initialBlocks?: StoryBlock[];
};

const SELECT_COLUMNS =
  "id, product_id, position, block_type, size, mode, headline, body, text_position, text_color, text_bg, text_size, text_weight, caption_mode, caption_backdrop, split_direction, image_path, image_alt, image_focal_x, image_focal_y, image_fit, image_zoom, image_bg, caption, stats_items, before_image_path, after_image_path, comparison_caption, created_at, updated_at";

export function ProductStorySection({ productId, initialBlocks }: Props) {
  const [blocks, setBlocks] = useState<StoryBlock[] | null>(
    initialBlocks ?? null
  );
  const [errored, setErrored] = useState(false);
  const [openBlock, setOpenBlock] = useState<StoryBlock | null>(null);

  useEffect(() => {
    if (initialBlocks) return; // server gave us the data; do nothing
    let cancelled = false;
    if (!productId) {
      setBlocks([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("product_story_blocks")
        .select(SELECT_COLUMNS)
        .eq("product_id", productId)
        .order("position", { ascending: true });

      if (cancelled) return;
      if (error) {
        setErrored(true);
        setBlocks([]);
        return;
      }
      setBlocks((data ?? []) as StoryBlock[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, initialBlocks]);

  // Loading: render nothing. We don't yet know whether this product has
  // any Discover content, and the vast majority of products have none —
  // showing a skeleton would cause a layout flash on every product page.
  if (blocks === null) return null;

  if (errored || blocks.length === 0) return null;

  return (
    <>
      <section id="discover" className="my-12 md:my-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-6">Discover</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 md:auto-rows-[220px] gap-3 md:gap-4">
          {blocks.map((block, idx) => (
            <div
              key={block.id}
              className={cn(
                gridSpanClassForSize(block.size),
                aspectClassForSize(block.size),
                "md:aspect-auto"
              )}
            >
              <StoryTile
                block={block}
                priority={idx === 0}
                onExpand={(b) => setOpenBlock(b)}
              />
            </div>
          ))}
        </div>
      </section>

      <StoryTileExpanded
        block={openBlock}
        onOpenChange={(open) => {
          if (!open) setOpenBlock(null);
        }}
        hasPrev={
          !!openBlock &&
          (blocks ?? []).findIndex((b) => b.id === openBlock.id) > 0
        }
        hasNext={
          !!openBlock &&
          (blocks ?? []).findIndex((b) => b.id === openBlock.id) <
            (blocks ?? []).length - 1
        }
        onNavigate={(direction) => {
          if (!openBlock || !blocks) return;
          const idx = blocks.findIndex((b) => b.id === openBlock.id);
          const nextIdx = idx + direction;
          if (nextIdx < 0 || nextIdx >= blocks.length) return;
          setOpenBlock(blocks[nextIdx]);
        }}
      />
    </>
  );
}

/**
 * Skeleton variant — render only when you *know* there will be content
 * (e.g. an admin live preview, or a server-confirmed non-empty block
 * list still streaming in). We intentionally do not render this on the
 * customer storefront.
 */
export function ProductStorySectionSkeleton() {
  return (
    <section id="discover" aria-busy="true" className="my-12 md:my-16">
      <h2 className="text-2xl md:text-3xl font-bold mb-6">Discover</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
        <Skeleton className="aspect-[2/1] md:col-span-2 rounded-xl" />
        <Skeleton className="aspect-[2/1] md:col-span-2 rounded-xl" />
        <Skeleton className="aspect-[4/1] md:col-span-4 rounded-xl" />
      </div>
    </section>
  );
}

export default ProductStorySection;
