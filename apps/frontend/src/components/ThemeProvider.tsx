'use client';

import { useEffect, useState } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // Prevent transition on initial load (avoid FOUC)
  useEffect(() => setMounted(true), []);

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="Scoopdope-theme"
    >
      <div className={mounted ? 'transition-colors duration-300' : 'transition-none'}>
        {children}
      </div>
    </NextThemesProvider>
  );
}
