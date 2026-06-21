import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { getTranslations } from 'next-intl/server';
import { CustomerLayout } from '@/components/CustomerLayout';
import { Card } from '@/components/ui/card';
import { publicURL } from '@/lib/storage-public-url';

const CANONICAL = 'https://madenkorea.com/brands';
const TITLE = 'All Korean beauty brands';
const DESCRIPTION =
  'Browse every authentic K-beauty brand stocked at MadenKorea — sourced direct from Korea, available across India.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: 'website',
    url: CANONICAL,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

type BrandRow = {
  id: string;
  slug: string;
  name: string;
  logo_url?: string | null;
  thumbnail_url?: string | null;
  thumbnail_path?: string | null;
};

type BrandCard = {
  id: string;
  slug: string;
  name: string;
  logo: string;
  product_count: number;
};

function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function getLiveBrands(): Promise<BrandCard[]> {
  const notMIK = (b: any) => b.name?.trim().toLowerCase() !== 'made in korea';
  const toCard = (b: any, count: number): BrandCard => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    product_count: count,
    logo:
      b.logo_url ??
      b.thumbnail_url ??
      publicURL('site-assets', b.thumbnail_path) ??
      '/placeholder.png',
  });

  if (process.env.CATALOG_BACKEND === 'mysql') {
    const { getBrandsDirectoryMysql } = await import('@/lib/data/catalog');
    const data = await getBrandsDirectoryMysql();
    return (data ?? []).filter(notMIK).map((b: any) => toCard(b, b.product_count ?? 0));
  }

  const sb = supabaseServer();

  const { data: products } = await sb
    .from('products')
    .select('brand_id')
    .eq('is_published', true)
    .not('brand_id', 'is', null);

  const counts = new Map<string, number>();
  for (const row of products ?? []) {
    const id = row.brand_id as string | null;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const brandIds = Array.from(counts.keys());
  if (brandIds.length === 0) return [];

  const { data: brands } = await sb
    .from('brands')
    .select('id, slug, name, logo_url, thumbnail_url, thumbnail_path')
    .in('id', brandIds)
    .order('name', { ascending: true });

  return (brands ?? []).filter(notMIK).map((b: BrandRow) => toCard(b, counts.get(b.id) ?? 0));
}

export default async function BrandsPage() {
  const t = await getTranslations('brandsPage');
  const brands = await getLiveBrands();

  const groupedBrands = brands.reduce((acc, brand) => {
    const firstLetter = brand.name[0].toUpperCase();
    if (!acc[firstLetter]) {
      acc[firstLetter] = [];
    }
    acc[firstLetter].push(brand);
    return acc;
  }, {} as Record<string, BrandCard[]>);

  const sortedLetters = Object.keys(groupedBrands).sort();

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
          <p className="text-lg text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="space-y-12">
          {sortedLetters.map((letter) => (
            <div key={letter} id={letter}>
              <h2 className="text-2xl font-bold mb-6 border-b pb-2">{letter}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {groupedBrands[letter].map((brand) => (
                  <Link key={brand.id} href={`/brand/${brand.slug}`}>
                    <Card className="p-6 hover:shadow-lg transition-shadow h-full flex flex-col items-center justify-center">
                      <div className="relative w-full aspect-square mb-4">
                        <Image
                          src={brand.logo}
                          alt={brand.name}
                          fill
                          className="object-contain"
                        />
                      </div>
                      <h3 className="font-semibold text-center mb-1">{brand.name}</h3>
                      {brand.product_count !== undefined && (
                        <p className="text-sm text-muted-foreground text-center">
                          {t('productCount', { count: brand.product_count })}
                        </p>
                      )}
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </CustomerLayout>
  );
}
