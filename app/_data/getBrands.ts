import { publicURL } from '@/lib/storage-public-url';

export type BrandCard = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  product_count: number;
  logo: string; // what the carousel expects
};

export async function getBrandsForCarousel(bucket = 'site-assets'): Promise<BrandCard[]> {
  const { getBrandsLiveMysql } = await import('@/lib/data/home');
  const data: any[] = await getBrandsLiveMysql();

  return (data ?? []).map((b: any) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    description: b.description,
    product_count: b.product_count ?? 0,
    // prefer stored public URL, else derive from storage path
    logo: b.thumbnail_url ?? publicURL(bucket, b.thumbnail_path) ?? '/placeholder.png'
  }));
}
