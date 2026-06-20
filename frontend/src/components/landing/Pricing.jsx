import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Zap, Crown, Star } from 'lucide-react';

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    icon: Zap,
    gradient: 'from-slate-700 to-slate-600',
    border: 'border-white/10',
    features: ['10 weighted requests/day', '2 API slots', '2 API switches/day', 'Standard APIs only', 'Community support'],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$19',
    period: '/month',
    icon: Crown,
    gradient: 'from-brand-700 to-indigo-700',
    border: 'border-brand-500/40',
    badge: 'Most Popular',
    featured: true,
    features: ['20 weighted requests/day', '4 API slots', '4 API switches/day', 'Priority API access', 'Email support', 'Usage analytics'],
  },
  {
    key: 'premium',
    name: 'Premium',
    price: '$49',
    period: '/month',
    icon: Star,
    gradient: 'from-purple-700 to-pink-700',
    border: 'border-purple-500/30',
    features: ['30 weighted requests/day', 'Unlimited API slots', 'Unlimited switches', 'All API tiers', 'Priority 24/7 support', 'Advanced analytics', 'SLA guarantee'],
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-20 px-4 max-w-6xl mx-auto">
      <div className="text-center mb-14">
        <p className="text-xs font-mono text-brand-400 tracking-widest uppercase mb-3">Simple pricing</p>
        <h2 className="font-display font-extrabold text-4xl text-white mb-4">
          Start free,<br /><span className="text-gradient">scale as you grow</span>
        </h2>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {PLANS.map((plan) => (
          <div
            key={plan.key}
            className={`relative rounded-2xl p-7 border transition-all duration-300 flex flex-col ${
              plan.featured
                ? 'card-glass border-brand-500/40 glow-md scale-[1.02]'
                : 'card-glass hover:border-white/15 hover:glow-sm'
            } ${plan.border}`}
          >
            {plan.badge && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[11px] font-bold bg-gradient-to-r from-brand-600 to-purple-600 text-white shadow-lg">
                {plan.badge}
              </div>
            )}

            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center mb-4`}>
              <plan.icon size={18} className="text-white" />
            </div>

            <h3 className="font-display font-bold text-xl text-white mb-1">{plan.name}</h3>
            <div className="flex items-baseline gap-1 mb-5">
              <span className="font-display font-extrabold text-3xl text-white">{plan.price}</span>
              <span className="text-slate-500 text-sm">{plan.period}</span>
            </div>

            <ul className="space-y-2.5 mb-8 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
                  <Check size={14} className="text-brand-400 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <Link to="/signup"
              className={`block text-center py-3 rounded-xl text-sm font-semibold transition-all ${
                plan.featured
                  ? 'bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white shadow-lg shadow-brand-900/40'
                  : 'border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white'
              }`}>
              {plan.price === '$0' ? 'Get started free' : `Start ${plan.name}`}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
