import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardBodySkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../context/AuthContext';
import { dashboardService, planService } from '../services/auth';
import StatsCards from '../components/dashboard/StatsCards';
import { DailyUsageChart, ApiBreakdownChart, UsageRing } from '../components/dashboard/UsageChart';
import ApiKeyManager from '../components/dashboard/ApiKeyManager';
import RecentRequests from '../components/dashboard/RecentRequests';
import { ToastContainer, useToast } from '../components/ui/Toast';
import { PLANS } from '../utils/constants';
import { RefreshCw, Crown, X, Layers, Terminal } from 'lucide-react';
import api from '../services/api';

// API Playground (mini, for dashboard)
// Every /api/v1 endpoint, with a working example. GET endpoints get an
// editable query string; POST endpoints an editable JSON body.
const SUMMARY_SAMPLE =
  'Universal API Hub lets developers call many APIs with a single key. Users pick a plan, choose the APIs they need, ' +
  'and every request is checked against their daily quota. Failed requests and demo responses are refunded, so users ' +
  'only pay for successful calls. The dashboard shows usage by API and by day.';

const ENDPOINTS = [
  { group: 'AI', method: 'POST', path: '/api/v1/chat', body: { message: 'Hello!' } },
  { group: 'AI', method: 'POST', path: '/api/v1/llm/chat', body: { message: 'Explain what an API gateway is in one sentence.', temperature: 0.4 } },
  { group: 'AI', method: 'POST', path: '/api/v1/translate', body: { text: 'Hello, how are you today?', targetLanguage: 'hi' } },
  { group: 'AI', method: 'POST', path: '/api/v1/sentiment', body: { text: 'The app is fast, but the new UI is confusing.' } },
  { group: 'AI', method: 'POST', path: '/api/v1/summarize', body: { text: SUMMARY_SAMPLE, maxLength: 150, style: 'paragraph' } },
  { group: 'AI', method: 'POST', path: '/api/v1/image/analyze', body: { imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Cat03.jpg' } },
  { group: 'Data', method: 'GET', path: '/api/v1/weather', query: 'city=London&units=metric' },
  { group: 'Data', method: 'GET', path: '/api/v1/geocode', query: 'address=Jamshedpur' },
  { group: 'Data', method: 'GET', path: '/api/v1/news', query: 'category=technology&pageSize=5' },
  { group: 'Data', method: 'GET', path: '/api/v1/sports', query: 'league=cricket&pageSize=5' },
  { group: 'Markets', method: 'GET', path: '/api/v1/stocks/quote', query: 'symbol=AAPL' },
  { group: 'Markets', method: 'GET', path: '/api/v1/stocks/search', query: 'keywords=reliance' },
  { group: 'Markets', method: 'GET', path: '/api/v1/forex', query: 'from=USD&to=INR' },
  { group: 'Markets', method: 'GET', path: '/api/v1/crypto', query: 'symbol=BTC&market=USD' },
];
const GROUPS = [...new Set(ENDPOINTS.map((e) => e.group))];
const defaultBodyFor = (endpoint) => (endpoint.body ? JSON.stringify(endpoint.body, null, 2) : '');

function MiniPlayground({ userApiKey }) {
  const [ep, setEp] = useState(ENDPOINTS[0]);
  const [body, setBody] = useState(defaultBodyFor(ENDPOINTS[0]));
  const [query, setQuery] = useState(ENDPOINTS[0].query || '');
  const [apiKey, setApiKey] = useState(userApiKey || '');
  const [response, setRes] = useState(null);
  const [loading, setLd] = useState(false);
  const [elapsed, setEl] = useState(null);

  // Pick up a newly created key without requiring a page reload
  useEffect(() => { if (userApiKey) setApiKey(userApiKey); }, [userApiKey]);

  const choose = (path) => {
    const found = ENDPOINTS.find((x) => x.path === path);
    if (!found) return;
    setEp(found);
    setBody(defaultBodyFor(found));
    setQuery(found.query || '');
    setRes(null);
    setEl(null);
  };

  const run = async () => {
    if (!apiKey.trim()) {
      setRes({ error: 'Paste an API key (uhb_...) first. Create one in the API Keys panel.' });
      return;
    }
    let parsedBody = {};
    if (ep.method === 'POST') {
      try {
        parsedBody = JSON.parse(body || '{}');
      } catch {
        setRes({ error: 'Request body is not valid JSON' });
        return;
      }
    }

    const qs = query.trim().replace(/^\?/, '');
    const url = ep.method === 'GET' && qs ? `${ep.path}?${qs}` : ep.path;

    setLd(true);
    setRes(null);
    const t0 = Date.now();
    try {
      const headers = { 'X-API-Key': apiKey.trim() };
      const res = ep.method === 'POST'
        ? await api.post(url, parsedBody, { headers })
        : await api.get(url, { headers });
      setEl(Date.now() - t0);
      setRes({ data: res.data, status: res.status });
    } catch (err) {
      setEl(Date.now() - t0);
      setRes({ error: err.response?.data || err.message, status: err.response?.status });
    } finally {
      setLd(false);
    }
  };

  const fieldClass =
    'w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 placeholder-slate-700 focus:outline-none focus:border-brand-500/40 transition-all';

  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Terminal size={16} className="text-brand-400" />
        <h2 className="font-display font-semibold text-white text-sm">API Playground</h2>
        <span className="ml-auto text-[10px] bg-brand-500/15 text-brand-300 px-2 py-0.5 rounded-full font-mono">LIVE</span>
      </div>

      <label htmlFor="pg-endpoint" className="sr-only">Endpoint</label>
      <select
        id="pg-endpoint"
        value={ep.path}
        onChange={(e) => choose(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 mb-3 focus:outline-none focus:border-brand-500/40"
      >
        {GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {ENDPOINTS.filter((e) => e.group === group).map((e) => (
              <option key={e.path} value={e.path}>{`${e.method} ${e.path}`}</option>
            ))}
          </optgroup>
        ))}
      </select>

      <label htmlFor="pg-key" className="sr-only">API key</label>
      <input
        id="pg-key"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="uhb_your_api_key_here"
        className={`${fieldClass} py-2.5 mb-3`}
      />

      {ep.method === 'GET' ? (
        <div className="mb-3">
          <label htmlFor="pg-query" className="block text-[10px] text-slate-500 font-mono mb-1">
            {ep.path}?
          </label>
          <input
            id="pg-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
            placeholder="key=value&key2=value2"
            className={fieldClass}
          />
        </div>
      ) : (
        <>
          <label htmlFor="pg-body" className="block text-[10px] text-slate-500 font-mono mb-1">JSON body</label>
          <textarea
            id="pg-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            spellCheck={false}
            className={`${fieldClass} resize-y mb-3`}
          />
        </>
      )}

      <button
        onClick={run}
        disabled={loading}
        className="w-full py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-all disabled:opacity-60 mb-3"
      >
        {loading ? 'Sending…' : 'Send Request'}
      </button>

      {response && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-slate-500 font-mono">Response</span>
            {response.status && (
              <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${response.status >= 400 ? 'text-red-400 bg-red-900/30' : 'text-emerald-400 bg-emerald-900/30'}`}>
                {response.status}
              </span>
            )}
            {response.data?.source && (
              <span
                className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${response.data.source === 'mock' ? 'text-amber-300 bg-amber-900/30' : 'text-slate-400 bg-white/5'}`}
                title={response.data.source === 'mock' ? 'Demo data — the provider key is not set on the server' : 'Live provider'}
              >
                {response.data.source}
              </span>
            )}
            {elapsed != null && <span className="text-[10px] text-slate-600 ml-auto font-mono">{elapsed}ms</span>}
          </div>
          <pre className="bg-black/40 border border-white/5 rounded-xl p-3 text-[10px] font-mono text-slate-300 overflow-auto max-h-72 whitespace-pre-wrap break-words">
            {typeof (response.data || response.error) === 'string'
              ? response.data || response.error
              : JSON.stringify(response.data || response.error, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function UpgradeModal({ plan, onClose, onUpgrade, busy }) {
  const opts = [
    { key: 'pro', label: 'Pro', price: 'Free Beta', limit: '50 req/day, 8 APIs', color: 'from-brand-600 to-indigo-600' },
    { key: 'premium', label: 'Premium', price: 'Free Beta', limit: '200 req/day, all APIs', color: 'from-purple-600 to-pink-600' },
  ].filter((o) => o.key !== plan);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md card-glass rounded-2xl p-6 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-white">Upgrade Your Plan</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-4">✨ All plans are currently FREE during beta!</p>
        <div className="space-y-3">
          {opts.map((o) => (
            <div key={o.key} className="rounded-xl p-4 border border-white/10 hover:border-brand-500/30 flex items-center justify-between transition-all">
              <div>
                <p className="font-bold text-white">{o.label}</p>
                <p className="text-xs text-slate-400">{o.price} · {o.limit}</p>
              </div>
              <button
                onClick={() => onUpgrade(o.key)}
                disabled={!!busy}
                className={`px-4 py-2 rounded-xl bg-gradient-to-r ${o.color} text-white text-sm font-semibold hover:opacity-90 flex items-center gap-1.5 disabled:opacity-60`}
              >
                <Crown size={13} /> {busy === o.key ? 'Working…' : 'Select Plan'}
              </button>
            </div>
          ))}
          <p className="text-center text-xs text-slate-500 pt-1">No payment required during beta</p>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, forceRefresh } = useAuth();
  const { toasts, show: showToast, remove } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgradeModal, setUpgradeModal] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState('');
  const [freshKey, setFreshKey] = useState(''); // raw key, only in memory, right after creation
  const inFlight = useRef(false);

  const plan = user?.plan || 'free';
  const planCfg = PLANS[plan] || PLANS.free;

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const dash = await dashboardService.getDashboard();
      setData(dash);
    } catch (err) {
      if (err.response?.status !== 401) {
        showToast('Failed to load dashboard data', 'error');
      }
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  // Returning from Stripe checkout
  useEffect(() => {
    if (searchParams.get('checkout_success')) {
      showToast('Payment received — your plan will update in a few seconds.');
      setTimeout(() => { forceRefresh(); load(); }, 3000);
      setSearchParams({}, { replace: true });
    } else if (searchParams.get('checkout_canceled')) {
      showToast('Checkout canceled', 'warning');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, showToast, forceRefresh, load]);

  const handleUpgrade = async (targetPlan) => {
    setUpgradeBusy(targetPlan);
    try {
      const result = await planService.selectPlan(targetPlan);
      if (result?.redirecting) return; // going to Stripe checkout
      showToast(`🎉 Upgraded to ${targetPlan} plan successfully!`);
      await forceRefresh();
      await load();
      setUpgradeModal(false);
    } catch (err) {
      showToast(err.response?.data?.error || 'Upgrade failed. Please try again.', 'error');
    } finally {
      setUpgradeBusy('');
    }
  };

  const handleDeselect = async (apiId) => {
    try {
      await dashboardService.deselectApi(apiId);
      showToast('API removed');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to remove API', 'error');
    }
  };

  const stats = {
    dailyUsed: data?.todayUsage?.total_requests || 0,
    dailyLimit: data?.dailyLimit || planCfg.dailyLimit,
    activeApis: data?.selectedApis?.length || 0,
    apiKeysCount: data?.apiKeys?.length || 0,
  };

  const dailyData = data?.usageHistory || [];
  const breakdownData = data?.apiBreakdown || [];
  const recentReqs = data?.recentRequests || [];
  const selectedApis = data?.selectedApis || [];
  const allApis = data?.apis || [];

  // FIX: the skeleton used to replace the whole page on EVERY reload
  // (refresh, remove API, upgrade), unmounting the API-keys panel and
  // wiping a freshly created key before the user could copy it.
  const showSkeleton = loading && !data;

  return (
    <div className="min-h-screen bg-surface-950 relative z-10">
      <ToastContainer toasts={toasts} remove={remove} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-white mb-1">Dashboard</h1>
            <p className="text-slate-400 text-sm">
              Welcome back, <span className="text-white font-medium">{user?.username}</span> ·{' '}
              <span className="font-semibold text-brand-300">{planCfg.name} plan</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {plan !== 'premium' && (
              <button
                onClick={() => setUpgradeModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-all"
              >
                <Crown size={14} /> <span className="hidden sm:inline">Upgrade</span>
              </button>
            )}
            <button
              onClick={load}
              disabled={loading}
              aria-label="Refresh"
              className="p-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400 transition-all"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {showSkeleton ? (
          <DashboardBodySkeleton />
        ) : (
          <div className="space-y-6">
            <StatsCards stats={stats} />

            <div className="grid lg:grid-cols-3 gap-6">
              <div className="card-glass rounded-2xl p-5 flex flex-col items-center justify-center">
                <h2 className="font-display font-semibold text-white text-sm mb-4 self-start">Today's Usage</h2>
                <UsageRing used={stats.dailyUsed} limit={stats.dailyLimit} />
              </div>
              <div className="card-glass rounded-2xl p-5 lg:col-span-2">
                <h2 className="font-display font-semibold text-white text-sm mb-4">14-Day History</h2>
                {dailyData.length > 0 ? (
                  <DailyUsageChart data={dailyData} />
                ) : (
                  <p className="text-slate-600 text-xs text-center py-16">No usage data yet</p>
                )}
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <div className="card-glass rounded-2xl p-5">
                <h2 className="font-display font-semibold text-white text-sm mb-4">API Breakdown</h2>
                {breakdownData.length > 0 ? (
                  <ApiBreakdownChart data={breakdownData} />
                ) : (
                  <p className="text-slate-600 text-xs text-center py-12">No breakdown data yet</p>
                )}
              </div>
              <MiniPlayground userApiKey={freshKey} />
            </div>

            {selectedApis.length > 0 && (
              <div className="card-glass rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Layers size={16} className="text-brand-400" />
                  <h2 className="font-display font-semibold text-white text-sm">Active APIs</h2>
                  <span className="text-[10px] bg-white/5 text-slate-400 rounded-full px-2 py-0.5 font-mono">{selectedApis.length}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedApis.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300">
                      {a.name}
                      {plan !== 'premium' && (
                        <button
                          onClick={() => handleDeselect(a.id)}
                          aria-label={`Remove ${a.name}`}
                          className="text-slate-600 hover:text-red-400 transition-colors ml-1"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <ApiKeyManager apis={allApis} onToast={showToast} onKeyCreated={setFreshKey} />
            <RecentRequests requests={recentReqs} />
          </div>
        )}
      </div>

      {upgradeModal && (
        <UpgradeModal
          plan={plan}
          busy={upgradeBusy}
          onClose={() => setUpgradeModal(false)}
          onUpgrade={handleUpgrade}
        />
      )}
    </div>
  );
}