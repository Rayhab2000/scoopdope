'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');

    if (!accessToken) {
      router.replace('/auth/login?error=oauth_failed');
      return;
    }

    localStorage.setItem('access_token', accessToken);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);

    api
      .get('/users/me')
      .then((res) => {
        login(accessToken, res.data);
        router.replace('/dashboard');
      })
      .catch(() => {
        router.replace('/auth/login?error=oauth_failed');
      });
  }, [searchParams, login, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <p className="text-gray-600 dark:text-gray-400">Signing you in…</p>
    </main>
  );
}
