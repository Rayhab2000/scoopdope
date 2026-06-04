'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface LoginResponse {
  access_token?: string;
  refresh_token?: string;
  mfa_required?: boolean;
}

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [apiError, setApiError] = useState<string | null>(null);
  const [awaitingMfa, setAwaitingMfa] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null);
  const [mfaToken, setMfaToken] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setApiError(null);

    try {
      if (!awaitingMfa) {
        const res = await api.post<LoginResponse>('/auth/login', {
          email: data.email,
          password: data.password,
        });

        if (res.data.mfa_required) {
          setAwaitingMfa(true);
          setPendingCredentials({ email: data.email, password: data.password });
          return;
        }

        if (!res.data.access_token) {
          throw new Error('Unexpected response from server');
        }

        localStorage.setItem('access_token', res.data.access_token);
        const profileResponse = await api.get('/users/me');
        login(res.data.access_token, profileResponse.data);
        router.push('/dashboard');
        return;
      }

      if (!pendingCredentials) {
        throw new Error('Please retry login from the beginning.');
      }

      const res = await api.post<LoginResponse>('/auth/login', {
        email: pendingCredentials.email,
        password: pendingCredentials.password,
        mfa_token: mfaToken,
      });

      if (!res.data.access_token) {
        throw new Error('Invalid MFA token');
      }

      localStorage.setItem('access_token', res.data.access_token);
      const profileResponse = await api.get('/users/me');
      login(res.data.access_token, profileResponse.data);
      router.push('/dashboard');
    } catch (err: any) {
      const message = err?.response?.data?.message ?? err?.message;
      setApiError(typeof message === 'string' ? message : 'Invalid credentials');
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow p-8 flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sign in</h1>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
            disabled={awaitingMfa}
          />

          {awaitingMfa && (
            <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-200">
              <p className="font-medium">Two-factor authentication required</p>
              <p>Enter the code from your authenticator app or a backup recovery code to continue.</p>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">MFA Code</label>
              <input
                type="text"
                value={mfaToken}
                onChange={(e) => setMfaToken(e.target.value.trim())}
                placeholder="123456"
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => {
                  setAwaitingMfa(false);
                  setPendingCredentials(null);
                  setMfaToken('');
                }}
                className="text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                Change login details
              </button>
            </div>
          )}

          {apiError && <p className="text-sm text-red-600 dark:text-red-400">{apiError}</p>}

          <div className="text-right -mt-2">
            <Link
              href="/auth/forgot-password"
              className="text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              Forgot password?
            </Link>
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full mt-2">
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Signing in…
              </span>
            ) : (
              awaitingMfa ? 'Verify code' : 'Sign in'
            )}
          </Button>
        </form>

        <Link
          href="/auth/stellar"
          className="flex items-center justify-center gap-2 w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          Sign in with Stellar Wallet
        </Link>

        <p className="text-sm text-center text-gray-600 dark:text-gray-400">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="text-blue-600 hover:underline dark:text-blue-400">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}
