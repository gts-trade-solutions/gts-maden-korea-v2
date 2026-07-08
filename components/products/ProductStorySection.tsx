"use client";

import { useState } from "react";
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
   * Discover blocks, fetched by the server component (PDP reads them from
   * MySQL via getStoryBlocksMysql) and passed down. Undefined/empty → the
   * section renders nothing. This component is purely prop-driven now; there
   * is no client-side data fetch (Supabase removed).
   */
  initialBlocks?: StoryBlock[];
};

export function ProductStorySection({ initialBlocks }: Props) {
  const blocks: StoryBlock[] = initialBlocks ?? [];
  const [openBlock, setOpenBlock] = useState<StoryBlock | null>(null);

  // The vast majority of products have no Discover content; render nothing
  // rather than a skeleton so there's no layout flash.
  if (blocks.length === 0) return null;

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
