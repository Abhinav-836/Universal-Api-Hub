export const API_BASE = import.meta.env.VITE_API_BASE || '';

export const PLANS = {
  free: {
    name: 'Free',
    price: '$0',
    dailyLimit: 10,
    apiSlots: 2,
    switchesPerDay: 2,
    badge: 'bg-slate-700 text-slate-200',
    badgeColor: 'bg-slate-700',
    color: 'from-slate-600/20 to-slate-500/5',
    border: 'border-white/10',
    features: ['10 weighted requests/day', '2 API slots', '2 API switches/day', 'Standard support'],
    alphaVantageCallsPerMin: 5,
    yahooFinanceCallsPerMin: 10,
    llmModels: ['mistralai/mistral-7b-instruct', 'deepseek/deepseek-chat'],
  },
  pro: {
    name: 'Pro',
    price: '$19',
    dailyLimit: 50,
    apiSlots: 8,
    switchesPerDay: 5,
    badge: 'bg-indigo-700 text-indigo-200',
    badgeColor: 'bg-indigo-700',
    color: 'from-indigo-600/20 to-violet-600/10',
    border: 'border-brand-500/40',
    features: ['50 weighted requests/day', '8 API slots', '5 API switches/day', 'Priority API access', 'Email support'],
    alphaVantageCallsPerMin: 15,
    yahooFinanceCallsPerMin: 20,
    llmModels: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],
  },
  premium: {
    name: 'Premium',
    price: '$49',
    dailyLimit: 200,
    apiSlots: Infinity,
    switchesPerDay: Infinity,
    badge: 'bg-purple-700 text-purple-200',
    badgeColor: 'bg-purple-700',
    color: 'from-fuchsia-600/20 to-pink-600/10',
    border: 'border-purple-500/30',
    features: ['200 weighted requests/day', 'Unlimited API slots', 'Unlimited switches', 'All API tiers', 'Priority 24/7 support', 'SLA guarantee'],
    alphaVantageCallsPerMin: 25,
    yahooFinanceCallsPerMin: 30,
    llmModels: 'all',
  },
};

export const API_COST_LABELS = {
  1: { label: 'Light', color: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' },
  2: { label: 'Normal', color: 'bg-amber-500/10 text-amber-300 border border-amber-500/20' },
  3: { label: 'Heavy', color: 'bg-orange-500/10 text-orange-300 border border-orange-500/20' },
  4: { label: 'Intense', color: 'bg-red-500/10 text-red-300 border border-red-500/20' },
  5: { label: 'Max', color: 'bg-rose-500/10 text-rose-300 border border-rose-500/20' },
};

export const API_CATEGORY_META = {
  news: { label: 'News', emoji: '📰', pill: 'bg-sky-500/10 text-sky-300 border border-sky-500/20' },
  sports: { label: 'Sports', emoji: '⚽', pill: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' },
  llm: { label: 'AI', emoji: '🤖', pill: 'bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20' },
  utility: { label: 'Utility', emoji: '🧭', pill: 'bg-slate-500/10 text-slate-300 border border-slate-500/20' },
  vision: { label: 'Vision', emoji: '🖼️', pill: 'bg-violet-500/10 text-violet-300 border border-violet-500/20' },
  general: { label: 'General', emoji: '🧩', pill: 'bg-slate-500/10 text-slate-300 border border-slate-500/20' },
  market: { label: 'Market', emoji: '📈', pill: 'bg-amber-500/10 text-amber-300 border border-amber-500/20' },
};

const CATEGORY_ORDER = ['news', 'sports', 'llm', 'utility', 'vision', 'market', 'general'];

export const getApiCost = (api) => Number(api?.cost ?? api?.cost_weight ?? 1);
export const getApiCategoryMeta = (cat) => API_CATEGORY_META[cat] || API_CATEGORY_META.general;

export const groupApisByCategory = (apis = []) => {
  const groups = new Map();
  apis.forEach((api) => {
    const cat = api.category || 'general';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(api);
  });
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      const ia = CATEGORY_ORDER.indexOf(a),
        ib = CATEGORY_ORDER.indexOf(b);
      const sa = ia === -1 ? CATEGORY_ORDER.length : ia;
      const sb = ib === -1 ? CATEGORY_ORDER.length : ib;
      return sa - sb || a.localeCompare(b);
    })
    .map(([category, items]) => ({
      category,
      meta: getApiCategoryMeta(category),
      items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
    }));
};

export const KEY_TYPES = ['dev', 'prod', 'test'];
export const KEY_TYPE_COLORS = {
  dev: 'text-brand-300 bg-brand-500/10 border-brand-500/20',
  prod: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  test: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
};