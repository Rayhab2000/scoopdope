'use client';

import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import Link from 'next/link';

export default function OfflinePage() {
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setReconnecting(true);
      window.location.reload();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center space-y-6">
      <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
        <WifiOff className="w-10 h-10 text-gray-400" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">You are offline</h1>
        <p className="text-gray-500 dark:text-gray-400 max-w-md">
          It looks like you've lost your internet connection. Don't worry, you can still access previously viewed courses.
        </p>
      </div>
      {reconnecting ? (
        <p className="text-blue-500 font-medium">Reconnecting...</p>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-6 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
