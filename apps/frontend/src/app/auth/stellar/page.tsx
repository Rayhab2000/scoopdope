'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function StellarAuthPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleStellarLogin = async () => {
    setStatus('loading');
    setError(null);
    try {
      // Dynamically import Freighter so the page works even without the extension
      const freighter = await import('@stellar/freighter-api').catch(() => null);
      if (!freighter) throw new Error('Freighter wallet extension not found. Please install it.');

      const publicKey = await freighter.getPublicKey();
      if (!publicKey) throw new Error('No public key returned from Freighter.');

      // 1. Get SEP-10 challenge
      const { data: challenge } = await api.get<{ transaction: string; network_passphrase: string }>(
        `/auth/stellar?account=${publicKey}`
      );

      // 2. Sign challenge with Freighter
      const signed = await freighter.signTransaction(challenge.transaction, {
        networkPassphrase: challenge.network_passphrase,
      });
      const signedXdr = typeof signed === 'string' ? signed : signed.signedTxXdr;

      // 3. Exchange for JWT
      const { data: tokens } = await api.post<{ access_token: string }>('/auth/stellar', {
        transaction: signedXdr,
      });

      localStorage.setItem('access_token', tokens.access_token);
      const profileResponse = await api.get('/users/me');
      login(tokens.access_token, profileResponse.data);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Authentication failed');
      setStatus('error');
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow p-8 flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Stellar Wallet Login</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Authenticate using your Stellar keypair via SEP-10 challenge/response.
          </p>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <Button
          onClick={handleStellarLogin}
          disabled={status === 'loading'}
          className="w-full flex items-center justify-center gap-2"
        >
          {status === 'loading' ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Connecting…
            </>
          ) : (
            <>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              Connect with Freighter
            </>
          )}
        </Button>

        <p className="text-xs text-center text-gray-400 dark:text-gray-500">
          Requires the{' '}
          <a
            href="https://freighter.app"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600 dark:hover:text-gray-300"
          >
            Freighter browser extension
          </a>
          . Your key never leaves your device.
        </p>
      </div>
    </main>
  );
}
