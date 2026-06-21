'use client';

import { useMemo, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card } from '../ui/card';
import { supabaseImageLoader } from '@/lib/supabaseImageLoader';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';

type Brand = {
  id: string;
  slug: string;
  name: string;
  logo: string; // public URL
  product_count?: number;
};

export function BrandCarousel({ brands }: { brands: Brand[] }) {
  // All hooks must run unconditionally (React rules-of-hooks), so we
  // call them before any early return.
  const t = useTranslations('home');

  const SLIDES_PER_VIEW_2XL = 7;
  const MIN_FOR_LOOP = SLIDES_PER_VIEW_2XL * 2; // Embla needs >= 2x slidesInView

  // Duplicate brands only when needed so loop always works
  const items = useMemo(() => {
    if (!brands || brands.length === 0) return [];
    if (brands.length >= MIN_FOR_LOOP) return brands.map((b, i) => ({ brand: b, key: `${b.id}-${i}` }));
    const copies = Math.ceil(MIN_FOR_LOOP / brands.length);
    const out: { brand: Brand; key: string }[] = [];
    for (let c = 0; c < copies; c++) {
      for (let i = 0; i < brands.length; i++) {
        out.push({ brand: brands[i], key: `${brands[i].id}-${c}-${i}` });
        if (out.length >= MIN_FOR_LOOP) break;
      }
      if (out.length >= MIN_FOR_LOOP) break;
    }
    return out;
  }, [brands]);

  const autoplay = useRef(
    Autoplay({
      delay: 4000,              // 4s gap
      stopOnInteraction: false, // keep playing after drag/touch
      stopOnMouseEnter: true,   // pause on hover
    })
  );

  if (!brands || brands.length === 0) return null;

  return (
    <section>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">{t('shopByBrandTitle')}</h2>
        <p className="text-muted-foreground">{t('shopByBrandDescription')}</p>
      </div>

      <Carousel
        opts={{
          align: 'start',
          loop: true,
          // dragFree: false, // optional
          // containScroll: 'trimSnaps', // optional
        }}
        plugins={[autoplay.current]}
        onMouseEnter={autoplay.current.stop}
        onMouseLeave={autoplay.current.reset}
      >
        <CarouselContent>
          {items.map(({ brand, key }) => {
            const hasProducts = (brand.product_count ?? 0) > 0;

            const CardInner = (
              <Card
                className={[
                  'p-6 h-full flex flex-col items-center justify-center',
                  hasProducts ? 'hover:shadow-lg cursor-pointer' : 'opacity-60 cursor-not-allowed',
                ].join(' ')}
              >
                <div className="relative w-full aspect-square mb-3">
                  <Image
                    src={brand.logo}
                    alt={brand.name}
                    fill
                    className="object-contain"
                    sizes="(min-width:1536px) 14.3vw, (min-width:1280px) 16.6vw, (min-width:1024px) 20vw, (min-width:640px) 33.3vw, 50vw"
                    loader={supabaseImageLoader}
                  />
                </div>
                <h3 className="font-semibold text-center">{brand.name}</h3>
              </Card>
            );

            return (
              <CarouselItem
                key={key}
                className="
                  basis-1/3 sm:basis-1/4 md:basis-1/5
                  lg:basis-1/5 xl:basis-1/6
                  2xl:basis-[14.2857%]   /* 1/7 at 2XL */
                "
              >
                {hasProducts ? (
                  <Link href={`/brand/${brand.slug}`}>{CardInner}</Link>
                ) : (
                  <div aria-disabled="true" className="pointer-events-none">
                    {CardInner}
                  </div>
                )}
              </CarouselItem>
            );
          })}
        </CarouselContent>

        {/* Navigation removed per request */}
      </Carousel>
    </section>
  );
}
