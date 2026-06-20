import React from 'react';
import { Clock } from 'lucide-react';

const StatusBadge = ({ status }) => {
  const s = parseInt(status);
  const cls = s >= 500 ? 'text-red-400 bg-red-900/30'
            : s >= 400 ? 'text-orange-400 bg-orange-900/30'
            : 'text-emerald-400 bg-emerald-900/30';
  return <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{status}</span>;
};

export default function RecentRequests({ requests = [] }) {
  if (!requests.length) {
    return (
      <div className="card-glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-brand-400" />
          <h2 className="font-display font-semibold text-white text-sm">Recent Requests</h2>
        </div>
        <p className="text-slate-500 text-xs text-center py-8">No recent requests — start using an API key!</p>
      </div>
    );
  }

  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-5">
        <Clock size={16} className="text-brand-400" />
        <h2 className="font-display font-semibold text-white text-sm">Recent Requests</h2>
        <span className="text-[10px] bg-white/5 text-slate-400 rounded-full px-2 py-0.5 font-mono ml-auto">
          {requests.length} shown
        </span>
      </div>

      <div className="overflow-x-auto -mx-5">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="text-[10px] text-slate-600 uppercase tracking-wider border-b border-white/5">
              <th className="text-left px-5 pb-2 font-medium">Endpoint</th>
              <th className="text-left px-3 pb-2 font-medium">API</th>
              <th className="text-left px-3 pb-2 font-medium">Status</th>
              <th className="text-right px-3 pb-2 font-medium">Cost</th>
              <th className="text-right px-5 pb-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r, i) => (
              <tr key={r.id || i} className="border-b border-white/3 hover:bg-white/2 transition-colors group">
                <td className="px-5 py-2.5 font-mono text-[11px] text-slate-300 truncate max-w-[140px]">{r.endpoint}</td>
                <td className="px-3 py-2.5 text-xs text-slate-400 truncate max-w-[100px]">{r.api_name || r.apiName}</td>
                <td className="px-3 py-2.5"><StatusBadge status={r.status_code || r.status || 200} /></td>
                <td className="px-3 py-2.5 text-right">
                  <span className="text-[10px] font-mono text-amber-400">{r.cost_weight || r.cost || 1}x</span>
                </td>
                <td className="px-5 py-2.5 text-right text-[11px] font-mono text-slate-600">
                  {r.response_time_ms != null ? `${r.response_time_ms}ms` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
