import React from 'react';
import { Activity, Layers, Key, TrendingDown } from 'lucide-react';

export default function StatsCards({ stats = {} }) {
  const {
    dailyUsed = 0,
    dailyLimit = 10,
    activeApis = 0,
    apiKeysCount = 0,
  } = stats;

  const remaining = Math.max(dailyLimit - dailyUsed, 0);
  const pct = Math.min((dailyUsed / dailyLimit) * 100, 100);
  const usageColor = pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-brand-400';

  const cards = [
    {
      label: 'Requests Today',
      value: `${dailyUsed} / ${dailyLimit}`,
      icon: Activity,
      sub: `${Math.round(pct)}% of daily limit`,
      color: 'text-brand-400', bg: 'bg-brand-500/10',
      extra: (
        <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      ),
    },
    {
      label: 'Remaining',
      value: remaining,
      icon: TrendingDown,
      sub: 'requests left today',
      color: remaining === 0 ? 'text-red-400' : 'text-emerald-400',
      bg: remaining === 0 ? 'bg-red-500/10' : 'bg-emerald-500/10',
    },
    {
      label: 'Active APIs',
      value: activeApis,
      icon: Layers,
      sub: 'selected & accessible',
      color: 'text-violet-400', bg: 'bg-violet-500/10',
    },
    {
      label: 'API Keys',
      value: apiKeysCount,
      icon: Key,
      sub: 'active keys',
      color: 'text-cyan-400', bg: 'bg-cyan-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="stat-card">
          <div className="flex items-start justify-between mb-3">
            <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center`}>
              <c.icon size={17} className={c.color} />
            </div>
          </div>
          <p className="text-2xl font-display font-bold text-white mb-0.5">{c.value}</p>
          <p className="text-xs text-slate-500">{c.label}</p>
          <p className={`text-xs font-medium mt-1 ${c.color}`}>{c.sub}</p>
          {c.extra}
        </div>
      ))}
    </div>
  );
}
