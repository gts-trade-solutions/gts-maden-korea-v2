import { supabaseRSC } from '@/lib/supabase-rsc';
import { publicURL } from '@/lib/storage-public-url';
import { HomeProductVideo } from '@/types/home_product_videos';
import { ProductVideoCarousel } from '@/components/home/ProductVideoCarousel'; // <-- named import

export const revalidate = 60;

type Props = {
  pageScope?: string;
  limit?: number;
  bucket?: string; // storage bucket containing product-videos/*
};

export default async function HomeVideoCarouselSection({
  pageScope = 'home',
  limit = 8,
  bucket = 'product-media',
}: Props) {
  type RawRow = HomeProductVideo & {
    attached?: Array<{ position: number; products: any }> | null;
  };

  let data: any[] = [];
  if (process.env.CATALOG_BACKEND === 'mysql') {
    const { getProductVideosLiveMysql } = await import('@/lib/data/home');
    data = await getProductVideosLiveMysql(pageScope, limit);
  } else {
    const sb = supabaseRSC();
    // We hit the *base* table here, not `home_product_videos_live`. The view
    // is a JOIN of home_product_videos × products, and PostgREST can't infer
    // relationships through multi-table views — embedding the M:N join
    // (`home_product_video_products`) returns nothing through the view.
    // Inlining the view's "active + within window" filter here gets us the
    // same row set with the FK relationship intact.
    const nowIso = new Date().toISOString();
    const res = await sb
      .from('home_product_videos')
      .select(
        `
        id, title, description, page_scope, position,
        video_path, video_url, thumbnail_path, thumbnail_url,
        product_id, created_at, updated_at,
        attached:home_product_video_products(
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
      .eq('active', true)
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
      .order('position', { ascending: true })
      .limit(limit);

    if (res.error) {
      console.error('[hpv] fetch error:', res.error.message);
      return null;
    }
    data = res.data ?? [];
  }

  const rows = (data ?? []) as RawRow[];

  // Ensure video_url / thumbnail_url exist by falling back to storage paths.
  // Flatten the M:N products into a sorted array on each video.
  const videos: HomeProductVideo[] = rows
    .map((v) => {
      const attached = (v.attached ?? [])
        .filter((a) => !!a.products)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((a) => a.products);
      const { attached: _drop, ...rest } = v;
      return {
        ...rest,
        video_url: v.video_url ?? publicURL(bucket, v.video_path) ?? null,
        thumbnail_url: v.thumbnail_url ?? publicURL(bucket, v.thumbnail_path) ?? null,
        products: attached,
      } as HomeProductVideo;
    })
    // don’t render rows without a resolvable video url
    .filter((v) => !!v.video_url);

  if (videos.length === 0) return null;

  return <ProductVideoCarousel videos={videos} />;
}
