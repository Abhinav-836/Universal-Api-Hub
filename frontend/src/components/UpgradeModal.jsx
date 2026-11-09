// frontend/src/components/UpgradeModal.jsx
// One upgrade window for the dashboard and the APIs page. Prices and the
// payment mode come from the server (/api/user/plans), so they are never
// hard-coded here.
import React, { useEffect, useState } from 'react';
import { Crown, X, ShieldCheck } from 'lucide-react';
import { planService } from '../services/auth';

const STYLE = {
  pro: { label: 'Pro', color: 'from-brand-600 to-indigo-600' },
  premium: { label: 'Premium', color: 'from-purple-600 to-pink-600' },
};

export default function UpgradeModal({ plan, onClose, onUpgrade, busy }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    planService
      .getCurrentPlan()
      .then((d) => !cancelled && setInfo(d))
      .catch(() => !cancelled && setInfo({ payments: 'off', plans: [] }));
    return () => { cancelled = true; };
  }, []);

  const mode = info?.payments; // 'razorpay' | 'beta' | 'off'
  const opts = (info?.plans || [])
    .filter((p) => (p.key === 'pro' || p.key === 'premium') && p.key !== plan && !(plan === 'premium' && p.key === 'pro'))
    .map((p) => ({ ...p, ...STYLE[p.key] }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true" aria-label="Upgrade your plan">
      <div className="w-full max-w-md card-glass rounded-2xl p-6 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-white">Upgrade your plan</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {!info ? (
          <div className="space-y-3">
            {[0, 1].map((i) => <div key={i} className="h-[72px] rounded-xl bg-white/5 animate-pulse" />)}
          </div>
        ) : mode === 'off' ? (
          <p className="text-sm text-slate-400">Paid plans aren&rsquo;t available yet. Check back soon.</p>
        ) : (
          <>
            <p className="text-xs text-slate-400 mb-4">
              {mode === 'beta' ? '✨ All plans are free during the beta.' : info.upgradeMessage}
            </p>
            <div className="space-y-3">
              {opts.map((o) => (
                <div key={o.key} className="rounded-xl p-4 border border-white/10 hover:border-brand-500/30 flex items-center justify-between gap-3 transition-all">
                  <div>
                    <p className="font-bold text-white">{o.label}</p>
                    <p className="text-xs text-slate-400">
                      {mode === 'beta' ? 'Free beta' : `₹${o.priceInr} / ${o.days} days`} · {o.dailyLimit} req/day, {o.apiSlots === 'All' ? 'all' : o.apiSlots} APIs
                    </p>
                  </div>
                  <button
                    onClick={() => onUpgrade(o.key)}
                    disabled={!!busy}
                    className={`shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r ${o.color} text-white text-sm font-semibold hover:opacity-90 flex items-center gap-1.5 disabled:opacity-60`}
                  >
                    <Crown size={13} /> {busy === o.key ? 'Working…' : mode === 'beta' ? 'Select' : `Pay ₹${o.priceInr}`}
                  </button>
                </div>
              ))}
            </div>
            {mode === 'razorpay' && (
              <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
                <ShieldCheck size={13} /> Secure payment by Razorpay · UPI, cards, netbanking · no auto-renewal
              </p>
            )}
            {mode === 'razorpay' && (
              <p className="mt-2 text-center text-[11px] text-slate-500">
                By paying you agree to the <a href="/terms" className="underline">Terms</a> and{' '}
                <a href="/refunds" className="underline">Refund policy</a>.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
