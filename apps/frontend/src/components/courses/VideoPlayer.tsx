'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useVideoShortcuts } from '@/hooks/useVideoShortcuts';

interface Props {
  src: string;
  lessonId: string;
  courseId: string;
  onComplete?: () => void;
}

const storageKey = (lessonId: string) => `vp-${lessonId}`;

export function VideoPlayer({ src, lessonId, courseId, onComplete }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [completed, setCompleted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  useVideoShortcuts(videoRef);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const saved = localStorage.getItem(storageKey(lessonId));
    if (saved) v.currentTime = Number(saved);
  }, [lessonId]);

  // Reset error state when src changes
  useEffect(() => {
    setHasError(false);
    setRetryCount(0);
  }, [src]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || completed) return;
    localStorage.setItem(storageKey(lessonId), String(v.currentTime));
    if (v.duration && v.currentTime / v.duration >= 0.9) {
      setCompleted(true);
      fetch('/v1/progress/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId, courseId, completed: true }),
      });
      onComplete?.();
    }
  };

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setRetryCount((c) => c + 1);
  }, []);

  // Build the actual src, appending a cache-bust param on retries
  const videoSrc = retryCount > 0
    ? `${src}${src.includes('?') ? '&' : '?'}_retry=${retryCount}`
    : src;

  if (hasError) {
    return (
      <div
        className="w-full rounded-lg bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center gap-4 py-16 px-6"
        role="alert"
      >
        <svg
          className="w-12 h-12 text-gray-400 dark:text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
          />
        </svg>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Video failed to load
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center max-w-sm">
          This could be due to a network issue or an unsupported format. Please check your connection and try again.
        </p>
        <button
          onClick={handleRetry}
          className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={videoSrc}
      controls
      onTimeUpdate={handleTimeUpdate}
      onError={handleError}
      className="w-full rounded-lg bg-black dark:bg-black"
    />
  );
}

