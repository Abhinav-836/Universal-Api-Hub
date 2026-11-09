// frontend/src/components/dashboard/WalletCard.jsx
// Prepaid AI credits: balance, adding credits through Razorpay, and the
// latest top-ups and AI charges.
import React, { useCallback, useEffect, useState } from 'react';
import { Wallet, Plus, Sparkles, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { walletService } from '../../services/auth';

const inr = (paise) =>
  `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const when = (d) =>
  new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function WalletCard({ onToast }) {
  const [w, setW] = useState(null);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setW(await walletService.get());
    } catch {
      setW({ error: true });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pay = async (rupees) => {
    const value = Number(rupees);
    if (!Number.isInteger(value) || value < (w?.topup?.minInr || 50) || value > (w?.topup?.maxInr || 10000)) {
      onToast?.(`Enter a whole amount between ₹${w?.topup?.minInr || 50} and ₹${(w?.topup?.maxInr || 10000).toLocaleString('en-IN')}.`, 'error');
      return;
    }
    setBusy(true);
    try {
      const r = await walletService.topup(value);
      onToast?.(`₹${value} added. Balance: ${inr(r.balancePaise)}.`);
      setAdding(false);
      setAmount('');
      await load();
    } catch (err) {
      if (err?.cancelled) onToast?.('Payment cancelled — you were not charged.', 'warning');
      else onToast?.(err.response?.data?.error || err.message || 'Could not add credits.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!w) return <div className="card-glass rounded-2xl p-5 h-[132px] animate-pulse" />;
  if (w.error) return null;

  const low = w.balancePaise < w.minBalancePaise;
  const tx = showAll ? w.transactions : w.transactions.slice(0, 4);

  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
            <Wallet size={18} />
          </span>
          <div>
            <h2 className="font-display font-semibold text-white text-sm">AI credits</h2>
            <p className="font-display text-2xl font-bold text-white">{inr(w.balancePaise)}</p>
          </div>
        </div>
        {w.payments === 'razorpay' && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold hover:opacity-90"
          >
            <Plus size={14} /> Add credits
          </button>
        )}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-400">
        <Sparkles size={13} className="mt-0.5 shrink-0 text-brand-300" />
        {low
          ? `Paid AI models (Pro/Premium) switch on once you have at least ${inr(w.minBalancePaise)} in credits. Until then, AI endpoints use free models.`
          : 'Paid AI models are on. Each paid call is charged here: the model\'s cost plus a small service fee. Free models cost nothing.'}
      </p>

      {adding && (
        <div className="mt-4 rounded-xl border border-white/10 p-4">
          <p className="text-xs text-slate-400 mb-3">Choose an amount. Credits don&rsquo;t expire.</p>
          <div className="flex flex-wrap gap-2">
            {w.topup.presetsInr.map((v) => (
              <button
                key={v}
                onClick={() => pay(v)}
                disabled={busy}
                className="px-3.5 py-2 rounded-lg border border-white/10 text-sm text-white hover:border-emerald-400/50 disabled:opacity-50"
              >
                ₹{v.toLocaleString('en-IN')}
              </button>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); pay(amount); }}
          >
            <label htmlFor="topup-amount" className="sr-only">Other amount in rupees</label>
            <input
              id="topup-amount"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
              placeholder={`Other amount (₹${w.topup.minInr}–${w.topup.maxInr.toLocaleString('en-IN')})`}
              className="input-base flex-1 !py-2 text-sm"
            />
            <button type="submit" disabled={busy || !amount} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">
              {busy ? 'Working…' : 'Pay'}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
          </form>
          <p className="mt-2 text-[11px] text-slate-500">
            Paid securely with Razorpay. See the <a href="/refunds" className="underline">refund policy</a>.
          </p>
        </div>
      )}

      {w.transactions.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Recent</h3>
          <ul className="divide-y divide-white/5">
            {tx.map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-slate-300">
                  {t.amount_paise > 0 ? <ArrowDownLeft size={13} className="text-emerald-400 shrink-0" /> : <ArrowUpRight size={13} className="text-slate-500 shrink-0" />}
                  <span className="truncate">
                    {t.kind === 'topup' ? 'Added credits' : t.kind === 'refund' ? 'Refund' : `${t.ref || 'AI call'}${t.model ? ` · ${t.model}` : ''}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-slate-500 hidden sm:inline">{when(t.created_at)}</span>
                  <span className={`font-mono ${t.amount_paise > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {t.amount_paise > 0 ? '+' : '−'}{inr(Math.abs(t.amount_paise))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {w.transactions.length > 4 && (
            <button onClick={() => setShowAll((v) => !v)} className="mt-1 text-xs text-brand-400 hover:text-brand-300">
              {showAll ? 'Show less' : `Show all ${w.transactions.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
