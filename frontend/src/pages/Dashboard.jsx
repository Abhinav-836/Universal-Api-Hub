import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { dashboardService } from '../services/auth';
import StatsCards from '../components/dashboard/StatsCards';
import { DailyUsageChart, ApiBreakdownChart, UsageRing } from '../components/dashboard/UsageChart';
import ApiKeyManager from '../components/dashboard/ApiKeyManager';
import RecentRequests from '../components/dashboard/RecentRequests';
import { ToastContainer, useToast } from '../components/ui/Toast';
import { PLANS } from '../utils/constants';
import { RefreshCw, Crown, X, Zap, Layers, Terminal } from 'lucide-react';
import api from '../services/api';

// API Playground (mini, for dashboard)
const ENDPOINTS = [
  { label: 'POST /api/v1/chat', method: 'POST', path: '/api/v1/chat', defaultBody: JSON.stringify({ message: 'Hello!' }, null, 2) },
  { label: 'GET /api/v1/weather', method: 'GET', path: '/api/v1/weather?city=London', defaultBody: null },
  { label: 'POST /api/v1/sentiment', method: 'POST', path: '/api/v1/sentiment', defaultBody: JSON.stringify({ text: 'This is great!' }, null, 2) },
];

function MiniPlayground({ userApiKey }) {
  const [ep, setEp] = useState(ENDPOINTS[0]);
  const [body, setBody] = useState(ENDPOINTS[0].defaultBody || '');
  const [apiKey, setApiKey] = useState(userApiKey || '');
  const [response, setRes] = useState(null);
  const [loading, setLd] = useState(false);
  const [elapsed, setEl] = useState(null);

  const run = async () => {
    setLd(true);
    setRes(null);
    const t0 = Date.now();
    try {
      const headers = { 'X-API-Key': apiKey };
      const res = ep.method === 'POST'
        ? await api.post(ep.path, JSON.parse(body || '{}'), { headers })
        : await api.get(ep.path, { headers });
      setEl(Date.now() - t0);
      setRes({ data: res.data, status: res.status });
    } catch (err) {
      setEl(Date.now() - t0);
      setRes({ error: err.response?.data || err.message, status: err.response?.status });
    } finally {
      setLd(false);
    }
  };

  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Terminal size={16} className="text-brand-400" />
        <h2 className="font-display font-semibold text-white text-sm">API Playground</h2>
        <span className="ml-auto text-[10px] bg-brand-500/15 text-brand-300 px-2 py-0.5 rounded-full font-mono">LIVE</span>
      </div>

      <select
        value={ep.path}
        onChange={(e) => {
          const found = ENDPOINTS.find(x => x.path === e.target.value);
          if (found) { setEp(found);
            setBody(found.defaultBody || '');
            setRes(null); }
        }}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 mb-3 focus:outline-none focus:border-brand-500/40"
      >
        {ENDPOINTS.map((e) => <option key={e.path} value={e.path}>{e.label}</option>)}
      </select>

      <input
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="uhb_your_api_key_here"
        className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-300 placeholder-slate-700 focus:outline-none focus:border-brand-500/40 mb-3 transition-all"
      />

      {ep.method === 'POST' && (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-brand-500/40 resize-none mb-3"
        />
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
            {response.status && <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${response.status >= 400 ? 'text-red-400 bg-red-900/30' : 'text-emerald-400 bg-emerald-900/30'}`}>{response.status}</span>}
            {elapsed && <span className="text-[10px] text-slate-600 ml-auto font-mono">{elapsed}ms</span>}
          </div>
          <pre className="bg-black/40 border border-white/5 rounded-xl p-3 text-[10px] font-mono text-slate-300 overflow-auto max-h-36 scrollbar-hide">
            {JSON.stringify(response.data || response.error, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// Upgrade Modal with Direct Plan Selection
function UpgradeModal({ plan, onClose, onUpgrade }) {
  const opts = [
    { key: 'pro', label: 'Pro', price: 'Free Beta', limit: '50 req/day, 8 APIs', color: 'from-brand-600 to-indigo-600' },
    { key: 'premium', label: 'Premium', price: 'Free Beta', limit: '200 req/day, all APIs', color: 'from-purple-600 to-pink-600' },
  ].filter((o) => o.key !== plan);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md card-glass rounded-2xl p-6 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-white">Upgrade Your Plan</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
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
                className={`px-4 py-2 rounded-xl bg-gradient-to-r ${o.color} text-white text-sm font-semibold hover:opacity-90 flex items-center gap-1.5`}
              >
                <Crown size={13} /> Select Plan
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
  const { user, updateUser } = useAuth();
  const { toasts, show: showToast, remove } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgradeModal, setUpgradeModal] = useState(false);
  const loadCalled = useRef(false);

  const plan = user?.plan || 'free';
  const planCfg = PLANS[plan] || PLANS.free;
  const userApiKey = data?.apiKeys?.[0]?.key_prefix ? data.apiKeys[0].key_prefix + '...' : '';

  // Fixed load function - uses ref to prevent multiple calls
  const load = useCallback(async () => {
    // Prevent multiple simultaneous loads
    if (loadCalled.current) return;
    loadCalled.current = true;

    setLoading(true);
    try {
      const [dash, usage] = await Promise.all([
        dashboardService.getDashboard().catch(() => ({})),
        dashboardService.getUsage().catch(() => ({})),
      ]);
      setData({ ...dash, usage });
    } catch (err) {
      // Only show error if not 401 (unauthorized)
      if (err.response?.status !== 401) {
        showToast('Failed to load dashboard data', 'error');
      }
    } finally {
      setLoading(false);
      loadCalled.current = false;
    }
  }, [showToast]);

  // Load once on mount
  useEffect(() => {
    load();
    // Cleanup to prevent memory leaks
    return () => {
      loadCalled.current = false;
    };
  }, []); // Empty dependency array = run once

  // Handle upgrade
  const handleUpgrade = async (targetPlan) => {
    try {
      const result = await dashboardService.selectPlan(targetPlan);
      showToast(`🎉 Upgraded to ${targetPlan} plan successfully!`);
      if (result.user) {
        updateUser({ plan: targetPlan });
      }
      await load();
      setUpgradeModal(false);
    } catch (err) {
      try {
        const { url } = await dashboardService.createCheckoutSession(targetPlan);
        if (url) {
          window.location.href = url;
        } else {
          showToast('Please contact support for upgrade', 'warning');
        }
      } catch {
        showToast('Upgrade failed. Please try again.', 'error');
      }
    }
  };

  const handleDeselect = async (apiId) => {
    try {
      await dashboardService.deselectApi(apiId);
      showToast('API removed');
      load();
    } catch {
      showToast('Failed to remove API', 'error');
    }
  };

  // Build stats
  const stats = {
    dailyUsed: data?.todayUsage?.total_requests || 0,
    dailyLimit: data?.dailyLimit || planCfg.dailyLimit,
    activeApis: data?.selectedApis?.length || 0,
    apiKeysCount: data?.apiKeys?.length || 0,
  };

  const dailyData = data?.usage?.daily || data?.usageHistory || [];
  const breakdownData = data?.usage?.apiBreakdown || data?.apiBreakdown || [];
  const recentReqs = data?.recentRequests || [];
  const selectedApis = data?.selectedApis || [];
  const allApis = data?.apis || [];

  return (
    <div className="min-h-screen bg-surface-950 relative z-10">
      <ToastContainer toasts={toasts} remove={remove} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-white mb-1">Dashboard</h1>
            <p className="text-slate-400 text-sm">
              Welcome back, <span className="text-white font-medium">{user?.username}</span> ·{' '}
              <span className={`font-semibold ${planCfg.badge?.replace('bg-', 'text-').replace('-700', '-300') || 'text-brand-300'}`}>
                {planCfg.name} plan
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {plan !== 'premium' && (
              <button
                onClick={() => setUpgradeModal(true)}
                className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-all"
              >
                <Crown size={14} /> Upgrade
              </button>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="p-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400 transition-all"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-white/3 rounded-2xl animate-pulse" />)}
            </div>
            <div className="h-64 bg-white/3 rounded-2xl animate-pulse" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats row */}
            <StatsCards stats={stats} />

            {/* Charts row */}
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

            {/* API breakdown + playground */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="card-glass rounded-2xl p-5">
                <h2 className="font-display font-semibold text-white text-sm mb-4">API Breakdown</h2>
                {breakdownData.length > 0 ? (
                  <ApiBreakdownChart data={breakdownData} />
                ) : (
                  <p className="text-slate-600 text-xs text-center py-12">No breakdown data yet</p>
                )}
              </div>
              <MiniPlayground userApiKey={userApiKey} />
            </div>

            {/* Selected APIs */}
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
                      <button
                        onClick={() => handleDeselect(a.id)}
                        className="text-slate-600 hover:text-red-400 transition-colors ml-1"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key manager */}
            <ApiKeyManager apis={allApis} onToast={showToast} />

            {/* Recent requests */}
            <RecentRequests requests={recentReqs} />
          </div>
        )}
      </div>

      {upgradeModal && (
        <UpgradeModal plan={plan} onClose={() => setUpgradeModal(false)} onUpgrade={handleUpgrade} />
      )}
    </div>
  );
}