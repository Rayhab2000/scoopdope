'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface Transaction {
  id: string;
  hash: string;
  createdAt: string;
  operationCount: number;
  successful: boolean;
  memo?: string;
  feeCharged: string;
}

interface Props {
  publicKey: string;
}

const EXPLORER_BASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
    ? 'https://stellar.expert/explorer/public/tx'
    : 'https://stellar.expert/explorer/testnet/tx';

export default function TransactionList({ publicKey }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    api
      .get<Transaction[]>(`/stellar/transactions/${publicKey}?limit=10`)
      .then((r) => setTransactions(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [publicKey]);

  if (loading) {
    return (
      <div className="space-y-2 mt-4" aria-busy="true" aria-label="Loading transactions">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-500 mt-4" role="alert">
        Failed to load transactions.
      </p>
    );
  }

  if (transactions.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">No transactions found.</p>
    );
  }

  return (
    <div className="mt-4 space-y-2" aria-label="Recent transactions">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        Recent Transactions
      </h3>
      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {transactions.map((tx) => (
          <li key={tx.id} className="py-2 flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <a
                href={`${EXPLORER_BASE}/${tx.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-blue-600 dark:text-blue-400 hover:underline truncate block"
                title={tx.hash}
              >
                {tx.hash.slice(0, 8)}…{tx.hash.slice(-8)}
              </a>
              <span className="text-gray-500 dark:text-gray-400">
                {new Date(tx.createdAt).toLocaleString()} · {tx.operationCount} op
                {tx.operationCount !== 1 ? 's' : ''}
              </span>
            </div>
            <span
              className={`shrink-0 font-medium ${
                tx.successful
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-500 dark:text-red-400'
              }`}
            >
              {tx.successful ? '✓' : '✗'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
