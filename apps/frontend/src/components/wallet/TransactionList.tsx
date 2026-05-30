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
  memoType?: string;
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
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="pb-1 pr-3 font-medium">Hash</th>
              <th className="pb-1 pr-3 font-medium">Date</th>
              <th className="pb-1 pr-3 font-medium">Memo</th>
              <th className="pb-1 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {transactions.map((tx) => (
              <tr key={tx.id} className="py-2">
                <td className="py-2 pr-3">
                  <a
                    href={`${EXPLORER_BASE}/${tx.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-blue-600 dark:text-blue-400 hover:underline"
                    title={tx.hash}
                  >
                    {tx.hash.slice(0, 8)}…{tx.hash.slice(-8)}
                  </a>
                </td>
                <td className="py-2 pr-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {new Date(tx.createdAt).toLocaleString()}
                </td>
                <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
                  {tx.memo && tx.memoType && tx.memoType !== 'none' ? (
                    <span title={tx.memo}>{tx.memo}</span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-600">—</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <span
                    className={
                      tx.successful
                        ? 'text-green-600 dark:text-green-400 font-medium'
                        : 'text-red-500 dark:text-red-400 font-medium'
                    }
                  >
                    {tx.successful ? '✓' : '✗'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
