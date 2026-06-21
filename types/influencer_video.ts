import type { AttachedProduct } from "./attached_product";

export type InfluencerVideo = {
  id: string;
  influencer_name: string;
  influencer_handle?: string | null;
  caption?: string | null;
  views?: number | null;

  // we use this
  video_url?: string | null;
  thumbnail_url?: string | null;

  // optional extras (ignored by the video-only UI)
  instagram_link?: string | null;
  post_url?: string | null;
  embed_captioned?: boolean;

  // Products attached via home_influencer_video_products (M:N).
  products?: AttachedProduct[];

  page_scope?: string;
  position?: number;
  created_at?: string;
  updated_at?: string;
};
