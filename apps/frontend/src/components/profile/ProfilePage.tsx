'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StreakWidget } from '@/components/ui/StreakWidget';
import { CreditCard, Star } from 'lucide-react';
import { toast } from '@/lib/toast';
import WalletSection from './WalletSection';
import ReferralSection from './ReferralSection';
import { KycVerification } from '@/components/profile/KycVerification';
import { TwoFactorAuthentication } from '@/components/profile/TwoFactorAuthentication';
import { NotificationSettings } from '@/components/profile/NotificationSettings';
import { GdprSection } from '@/components/profile/GdprSection';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useBookmarksStore } from '@/store/bookmarks.store';
import { computeAchievements } from '@/app/profile/computeAchievements';

interface User {
  id: string;
  username: string;
  email: string;
  bio: string;
  role: string;
  avatarUrl: string;
  createdAt: string;
  stellarPublicKey?: string;
  currentStreak?: number;
  longestStreak?: number;
  referralCode?: string;
  subscriptionTier?: 'free' | 'pro' | 'enterprise';
  subscriptionExpiresAt?: string;
  mfaEnabled?: boolean;
}

interface FormData {
  username: string;
  bio: string;
  avatarUrl: string;
}

export function ProfilePage() {
  const t = useTranslations('profile');
  const locale = useLocale();
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState<FormData>({ username: '', bio: '', avatarUrl: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [badges, setBadges] = useState<any[]>([]);
  const savedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { bookmarks, fetchBookmarks } = useBookmarksStore();

  const handleMfaStatusChange = useCallback((enabled: boolean) => {
    setUser((prev) => (prev ? { ...prev, mfaEnabled: enabled } : prev));
  }, []);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.get('/users/me');
        setUser(response.data);
        setForm({
          username: response.data.username,
          bio: response.data.bio ?? '',
          avatarUrl: response.data.avatarUrl ?? '',
        });
      } catch (err) {
        setError(t('loadError'));
        console.error('Failed to fetch user:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [t]);

  // Fetch badges and achievements when user changes
  useEffect(() => {
    if (!user) return;

    const creds = api.get(`/credentials/${user.id}`).then((r) => r.data).catch(() => []);
    const progress = api.get(`/users/${user.id}/progress`).then((r) => r.data).catch(() => []);
    const bst = user.stellarPublicKey
      ? api
          .get(`/stellar/balance/${user.stellarPublicKey}`)
          .then((r) => {
            const b = r.data.balances?.find((b: any) => b.asset_code === 'BST');
            return parseFloat(b?.balance ?? '0');
          })
          .catch(() => 0)
      : Promise.resolve(0);

    Promise.all([creds, progress, bst]).then(([credentials, progressRecords, bstBalance]) => {
      const credentialCount = Array.isArray(credentials) ? credentials.length : 0;
      const input = { credentialCount, bstBalance: Number(bstBalance), progressRecords };
      setBadges(computeAchievements(input));
    });
  }, [user]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current);
      }
    };
  }, []);

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!user) return;

      if (!form.username.trim()) {
        setError(t('usernameRequired'));
        return;
      }

      setSaving(true);
      setError(null);

      try {
        const { data } = await api.patch(`/users/${user.id}`, form);
        setUser({ ...user, ...data });
        setSaved(true);

        if (savedTimeoutRef.current) {
          clearTimeout(savedTimeoutRef.current);
        }

        savedTimeoutRef.current = setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError(t('saveError'));
        console.error('Failed to save profile:', err);
      } finally {
        setSaving(false);
      }
    },
    [user, form, t]
  );

  const handleFormChange = useCallback(
    (field: keyof FormData, value: string) => {
      setForm((prev: FormData) => ({ ...prev, [field]: value }));
      if (error) setError(null);
    },
    [error]
  );

  const onWalletLinked = useCallback((key: string) => {
    setUser((prev: User | null) => (prev ? { ...prev, stellarPublicKey: key } : null));
  }, []);

  const onWalletUnlinked = useCallback(() => {
    setUser((prev: User | null) => (prev ? { ...prev, stellarPublicKey: undefined } : null));
  }, []);

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-gray-100">
        <p role="status" aria-live="polite">
          {t('loading')}
        </p>
      </main>
    );
  }

  if (error && !user) {
    return (
      <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-gray-100">
        <div role="alert" className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-700 dark:text-red-300">{error}</p>
          <Button onClick={() => window.location.reload()} className="mt-4" variant="secondary">
            {t('retry')}
          </Button>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  const joinedDate = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(user.createdAt));
  const initial = user.username[0]?.toUpperCase() ?? '?';

  return (
    <ProtectedRoute>
      <main className="max-w-2xl mx-auto p-8 space-y-8">
        {/* Profile Header */}
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt={t('avatarAlt', { name: user.username })}
              width={64}
              height={64}
              className="w-16 h-16 rounded-full object-cover"
              priority
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-2xl font-bold text-blue-700 dark:text-blue-300 select-none">
              {initial}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{user.username}</h1>
              {user.role === 'instructor' && (
                <span
                  title="Verified Instructor"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                >
                  ✓ {t('verifiedInstructor', 'Verified Instructor')}
                </span>
              )}
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {user.email} · {user.role} · {t('joined', { date: joinedDate })}
            </p>
            {bookmarks.length > 0 && (
              <div className="mt-2">
                <Link href="/bookmarks" className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                  <svg className="w-4 h-4 fill-blue-500" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  {bookmarks.length} {t('bookmarkedCourses', `Bookmarked Course${bookmarks.length !== 1 ? 's' : ''}`)}
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Streak Section */}
        {user.currentStreak !== undefined && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t('myStreak', 'My Streak')}
            </h2>
            <StreakWidget currentStreak={user.currentStreak ?? 0} longestStreak={user.longestStreak ?? 0} />
          </section>
        )}

        {/* Subscription Section */}
        {user.subscriptionTier && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('subscription', 'Subscription')}</h2>
            <Card className="p-6 border-blue-100 dark:border-blue-900/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                    <CreditCard className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-gray-900 dark:text-white capitalize">
                        {user.subscriptionTier} {t('plan', 'Plan')}
                      </span>
                      {user.subscriptionTier !== 'free' && <Badge className="bg-green-500 text-white">{t('active', 'Active')}</Badge>}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {user.subscriptionTier === 'free'
                        ? t('upgradePrompt', 'Upgrade to unlock all courses')
                        : t('nextBillingDate', { date: new Date(user.subscriptionExpiresAt!).toLocaleDateString() })}
                    </p>
                  </div>
                </div>
                {user.subscriptionTier === 'free' ? (
                  <Link href="/pricing">
                    <Button size="sm" className="flex items-center space-x-2">
                      <Star className="w-4 h-4 fill-current" />
                      <span>{t('upgradNow', 'Upgrade Now')}</span>
                    </Button>
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => toast.info(t('billingComing', 'Billing portal coming soon!'))}>
                    {t('manageBilling', 'Manage Billing')}
                  </Button>
                )}
              </div>
            </Card>
          </section>
        )}

        {/* Error Banner */}
        {error && (
          <div role="alert" className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Edit Profile Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('editProfile')}</h2>

          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              {t('username')}
            </label>
            <input
              id="username"
              type="text"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.username}
              onChange={(e) => handleFormChange('username', e.target.value)}
              disabled={saving}
              required
              maxLength={50}
              aria-describedby="username-hint"
            />
            <p id="username-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('usernameHint', 'Your public display name')}
            </p>
          </div>

          <div>
            <label htmlFor="bio" className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              {t('bio')}
            </label>
            <textarea
              id="bio"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              value={form.bio}
              onChange={(e) => handleFormChange('bio', e.target.value)}
              disabled={saving}
              maxLength={500}
              aria-describedby="bio-hint"
            />
            <p id="bio-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('bioHint', { count: form.bio.length }, `${form.bio.length}/500`)}
            </p>
          </div>

          <div>
            <label htmlFor="avatarUrl" className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              {t('avatarUrl')}
            </label>
            <input
              id="avatarUrl"
              type="url"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.avatarUrl}
              onChange={(e) => handleFormChange('avatarUrl', e.target.value)}
              disabled={saving}
              placeholder="https://example.com/avatar.jpg"
              aria-describedby="avatar-hint"
            />
            <p id="avatar-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('avatarUrlHint', 'Public URL to your avatar image')}
            </p>
          </div>

          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {saved ? t('saved') : ''}
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? t('saving') : saved ? t('saved') : t('saveChanges')}
          </Button>
        </form>

        {/* Two-Factor Authentication */}
        <TwoFactorAuthentication mfaEnabled={user.mfaEnabled ?? false} onStatusChange={handleMfaStatusChange} />

        {/* Wallet Section */}
        <WalletSection userId={user.id} stellarPublicKey={user.stellarPublicKey} onLinked={onWalletLinked} onUnlinked={onWalletUnlinked} />

        {/* Referral Section */}
        {user.referralCode && <ReferralSection userId={user.id} referralCode={user.referralCode} />}

        {/* KYC Verification */}
        <KycVerification stellarPublicKey={user.stellarPublicKey} />

        {/* Achievements Section */}
        {badges.length > 0 && <AchievementsSection badges={badges} />}

        {/* Notification Settings */}
        <NotificationSettings />

        {/* GDPR Section */}
        <GdprSection userId={user.id} />
      </main>
    </ProtectedRoute>
  );
}

interface AchievementsSectionProps {
  badges: any[];
}

function AchievementsSection({ badges }: AchievementsSectionProps) {
  const t = useTranslations('profile');

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('achievements', 'Achievements')}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {badges.map((badge, idx) => (
          <div key={idx} className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-2xl">{badge.icon || '🏆'}</div>
            <span className="text-sm font-medium text-center text-gray-900 dark:text-gray-100">{badge.title}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
