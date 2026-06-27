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

function CheckIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 ${active ? 'text-green-500' : 'text-gray-400 dark:text-gray-500'}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="3"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

const schema = z
  .object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const passwordValue = watch('password', '');

  const rules = {
    length: passwordValue.length >= 8,
    uppercase: /[A-Z]/.test(passwordValue),
    number: /[0-9]/.test(passwordValue),
    symbol: /[^A-Za-z0-9]/.test(passwordValue),
  };
  const rulesPassed = Object.values(rules).filter(Boolean).length;
  
  const widthClasses = ['w-0', 'w-1/4', 'w-1/2', 'w-3/4', 'w-full'];
  const progressWidth = widthClasses[rulesPassed];
  
  let strength = 'Weak';
  let strengthColor = 'bg-red-500';
  let strengthTextColor = 'text-red-600 dark:text-red-400';
  
  if (rulesPassed === 4) {
    strength = 'Strong';
    strengthColor = 'bg-green-500';
    strengthTextColor = 'text-green-600 dark:text-green-400';
  } else if (rulesPassed >= 2) {
    strength = 'Fair';
    strengthColor = 'bg-yellow-500';
    strengthTextColor = 'text-yellow-600 dark:text-yellow-400';
  }

  if (passwordValue.length === 0) {
    strength = '';
  }

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const res = await api.post<{ access_token: string; user: any }>('/auth/register', {
        email: data.email,
        password: data.password,
      });
      localStorage.setItem('access_token', res.data.access_token);
      login(res.data.access_token, res.data.user);
      setIsLoading(false);
      router.push('/dashboard');
    } catch (error) {
      setIsLoading(false);
      // Let any global interceptors handle error toast if needed
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow p-8 flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create an account</h1>

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
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />

          <div className="flex flex-col gap-2 -mt-2 mb-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Password strength
              </span>
              <span className={`text-xs font-bold ${strengthTextColor}`}>
                {strength}
              </span>
            </div>
            <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full ${progressWidth} ${strengthColor} transition-all duration-300`} />
            </div>
            <div className="grid grid-cols-2 gap-1 mt-1 text-xs text-gray-600 dark:text-gray-400">
              <div className={`flex items-center gap-1.5 ${rules.length ? 'text-green-600 dark:text-green-400' : ''}`}>
                <CheckIcon active={rules.length} /> 8+ characters
              </div>
              <div className={`flex items-center gap-1.5 ${rules.uppercase ? 'text-green-600 dark:text-green-400' : ''}`}>
                <CheckIcon active={rules.uppercase} /> Uppercase letter
              </div>
              <div className={`flex items-center gap-1.5 ${rules.number ? 'text-green-600 dark:text-green-400' : ''}`}>
                <CheckIcon active={rules.number} /> Number
              </div>
              <div className={`flex items-center gap-1.5 ${rules.symbol ? 'text-green-600 dark:text-green-400' : ''}`}>
                <CheckIcon active={rules.symbol} /> Special symbol
              </div>
            </div>
          </div>

          <Input
            label="Confirm Password"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <Button type="submit" disabled={isLoading} className="w-full mt-2">
            {isLoading ? (
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
                Creating account…
              </span>
            ) : (
              'Register'
            )}
          </Button>
        </form>

        <div className="relative flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
        </div>

        <a
          href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/auth/google`}
          className="flex items-center justify-center gap-3 w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          aria-label="Continue with Google"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
            <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332Z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58Z"/>
          </svg>
          Continue with Google
        </a>

        <p className="text-sm text-center text-gray-600 dark:text-gray-400">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-blue-600 hover:underline dark:text-blue-400">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
