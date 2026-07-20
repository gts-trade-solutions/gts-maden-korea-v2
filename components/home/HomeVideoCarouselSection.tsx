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
  const { getProductVideosLiveMysql } = await import('@/lib/data/home');
  data = await getProductVideosLiveMysql(pageScope, limit);

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
