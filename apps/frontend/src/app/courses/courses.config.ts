import { useEffect, useState } from 'react';

export type SortOption = 'newest' | 'popular' | 'rating';

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const CATEGORIES = ['Blockchain', 'DeFi', 'Smart Contracts', 'Web3', 'Stellar'] as const;
export const LANGUAGES = [
  { label: 'English', value: 'en' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' },
  { label: 'Arabic', value: 'ar' },
] as const;
export const DURATIONS = [
  { label: '< 2h', value: '0-2' },
  { label: '2–5h', value: '2-5' },
  { label: '5–10h', value: '5-10' },
  { label: '10h+', value: '10-999' },
];
export const PRICE_RANGES = [
  { label: 'Free', value: 'free' },
  { label: 'Under $20', value: '0-20' },
  { label: '$20–$50', value: '20-50' },
  { label: '$50+', value: '50-999' },
];
export const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Most Popular', value: 'popular' },
  { label: 'Top Rated', value: 'rating' },
];

export function useDebounce<T>(value: T, delay = 400): T {
  const [d, setD] = useState(value);
  useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return d;
}
