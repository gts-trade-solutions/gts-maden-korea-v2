import { createClient } from '@supabase/supabase-js';
import { publicURL } from '@/lib/storage-public-url';

export type BrandCard = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  product_count: number;
  logo: string; // what the carousel expects
};

function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function getBrandsForCarousel(bucket = 'site-assets'): Promise<BrandCard[]> {
  let data: any[] = [];
  if (process.env.CATALOG_BACKEND === 'mysql') {
    const { getBrandsLiveMysql } = await import('@/lib/data/home');
    data = await getBrandsLiveMysql();
  } else {
    const sb = supabaseServer();
    const res = await sb.from('brands_live').select('*').order('position', { ascending: true });
    if (res.error) {
      console.error('[brands_live] error:', res.error.message);
      return [];
    }
    data = res.data ?? [];
  }

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
