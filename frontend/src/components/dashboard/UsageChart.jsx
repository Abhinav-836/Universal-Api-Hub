import React from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card-glass rounded-lg px-3 py-2 text-xs shadow-xl border border-white/10">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-mono font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

export const DailyUsageChart = ({ data = [] }) => {
  const chartData = data.slice(0, 14).reverse().map((d) => ({
    date:     new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    requests: parseInt(d.total_requests) || 0,
    cost:     parseInt(d.total_cost) || 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gReq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gCost" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="date"     tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis                    tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="requests" name="Requests" stroke="#6366f1" strokeWidth={2} fill="url(#gReq)" />
        <Area type="monotone" dataKey="cost"     name="Cost"     stroke="#a78bfa" strokeWidth={2} fill="url(#gCost)" />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export const ApiBreakdownChart = ({ data = [] }) => {
  const chartData = data.slice(0, 6).map((d) => ({
    name:     d.name?.split(' ')[0] || d.slug,
    requests: parseInt(d.request_count) || 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="name"     tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis                    tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="requests" name="Requests" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export const UsageRing = ({ used = 0, limit = 10 }) => {
  const pct    = Math.min((used / limit) * 100, 100);
  const r      = 42;
  const circ   = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color  = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#6366f1';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-bold text-xl text-white">{used}</span>
          <span className="text-xs text-slate-500 font-mono">/ {limit}</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs text-slate-500">Daily Requests Used</p>
        <p className="text-sm font-semibold mt-0.5" style={{ color }}>{Math.round(pct)}% consumed</p>
      </div>
    </div>
  );
};
