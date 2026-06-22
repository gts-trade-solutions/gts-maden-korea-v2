'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { resolveMediaUrl } from '@/lib/storage/backend';

interface SearchSuggestion {
  type: 'product';
  id: string;
  title: string;
  image?: string;
  url: string;
}

type SearchAutocompleteProps = {
  /**
   * When true, focuses the input on mount and shows the on-screen
   * keyboard on mobile. Use only on surfaces where focus is the
   * intended outcome of the user's last action (e.g. tapping the
   * header search icon). Do NOT enable inside menus / sheets — Radix
   * already auto-focuses the first focusable child of a sheet, which
   * would pop the keyboard the moment the menu opens.
   */
  autoFocus?: boolean;
};

export function SearchAutocomplete({ autoFocus = false }: SearchAutocompleteProps = {}) {
  const router = useRouter();
  const t = useTranslations('searchAuto');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const q = query.trim();

    if (q.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setSelectedIndex(-1);
      setLoading(false);
      setErrorState(null);
      return;
    }

    let cancelled = false;
    setIsOpen(true);
    setLoading(true);
    setErrorState(null);

    const debounce = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_products_tsv', {
        q,
        lim: 8,
        cfg: 'simple',
      });

      if (cancelled) return;

      if (error) {
        console.error('search rpc error', error);
        setSuggestions([]);
        setIsOpen(true);
        setSelectedIndex(-1);
        setLoading(false);
        setErrorState('Could not load suggestions right now.');
        return;
      }

      const next: SearchSuggestion[] = (data ?? []).map((p: any) => {
        return {
          type: 'product',
          id: p.id,
          title: p.name,
          image: resolveMediaUrl('product-media', p.hero_image_path),
          url: `/products/${p.slug}`,
        };
      });

      setSuggestions(next);
      setIsOpen(true);
      setSelectedIndex(-1);
      setLoading(false);
      setErrorState(null);
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        handleSelect(suggestions[selectedIndex]);
      } else {
        handleSearch();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelect = (s: SearchSuggestion) => {
    router.push(s.url);
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  };

  const handleSearch = () => {
    const q = query.trim();
    if (!q) return;

    router.push(`/search?q=${encodeURIComponent(q)}`);
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  };

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const highlightMatch = (text: string) => {
    const q = query.trim();
    if (!q) return text;

    const regex = new RegExp(`(${escapeRegExp(q)})`, 'gi');
    const parts = text.split(regex);

    return (
      <span>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-yellow-200 text-foreground font-semibold">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  };

  const trimmedQuery = query.trim();
  const showNoResults =
    isOpen && trimmedQuery.length >= 2 && !loading && suggestions.length === 0;

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          placeholder={t('placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.trim().length >= 2) setIsOpen(true);
          }}
          className="pl-10 pr-4"
        />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-background border rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">{t('searching')}</div>
          ) : errorState ? (
            <div className="p-4 text-sm text-destructive">{errorState}</div>
          ) : suggestions.length > 0 ? (
            <div className="p-2">
              {suggestions.map((s, index) => (
                <button
                  key={s.id}
                  onClick={() => handleSelect(s)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left',
                    selectedIndex === index && 'bg-muted'
                  )}
                >
                  {s.image ? (
                    <img
                      src={s.image}
                      alt={s.title}
                      className="w-10 h-10 object-cover rounded"
                    />
                  ) : (
                    <div className="w-10 h-10 flex items-center justify-center bg-muted rounded">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{highlightMatch(s.title)}</div>
                    <div className="text-xs text-muted-foreground capitalize">{t('productLabel')}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : showNoResults ? (
            <div className="p-4 text-sm text-muted-foreground">
              {t('noMatchesPrefix')} <strong>{trimmedQuery}</strong> {t('noMatchesSuffix')}
            </div>
          ) : null}

          {trimmedQuery && (
            <div className="border-t p-2">
              <button
                onClick={handleSearch}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm"
              >
                <Search className="h-4 w-4" />
                <span>
                  {t('searchForPrefix')} <strong>{trimmedQuery}</strong>
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
