import type { AttachedProduct } from "./attached_product";

export type HomeProductVideo = {
  id: string;
  title: string;
  description: string | null;
  page_scope: string;
  position: number;

  video_path: string | null;
  video_url: string | null;
  thumbnail_path: string | null;
  thumbnail_url: string | null;

  // Legacy single-product columns kept for backwards compatibility but no
  // longer rendered. New attachments use the M:N `products` array below.
  product_id: string | null;
  product_slug: string | null;
  product_name: string | null;
  price: number | null;
  currency: string | null;

  // Products attached via home_product_video_products (M:N).
  products?: AttachedProduct[];

  created_at: string;
  updated_at: string;
};
