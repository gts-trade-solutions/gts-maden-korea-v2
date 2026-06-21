import { createClient } from '@supabase/supabase-js';
import type { InfluencerVideo } from '@/types/influencer_video';

function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function getInfluencerVideos(pageScope = 'home', limit = 12): Promise<InfluencerVideo[]> {
  let data: any[] = [];
  if (process.env.CATALOG_BACKEND === 'mysql') {
    const { getInfluencerVideosLiveMysql } = await import('@/lib/data/home');
    data = await getInfluencerVideosLiveMysql(pageScope, limit);
  } else {
    const sb = supabaseServer();
    const res = await sb
      .from('home_influencer_videos_live')
      .select(
        `
        *,
        attached:home_influencer_video_products(
          position,
          products (
            id, slug, name,
            price, currency, compare_at_price, sale_price, sale_starts_at, sale_ends_at,
            hero_image_path, is_featured, is_trending, is_bundle,
            short_description, volume_ml, net_weight_g, country_of_origin, stock_qty,
            brands ( name )
          )
        )
        `
      )
      .eq('page_scope', pageScope)
      .order('position', { ascending: true })
      .limit(limit);

    if (res.error) {
      console.error('[hiv_live] fetch error:', res.error.message);
      return [];
    }
    data = res.data ?? [];
  }

  type RawRow = InfluencerVideo & {
    attached?: Array<{ position: number; products: any }> | null;
  };

  const rows = (data ?? []) as RawRow[];
  // video-only UI: keep only playable items, flatten M:N products array
  return rows
    .filter((r) => !!r.video_url)
    .map((r) => {
      const attached = (r.attached ?? [])
        .filter((a) => !!a.products)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((a) => a.products);
      const { attached: _drop, ...rest } = r;
      return { ...rest, products: attached } as InfluencerVideo;
    });
}
