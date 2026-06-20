import React from 'react';
import { Lock, Zap, MessageSquare, Image, Cloud, Languages, BarChart2, AlignLeft, ScanText, MapPin, Newspaper, Trophy, Bot } from 'lucide-react';
import { API_COST_LABELS, getApiCategoryMeta, getApiCost } from '../../utils/constants';

const ICONS = {
  chat: MessageSquare, 'llm-chat': Bot, weather: Cloud, 'image-analyze': Image,
  translate: Languages, sentiment: BarChart2, summarize: AlignLeft, ocr: ScanText,
  geocode: MapPin, news: Newspaper, sports: Trophy,
};

const MIN_PLAN_COLORS = { free: 'text-emerald-400', pro: 'text-brand-400', premium: 'text-purple-400' };

export default function ApiCard({ api, selected, accessible, locked, onSelect, onDeselect, loading, selectedCount, maxSlots }) {
  const Icon      = ICONS[api.slug] || Zap;
  const cost      = getApiCost(api);
  const costMeta  = API_COST_LABELS[cost] || API_COST_LABELS[1];
  const catMeta   = getApiCategoryMeta(api.category);
  const atLimit   = Number.isFinite(maxSlots) && !selected && selectedCount >= maxSlots;
  const statusLabel = selected ? 'Active' : locked ? 'Locked' : accessible ? 'Available' : 'Unavailable';

  return (
    <div className={`relative rounded-2xl p-5 transition-all duration-300 group ${
      selected
        ? 'card-glass border-brand-500/40 glow-sm'
        : locked
          ? 'bg-surface-900/40 border border-white/5 opacity-60'
          : 'card-glass hover:border-brand-500/30 hover:glow-sm'
    }`}>
      {locked && (
        <div className="absolute inset-0 rounded-2xl flex items-end justify-center pb-4 bg-gradient-to-t from-surface-950/70 to-transparent z-10">
          <div className="flex items-center gap-1.5 bg-surface-900 border border-white/10 rounded-full px-3 py-1.5 text-xs font-medium text-slate-400">
            <Lock size={11} /> Requires {api.min_plan} plan
          </div>
        </div>
      )}

      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          selected ? 'bg-brand-500/20 text-brand-400' : 'bg-white/5 text-slate-400 group-hover:text-slate-200'
        }`}>
          <Icon size={19} />
        </div>
        <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${
          selected ? 'bg-brand-500/10 text-brand-300 border-brand-500/20'
                   : locked ? 'bg-white/5 text-slate-500 border-white/10'
                   : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
        }`}>{statusLabel}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${catMeta.pill}`}>
          {catMeta.emoji} {catMeta.label}
        </span>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${costMeta.color}`}>
          {costMeta.label} ({cost}x)
        </span>
        <span className={`text-[10px] font-mono font-medium ${MIN_PLAN_COLORS[api.min_plan] || 'text-slate-400'}`}>
          {api.min_plan}+
        </span>
      </div>

      <h3 className="font-display font-semibold text-sm text-white mb-1 leading-tight">{api.name}</h3>
      <p className="text-xs text-slate-500 leading-relaxed mb-4 min-h-[40px]">{api.description}</p>

      {!locked && (
        selected ? (
          <button onClick={() => onDeselect(api.id)} disabled={loading}
            className="w-full py-2 rounded-xl text-xs font-semibold border border-brand-500/30 text-brand-300 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all disabled:opacity-50">
            {loading ? 'Removing…' : 'Remove Access'}
          </button>
        ) : atLimit ? (
          <div className="w-full py-2 rounded-xl text-xs font-semibold text-center text-slate-600 bg-white/3 border border-white/5">
            Slot limit reached
          </div>
        ) : (
          <button onClick={() => onSelect(api.id)} disabled={loading}
            className="w-full py-2 rounded-xl text-xs font-semibold bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 hover:border-brand-500/40 transition-all disabled:opacity-50">
            {loading ? 'Adding…' : '+ Add API'}
          </button>
        )
      )}
    </div>
  );
}
