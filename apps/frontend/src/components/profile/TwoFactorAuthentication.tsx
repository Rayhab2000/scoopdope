'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface TwoFactorAuthenticationProps {
  mfaEnabled: boolean;
  onStatusChange: (enabled: boolean) => void;
}

export function TwoFactorAuthentication({ mfaEnabled, onStatusChange }: TwoFactorAuthenticationProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [currentAction, setCurrentAction] = useState<'idle' | 'setup' | 'disable' | 'regenerate'>('idle');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mfaEnabled) {
      setQrCodeDataUrl(null);
      setBackupCodes(null);
      setTotpCode('');
      setCurrentAction('idle');
      setMessage(null);
      setError(null);
    }
  }, [mfaEnabled]);

  const handleEnable = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await api.post('/auth/mfa/enable');
      setQrCodeDataUrl(response.data.qrCodeDataUrl);
      setCurrentAction('setup');
      setMessage('Scan the QR code with your authenticator app and enter the code below.');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to start 2FA setup.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!totpCode) {
      setError('Enter the code from your authenticator app.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await api.post('/auth/mfa/verify', { code: totpCode });
      setBackupCodes(response.data.backupCodes || []);
      setCurrentAction('idle');
      setTotpCode('');
      setMessage('Two-factor authentication enabled. Store these backup codes somewhere safe.');
      onStatusChange(true);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    if (!totpCode) {
      setError('Enter your current MFA code to disable 2FA.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await api.post('/auth/mfa/disable', { code: totpCode });
      setCurrentAction('idle');
      setTotpCode('');
      setBackupCodes(null);
      setMessage('Two-factor authentication has been disabled.');
      onStatusChange(false);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to disable 2FA.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateBackupCodes = async () => {
    if (!totpCode) {
      setError('Enter your current MFA code to regenerate backup codes.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await api.post('/auth/mfa/backup-codes/regenerate', { code: totpCode });
      setBackupCodes(response.data.backupCodes || []);
      setCurrentAction('idle');
      setTotpCode('');
      setMessage('New backup codes have been generated. Store them securely.');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to regenerate backup codes.');
    } finally {
      setLoading(false);
    }
  };

  const actionLabel = () => {
    if (currentAction === 'setup') return 'Verify setup';
    if (currentAction === 'disable') return 'Disable 2FA';
    if (currentAction === 'regenerate') return 'Regenerate codes';
    return mfaEnabled ? 'Regenerate backup codes' : 'Enable 2FA';
  };

  return (
    <div className="space-y-6 bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Two-Factor Authentication</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Protect your account with TOTP codes from Google Authenticator, Authy, or a similar app.
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
            mfaEnabled ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200'
          }`}
        >
          {mfaEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          {message}
        </div>
      )}

      {qrCodeDataUrl && currentAction === 'setup' ? (
        <div className="space-y-4 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4">
          <div className="grid gap-4 md:grid-cols-[180px,1fr] items-center">
            <img src={qrCodeDataUrl} alt="MFA QR code" className="w-full max-w-xs rounded-xl border border-gray-200 dark:border-gray-700" />
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <p>Scan this QR code with your authenticator app.</p>
              <p>Then enter the 6-digit code below to complete setup.</p>
            </div>
          </div>
        </div>
      ) : null}

      {(currentAction === 'setup' || mfaEnabled) && (
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Verification code
          </label>
          <input
            type="text"
            value={totpCode}
            onChange={(event) => setTotpCode(event.target.value.replace(/\s+/g, ''))}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="123456"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            disabled={loading}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {!mfaEnabled && currentAction !== 'setup' ? (
          <Button onClick={handleEnable} disabled={loading} className="w-full md:w-auto">
            {loading ? 'Starting setup…' : 'Enable 2FA'}
          </Button>
        ) : null}

        {currentAction === 'setup' ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between w-full">
            <Button onClick={handleVerify} disabled={loading} className="w-full md:w-auto">
              {loading ? 'Verifying…' : 'Verify code'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setQrCodeDataUrl(null);
                setCurrentAction('idle');
                setTotpCode('');
              }}
              disabled={loading}
              className="w-full md:w-auto"
            >
              Cancel setup
            </Button>
          </div>
        ) : mfaEnabled ? (
          <div className="space-y-3 md:flex md:items-center md:gap-3 md:space-y-0 w-full">
            <Button
              onClick={() => setCurrentAction('disable')}
              disabled={loading}
              className="w-full md:w-auto"
            >
              Disable 2FA
            </Button>
            <Button
              variant="secondary"
              onClick={() => setCurrentAction('regenerate')}
              disabled={loading}
              className="w-full md:w-auto"
            >
              Regenerate backup codes
            </Button>
            {currentAction === 'disable' && (
              <Button onClick={handleDisable} disabled={loading} className="w-full md:w-auto">
                {loading ? 'Disabling…' : 'Confirm disable'}
              </Button>
            )}
            {currentAction === 'regenerate' && (
              <Button onClick={handleRegenerateBackupCodes} disabled={loading} className="w-full md:w-auto">
                {loading ? 'Regenerating…' : 'Generate codes'}
              </Button>
            )}
          </div>
        ) : null}

        {currentAction !== 'setup' && mfaEnabled && (currentAction === 'disable' || currentAction === 'regenerate') ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter a current code from your authenticator app or a backup recovery code.
          </p>
        ) : null}
      </div>

      {backupCodes && backupCodes.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
          <p className="font-semibold">Recovery codes</p>
          <p className="mb-3 text-xs text-blue-700 dark:text-blue-200">Store these one-time backup codes in a secure place. Each code can be used once.</p>
          <ul className="space-y-2">
            {backupCodes.map((code) => (
              <li key={code} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                {code}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
