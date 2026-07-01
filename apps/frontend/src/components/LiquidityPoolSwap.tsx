'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface PoolStats {
  reserveA: string;
  reserveB: string;
  totalLiquidity: string;
}

interface QuoteResult {
  estimatedOutput: string;
  priceImpact: number; // percentage
  exchangeRate: number;
}

interface LiquidityPoolSwapProps {
  poolStats?: PoolStats;
  onSwap?: (tokenIn: 'bst' | 'xlm', amountIn: string, minOut: string) => Promise<string>;
  onAddLiquidity?: (amountA: string, amountB: string) => Promise<void>;
  onRemoveLiquidity?: (shares: string) => Promise<void>;
  walletConnected?: boolean;
  priceImpactWarningThreshold?: number; // percentage, default 1%
  priceImpactHighThreshold?: number; // percentage, default 5%
}

type Tab = 'swap' | 'add' | 'remove';

const DEFAULT_PRICE_IMPACT_WARNING = 1;
const DEFAULT_PRICE_IMPACT_HIGH = 5;

export default function LiquidityPoolSwap({
  poolStats,
  onSwap,
  onAddLiquidity,
  onRemoveLiquidity,
  walletConnected = false,
  priceImpactWarningThreshold = DEFAULT_PRICE_IMPACT_WARNING,
  priceImpactHighThreshold = DEFAULT_PRICE_IMPACT_HIGH,
}: LiquidityPoolSwapProps) {
  const [tab, setTab]           = useState<Tab>('swap');
  const [tokenIn, setTokenIn]   = useState<'bst' | 'xlm'>('bst');
  const [amountIn, setAmountIn] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [amountA, setAmountA]   = useState('');
  const [amountB, setAmountB]   = useState('');
  const [shares, setShares]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  
  // Quote-related state
  const [quote, setQuote]           = useState<QuoteResult | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  /**
   * Simulates calling the liquidity pool contract's quote function
   * In production, this would call the actual Soroban contract
   */
  const getQuote = useCallback(async (amount: string, token: 'bst' | 'xlm'): Promise<QuoteResult | null> => {
    if (!poolStats || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return null;
    }

    const rIn  = token === 'bst' ? Number(poolStats.reserveA) : Number(poolStats.reserveB);
    const rOut = token === 'bst' ? Number(poolStats.reserveB) : Number(poolStats.reserveA);
    
    if (rIn <= 0 || rOut <= 0) return null;

    const FEE = 0.003; // 0.3% protocol fee
    const amountInWithFee = Number(amount) * (1 - FEE);
    const estimatedOutput = (rOut * amountInWithFee) / (rIn + amountInWithFee);
    
    // Calculate spot price (no fee) for price impact comparison
    const spotPrice = rOut / rIn;
    const executionPrice = estimatedOutput / Number(amount);
    
    // Price impact = (1 - executionPrice / spotPrice) * 100
    const priceImpact = ((1 - executionPrice / spotPrice) * 100);
    
    return {
      estimatedOutput: estimatedOutput.toFixed(6),
      priceImpact: Math.max(0, priceImpact), // Ensure non-negative
      exchangeRate: executionPrice,
    };
  }, [poolStats]);

  /**
   * Debounced quote fetching on input change
   */
  useEffect(() => {
    if (tab !== 'swap') return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (!amountIn || Number(amountIn) <= 0) {
      setQuote(null);
      setQuoteLoading(false);
      return;
    }

    setQuoteLoading(true);

    debounceTimer.current = setTimeout(async () => {
      const result = await getQuote(amountIn, tokenIn);
      setQuote(result);
      setQuoteLoading(false);
    }, 400); // 400ms debounce

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [amountIn, tokenIn, tab, getQuote]);

  const minOut = useCallback(() => {
    if (!quote) return '0';
    return (Number(quote.estimatedOutput) * (1 - Number(slippage) / 100)).toFixed(6);
  }, [quote, slippage]);

  const isHighPriceImpact = quote && quote.priceImpact > priceImpactHighThreshold;
  const isWarnPriceImpact = quote && quote.priceImpact > priceImpactWarningThreshold;

  const handleSwap = async () => {
    if (!onSwap || !amountIn || !quote) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const out = await onSwap(tokenIn, amountIn, minOut());
      setResult(`Swapped → ${out} ${tokenIn === 'bst' ? 'XLM' : 'BST'}`);
      setAmountIn('');
      setQuote(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Swap failed');
    } finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!onAddLiquidity || !amountA || !amountB) return;
    setLoading(true); setError(null); setResult(null);
    try {
      await onAddLiquidity(amountA, amountB);
      setResult('Liquidity added successfully');
      setAmountA(''); setAmountB('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add liquidity failed');
    } finally { setLoading(false); }
  };

  const handleRemove = async () => {
    if (!onRemoveLiquidity || !shares) return;
    setLoading(true); setError(null); setResult(null);
    try {
      await onRemoveLiquidity(shares);
      setResult('Liquidity removed successfully');
      setShares('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove liquidity failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] p-6 max-w-md w-full shadow-2xl">
      {/* Pool stats */}
      {poolStats && (
        <div className="mb-5 grid grid-cols-3 gap-3 text-center text-xs">
          {[
            { label: 'BST Reserve', value: poolStats.reserveA },
            { label: 'XLM Reserve', value: poolStats.reserveB },
            { label: 'LP Tokens',   value: poolStats.totalLiquidity },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl bg-white/5 border border-white/10 p-3">
              <p className="text-white/40 uppercase tracking-widest mb-1">{label}</p>
              <p className="text-white font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" className="flex rounded-xl bg-white/10 p-1 gap-1 mb-5">
        {(['swap', 'add', 'remove'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setError(null); setResult(null); }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold capitalize transition-all ${tab === t ? 'bg-indigo-600 text-white shadow' : 'text-white/50 hover:text-white/80'}`}>
            {t === 'add' ? 'Add Liquidity' : t === 'remove' ? 'Remove' : 'Swap'}
          </button>
        ))}
      </div>

      {/* Swap tab */}
      {tab === 'swap' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <select value={tokenIn} onChange={(e) => setTokenIn(e.target.value as 'bst' | 'xlm')}
              className="rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2 focus:outline-none">
              <option value="bst">BST → XLM</option>
              <option value="xlm">XLM → BST</option>
            </select>
            <input type="number" min="0" placeholder="Amount in" value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
              className="flex-1 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm px-3 py-2 focus:outline-none focus:border-indigo-400" />
          </div>

          {/* Quote Summary Panel */}
          {quote && (
            <div className={`rounded-xl p-4 border transition-all ${
              isHighPriceImpact 
                ? 'bg-red-500/10 border-red-500/30' 
                : isWarnPriceImpact
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : 'bg-white/5 border-white/10'
            }`}>
              <div className="space-y-3">
                {/* Estimated Output */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60">Estimated Output</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-emerald-400 font-semibold">{quote.estimatedOutput}</span>
                    <span className="text-xs text-white/50">{tokenIn === 'bst' ? 'XLM' : 'BST'}</span>
                  </div>
                </div>

                {/* Exchange Rate */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60">Exchange Rate</span>
                  <span className={`text-sm font-medium ${isHighPriceImpact ? 'text-red-300' : isWarnPriceImpact ? 'text-yellow-300' : 'text-white'}`}>
                    1 {tokenIn === 'bst' ? 'BST' : 'XLM'} = {quote.exchangeRate.toFixed(8)} {tokenIn === 'bst' ? 'XLM' : 'BST'}
                  </span>
                </div>

                {/* Price Impact */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60">Price Impact</span>
                  <span className={`text-sm font-bold ${
                    isHighPriceImpact
                      ? 'text-red-400'
                      : isWarnPriceImpact
                        ? 'text-yellow-400'
                        : 'text-emerald-400'
                  }`}>
                    {quote.priceImpact.toFixed(3)}%
                  </span>
                </div>

                {/* Minimum Received */}
                <div className="flex justify-between items-center pt-2 border-t border-white/10">
                  <span className="text-xs text-white/60">Min. Received ({slippage}%)</span>
                  <span className="text-sm text-white/80 font-medium">{minOut()}</span>
                </div>
              </div>
            </div>
          )}

          {quoteLoading && amountIn && (
            <div className="rounded-xl p-4 bg-white/5 border border-white/10 text-center">
              <span className="text-xs text-white/50">Fetching quote...</span>
            </div>
          )}

          {/* Slippage Settings */}
          <div className="flex items-center gap-2 text-xs text-white/50">
            <span>Slippage</span>
            {['0.1', '0.5', '1.0'].map((s) => (
              <button key={s} onClick={() => setSlippage(s)}
                className={`px-2 py-1 rounded-lg border text-xs transition-all ${slippage === s ? 'border-indigo-400 text-indigo-400' : 'border-white/20 hover:border-white/40'}`}>
                {s}%
              </button>
            ))}
          </div>

          {/* High Impact Warning */}
          {isHighPriceImpact && (
            <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/30">
              <p className="text-xs text-red-300 font-medium">
                ⚠️ High Price Impact ({quote.priceImpact.toFixed(2)}% &gt; {priceImpactHighThreshold}%)
              </p>
              <p className="text-xs text-red-300/70 mt-1">
                This swap will execute at an unfavorable rate. Consider reducing the amount or checking the exchange rate.
              </p>
            </div>
          )}

          {/* Moderate Impact Warning */}
          {isWarnPriceImpact && !isHighPriceImpact && (
            <div className="rounded-xl p-3 bg-yellow-500/10 border border-yellow-500/30">
              <p className="text-xs text-yellow-300 font-medium">
                ⚠️ Price Impact &gt; {priceImpactWarningThreshold}%
              </p>
              <p className="text-xs text-yellow-300/70 mt-1">
                Review the rate before confirming.
              </p>
            </div>
          )}

          <button onClick={handleSwap} disabled={loading || !walletConnected || !amountIn || !quote || isHighPriceImpact}
            className={`w-full rounded-xl py-3 text-sm font-bold text-white transition-all ${
              isHighPriceImpact
                ? 'bg-red-600/50 cursor-not-allowed opacity-50'
                : 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}>
            {!walletConnected ? 'Connect Wallet' : isHighPriceImpact ? 'Price Impact Too High' : loading ? 'Swapping…' : quote ? 'Swap' : 'Enter Amount'}
          </button>
        </div>
      )}

      {/* Add liquidity tab */}
      {tab === 'add' && (
        <div className="space-y-4">
          <input type="number" min="0" placeholder="BST amount" value={amountA} onChange={(e) => setAmountA(e.target.value)}
            className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm px-3 py-2 focus:outline-none focus:border-emerald-400" />
          <input type="number" min="0" placeholder="XLM amount" value={amountB} onChange={(e) => setAmountB(e.target.value)}
            className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm px-3 py-2 focus:outline-none focus:border-emerald-400" />
          <button onClick={handleAdd} disabled={loading || !walletConnected || !amountA || !amountB}
            className="w-full rounded-xl py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            {loading ? 'Adding…' : 'Add Liquidity'}
          </button>
        </div>
      )}

      {/* Remove liquidity tab */}
      {tab === 'remove' && (
        <div className="space-y-4">
          <input type="number" min="0" placeholder="LP token shares to burn" value={shares} onChange={(e) => setShares(e.target.value)}
            className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm px-3 py-2 focus:outline-none focus:border-rose-400" />
          <button onClick={handleRemove} disabled={loading || !walletConnected || !shares}
            className="w-full rounded-xl py-3 text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            {loading ? 'Removing…' : 'Remove Liquidity'}
          </button>
        </div>
      )}

      {result && <p role="status" className="mt-3 text-xs text-emerald-400 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-2">{result}</p>}
      {error  && <p role="alert"  className="mt-3 text-xs text-rose-400 rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2">⚠ {error}</p>}
    </div>
  );
}
