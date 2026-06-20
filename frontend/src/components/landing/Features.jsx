import React from 'react';
import { Bot, Cloud, Newspaper, TrendingUp, Key, BarChart2, Shield, Headphones } from 'lucide-react';

const FEATURES = [
  { icon: Bot,        title: 'AI & LLM APIs',         desc: 'Access state-of-the-art language models for chat, summarization, sentiment, and more.', color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10' },
  { icon: Cloud,      title: 'Weather Data',           desc: 'Real-time and forecast weather for any city with a simple, unified API call.', color: 'text-sky-400', bg: 'bg-sky-500/10' },
  { icon: Newspaper,  title: 'News & Media',           desc: 'Aggregate headlines from hundreds of sources, filtered by category and region.', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  { icon: TrendingUp, title: 'Market & Finance',       desc: 'Stock quotes, crypto prices, and financial indicators in a single unified format.', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { icon: Key,        title: 'API Key Scoping',        desc: 'Create granular API keys scoped to specific endpoints, with expiry and type controls.', color: 'text-brand-400', bg: 'bg-brand-500/10' },
  { icon: BarChart2,  title: 'Usage Analytics',        desc: 'Track daily requests, cost weights, and per-endpoint breakdowns with beautiful charts.', color: 'text-violet-400', bg: 'bg-violet-500/10' },
  { icon: Shield,     title: 'Plan-Based Rate Limits', desc: 'Fair usage enforced per plan — upgrade anytime for higher throughput and more API slots.', color: 'text-rose-400', bg: 'bg-rose-500/10' },
  { icon: Headphones, title: '24/7 Support',           desc: 'Priority support for Pro and Premium plans. We are here whenever you need us.', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
];

export default function Features() {
  return (
    <section id="features" className="py-20 px-4 max-w-7xl mx-auto">
      <div className="text-center mb-14">
        <p className="text-xs font-mono text-brand-400 tracking-widest uppercase mb-3">What's included</p>
        <h2 className="font-display font-extrabold text-4xl text-white mb-4">
          Everything you need,<br /><span className="text-gradient">nothing you don't</span>
        </h2>
        <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">
          A curated suite of APIs — from AI to data — managed through one elegant platform.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="card-glass rounded-2xl p-6 hover:border-brand-500/20 hover:glow-sm transition-all duration-300 group animate-fade-up"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <div className={`w-10 h-10 rounded-xl ${f.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <f.icon size={19} className={f.color} />
            </div>
            <h3 className="font-display font-semibold text-white text-sm mb-2 leading-tight">{f.title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
