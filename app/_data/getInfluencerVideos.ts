import type { InfluencerVideo } from '@/types/influencer_video';

export async function getInfluencerVideos(pageScope = 'home', limit = 12): Promise<InfluencerVideo[]> {
  const { getInfluencerVideosLiveMysql } = await import('@/lib/data/home');
  const data: any[] = await getInfluencerVideosLiveMysql(pageScope, limit);

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
