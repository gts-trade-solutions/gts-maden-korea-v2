'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { STORAGE_KEYS, storage } from '@/lib/storage';
import { useAuth } from '@/lib/contexts/AuthContext';

// Wishlist writes go through /api/wishlist (service-role, user-scoped) because
// the browser anon Supabase client is RLS-denied under NextAuth.
const wlPost = (payload: any) =>
  fetch('/api/wishlist', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

interface WishlistContextType {
  wishlistItems: string[];
  addToWishlist: (productId: string) => void;
  removeFromWishlist: (productId: string) => void;
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  wishlistCount: number;
  clearWishlist: () => void;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const [wishlistItems, setWishlistItems] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    (async () => {
      const savedWishlist = storage.get<string[]>(STORAGE_KEYS.WISHLIST) ?? [];

      if (!user) {
        if (!cancelled) {
          setWishlistItems(savedWishlist);
          setIsInitialized(true);
        }
        return;
      }

      if (savedWishlist.length > 0) {
        await wlPost({ op: 'merge', product_ids: savedWishlist }).catch(() => {});
      }

      const res = await fetch('/api/wishlist', { credentials: 'include', cache: 'no-store' });
      const body = await res.json().catch(() => ({ items: [] }));

      if (!cancelled) {
        setWishlistItems((body.items ?? []).map((row: any) => row.product_id));
        setIsInitialized(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  useEffect(() => {
    if (isInitialized) {
      if (user) {
        storage.remove(STORAGE_KEYS.WISHLIST);
      } else {
        storage.set(STORAGE_KEYS.WISHLIST, wishlistItems);
      }
    }
  }, [wishlistItems, isInitialized, user]);

  const addToWishlist = (productId: string) => {
    let added = false;
    setWishlistItems(prev => {
      if (prev.includes(productId)) {
        return prev;
      }
      added = true;
      return [...prev, productId];
    });

    if (user && added) {
      void (async () => {
        const res = await wlPost({ op: 'add', product_id: productId });
        if (!res.ok) {
          setWishlistItems(prev => prev.filter(id => id !== productId));
          console.error('Failed to add wishlist item');
        }
      })();
    }
  };

  const removeFromWishlist = (productId: string) => {
    const removed = wishlistItems.includes(productId);
    setWishlistItems(prev => prev.filter(id => id !== productId));

    if (user && removed) {
      void (async () => {
        const res = await wlPost({ op: 'remove', product_id: productId });
        if (!res.ok) {
          setWishlistItems(prev => (prev.includes(productId) ? prev : [...prev, productId]));
          console.error('Failed to remove wishlist item');
        }
      })();
    }
  };

  const toggleWishlist = (productId: string) => {
    const exists = wishlistItems.includes(productId);
    if (exists) {
      removeFromWishlist(productId);
      return;
    }
    addToWishlist(productId);
  };

  const isInWishlist = (productId: string): boolean => {
    return wishlistItems.includes(productId);
  };

  const clearWishlist = () => {
    setWishlistItems([]);

    if (user) {
      void wlPost({ op: 'clear' }).catch(() => console.error('Failed to clear wishlist'));
    }
  };

  const value: WishlistContextType = {
    wishlistItems,
    addToWishlist,
    removeFromWishlist,
    toggleWishlist,
    isInWishlist,
    wishlistCount: wishlistItems.length,
    clearWishlist,
  };

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (context === undefined) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
}
