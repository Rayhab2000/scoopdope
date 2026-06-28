'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import { LANGUAGES, DURATIONS, PRICE_RANGES, SORT_OPTIONS, useDebounce, type SortOption } from './courses.config';
import type { Course } from '@/components/courses/CourseCard';

type CoursesResponse = { data: Course[]; total: number; page: number; limit: number };

const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error('Failed to fetch courses'); return r.json(); });

export function useCoursesFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(() => searchParams.get('search') ?? '');
  const [level, setLevel] = useState(() => searchParams.get('level') ?? '');
  const [language, setLanguage] = useState(() => searchParams.get('language') ?? '');
  const [category, setCategory] = useState(() => searchParams.get('category') ?? '');
  const [duration, setDuration] = useState(() => searchParams.get('duration') ?? '');
  const [price, setPrice] = useState(() => searchParams.get('price') ?? '');
  const [sort, setSort] = useState<SortOption>(() => (searchParams.get('sort') as SortOption) ?? 'newest');

  const dq = useDebounce(query);

  const pushUrl = useCallback((overrides: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    const v = { search: dq, level, language, category, duration, sort, price, ...overrides };
    if (v.search?.trim()) p.set('search', v.search.trim());
    if (v.level) p.set('level', v.level);
    if (v.language) p.set('language', v.language);
    if (v.category) p.set('category', v.category);
    if (v.duration) p.set('duration', v.duration);
    if (v.price) p.set('price', v.price);
    if (v.sort !== 'newest') p.set('sort', v.sort);
    router.push(`/courses?${p.toString()}`, { scroll: false });
  }, [dq, level, language, category, duration, sort, price, router]);

  const isFirstRender = useRef(true);
  useEffect(() => { if (isFirstRender.current) { isFirstRender.current = false; return; } pushUrl({ search: dq }); }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilter(key: string, value: string) {
    if (key === 'level') setLevel(value); else if (key === 'language') setLanguage(value);
    else if (key === 'category') setCategory(value); else if (key === 'duration') setDuration(value);
    else if (key === 'price') setPrice(value); else if (key === 'sort') setSort(value as SortOption);
    pushUrl({ [key]: value });
  }

  const clearAll = () => {
    setLevel(''); setLanguage(''); setCategory(''); setDuration(''); setPrice(''); setSort('newest');
    router.push('/courses', { scroll: false });
  };

  const getKey = (pageIndex: number, prev: CoursesResponse | null) => {
    if (prev && prev.data.length === 0) return null;
    const p = new URLSearchParams();
    if (dq.trim()) p.set('search', dq.trim());
    if (level) p.set('level', level);
    if (language) p.set('language', language);
    if (category) p.set('category', category);
    if (duration) { const [mn, mx] = duration.split('-'); p.set('durationMin', mn); p.set('durationMax', mx); }
    if (price) { if (price === 'free') p.set('priceMax', '0'); else { const [mn, mx] = price.split('-'); p.set('priceMin', mn); p.set('priceMax', mx); } }
    p.set('sort', sort); p.set('page', String(pageIndex + 1)); p.set('limit', '9');
    return `/courses?${p.toString()}`;
  };

  const { data, error, isLoading, isValidating, size, setSize } = useSWRInfinite<CoursesResponse>(
    getKey, fetcher, { revalidateOnFocus: false, revalidateFirstPage: false },
  );
  useEffect(() => { setSize(1); }, [`${dq}-${level}-${language}-${category}-${duration}-${price}-${sort}`, setSize]);

  const courses = data ? data.flatMap((p) => p.data) : [];
  const isLoadingMore = isValidating && size > 1;
  const hasMore = !!(data && data[data.length - 1]?.data.length === 9);

  const activeFilters = [
    ...(level ? [{ label: `Level: ${level}`, clear: () => applyFilter('level', '') }] : []),
    ...(language ? [{ label: `Language: ${LANGUAGES.find((l) => l.value === language)?.label ?? language}`, clear: () => applyFilter('language', '') }] : []),
    ...(category ? [{ label: `Category: ${category}`, clear: () => applyFilter('category', '') }] : []),
    ...(duration ? [{ label: `Duration: ${DURATIONS.find((d) => d.value === duration)?.label ?? duration}`, clear: () => applyFilter('duration', '') }] : []),
    ...(price ? [{ label: `Price: ${PRICE_RANGES.find((p) => p.value === price)?.label ?? price}`, clear: () => applyFilter('price', '') }] : []),
    ...(sort !== 'newest' ? [{ label: `Sort: ${SORT_OPTIONS.find((s) => s.value === sort)?.label}`, clear: () => applyFilter('sort', 'newest') }] : []),
  ];

  return {
    query, setQuery, level, language, category, duration, price, sort, dq,
    applyFilter, clearAll, activeFilters,
    courses, error, isLoading, isLoadingMore, hasMore, size, setSize,
  };
}
