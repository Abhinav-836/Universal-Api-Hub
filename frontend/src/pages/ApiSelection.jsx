import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { dashboardService, planService } from '../services/auth';
import ApiCard from '../components/apis/ApiCard';
import { ToastContainer, useToast } from '../components/ui/Toast';
import { PLANS, groupApisByCategory } from '../utils/constants';
import { Search, Crown, RefreshCw, Globe, X } from 'lucide-react';

// Upgrade modal
function UpgradeModal({ plan, onClose, onUpgrade }) {
  const opts = [
    { key: 'pro',     label: 'Pro',     price: 'Free Beta', limit: '50 req/day, 8 APIs', color: 'from-brand-600 to-indigo-600' },
    { key: 'premium', label: 'Premium', price: 'Free Beta', limit: '200 req/day, all APIs', color: 'from-purple-600 to-pink-600' },
  ].filter((o) => o.key !== plan);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md card-glass rounded-2xl p-6 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-white">Upgrade Your Plan</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <p className="text-xs text-slate-400 mb-4">✨ All plans are currently FREE during beta!</p>
        <div className="space-y-3">
          {opts.map((o) => (
            <div key={o.key} className="rounded-xl p-4 border border-white/10 hover:border-brand-500/30 flex items-center justify-between transition-all">
              <div>
                <p className="font-bold text-white">{o.label}</p>
                <p className="text-xs text-slate-400">{o.price} · {o.limit}</p>
              </div>
              <button onClick={() => onUpgrade(o.key)}
                className={`px-4 py-2 rounded-xl bg-gradient-to-r ${o.color} text-white text-sm font-semibold hover:opacity-90 flex items-center gap-1.5`}>
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

export default function ApiSelection() {
  const { user, updateUser, forceRefresh } = useAuth();
  const { toasts, show: showToast, remove } = useToast();
  const [apis, setApis] = useState([]);
  const [planCfgRemote, setPlanCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState('');
  const [upgradeModal, setUpgradeModal] = useState(false);
  
  // ✅ Use refs to prevent infinite loops
  const loadCalled = useRef(false);
  const isMounted = useRef(true);

  const plan = user?.plan || 'free';
  const planCfg = PLANS[plan] || PLANS.free;
  const selectedCount = apis.filter((a) => a.selected).length;
  const slotLabel = planCfg.apiSlots === Infinity ? '∞' : planCfg.apiSlots;

  // ✅ Stable load function with ref guard
  const load = useCallback(async () => {
    if (loadCalled.current) return;
    loadCalled.current = true;
    
    if (!isMounted.current) return;
    
    setLoading(true);
    try {
      const res = await dashboardService.getApis();
      if (isMounted.current) {
        setApis(res.apis || []);
        setPlanCfg(res.planConfig);
      }
    } catch (err) {
      console.error('Failed to load APIs:', err);
      if (isMounted.current) {
        showToast('Failed to load APIs', 'error');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
      loadCalled.current = false;
    }
  }, [showToast]);

  // ✅ Only run once on mount
  useEffect(() => {
    isMounted.current = true;
    load();
    
    return () => {
      isMounted.current = false;
      loadCalled.current = false;
    };
  }, []); // ✅ Empty dependency array = run once

  const handleSelect = async (apiId) => {
    setBusy(apiId);
    try {
      await dashboardService.selectApi(apiId);
      showToast('API access granted');
      loadCalled.current = false; // Reset to allow reload
      await load();
    } catch (err) {
      if (err.response?.data?.upgradeRequired) setUpgradeModal(true);
      else showToast(err.response?.data?.error || 'Failed to select API', 'error');
    } finally { setBusy(''); }
  };

  const handleDeselect = async (apiId) => {
    setBusy(apiId);
    try {
      await dashboardService.deselectApi(apiId);
      showToast('API access removed');
      loadCalled.current = false; // Reset to allow reload
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to remove API', 'error');
    } finally { setBusy(''); }
  };

  const handleUpgrade = async (targetPlan) => {
    try {
      const result = await planService.selectPlan(targetPlan);
      showToast(`🎉 Upgraded to ${targetPlan} plan successfully!`);
      
      // ✅ Refresh user data
      if (forceRefresh) {
        await forceRefresh();
      }
      
      // ✅ Reload APIs
      loadCalled.current = false;
      await load();
      setUpgradeModal(false);
    } catch (err) {
      console.error('Upgrade failed:', err);
      showToast('Upgrade failed. Please try again.', 'error');
    }
  };

  const filtered = useMemo(() =>
    apis.filter((api) => {
      const q = search.toLowerCase();
      const matchSearch = !q || api.name.toLowerCase().includes(q) || api.description?.toLowerCase().includes(q) || api.category?.toLowerCase().includes(q);
      const matchFilter =
        filter === 'all' ||
        (filter === 'selected' && api.selected) ||
        (filter === 'locked' && api.locked) ||
        (filter === 'available' && !api.locked && !api.selected);
      return matchSearch && matchFilter;
    }), [apis, search, filter]);

  const grouped = groupApisByCategory(filtered);

  return (
    <div className="min-h-screen bg-surface-950 relative z-10">
      <ToastContainer toasts={toasts} remove={remove} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-white mb-1">API Selection</h1>
            <p className="text-slate-400 text-sm">Browse, compare, and unlock APIs based on your plan.</p>
          </div>
          <button onClick={() => { loadCalled.current = false; load(); }} disabled={loading}
            className="p-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400 transition-all">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="card-glass rounded-2xl p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Current Plan</p>
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-lg text-gradient">{planCfg.name}</span>
                  <span className="text-slate-500 text-sm">{planCfg.price}/mo</span>
                </div>
              </div>
              <div className="w-px h-10 bg-white/10 hidden sm:block" />
              <div>
                <p className="text-xs text-slate-400 mb-0.5">API Slots Used</p>
                <p className="font-display font-bold text-white">
                  {selectedCount} / <span className="text-brand-400">{slotLabel}</span>
                </p>
              </div>
              {plan !== 'premium' && (
                <>
                  <div className="w-px h-10 bg-white/10 hidden sm:block" />
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Switches / Day</p>
                    <p className="font-display font-bold text-white">{planCfgRemote?.switchesPerDay ?? planCfg.switchesPerDay} limit</p>
                  </div>
                </>
              )}
            </div>
            {plan !== 'premium' && (
              <button onClick={() => setUpgradeModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-purple-600 text-white text-sm font-semibold hover:opacity-90">
                <Crown size={14} /> Upgrade Plan
              </button>
            )}
          </div>
          {planCfg.apiSlots !== Infinity && (
            <div className="mt-4 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${Math.min((selectedCount / planCfg.apiSlots) * 100, 100)}%` }} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search APIs, categories, descriptions…"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/60 transition-all" />
          </div>
          <div className="flex gap-1 p-1 card-glass rounded-xl">
            {['all', 'selected', 'available', 'locked'].map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                  filter === f ? 'bg-brand-600/25 text-brand-300' : 'text-slate-400 hover:text-white'
                }`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-8">
            {[...Array(2)].map((_, s) => (
              <div key={s}>
                <div className="h-5 w-40 bg-white/5 rounded mb-4 animate-pulse" />
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, c) => (
                    <div key={c} className="h-56 bg-white/5 rounded-2xl animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="card-glass rounded-2xl p-16 text-center">
            <Globe size={40} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No APIs match your search</p>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map((group) => (
              <section key={group.category}>
                <div className="mb-4">
                  <h2 className="font-display text-lg font-bold text-white">
                    {group.meta.emoji} {group.meta.label}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">{group.items.length} APIs in this category</p>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {group.items.map((a) => (
                    <ApiCard key={a.id} api={a}
                      selected={a.selected} accessible={a.accessible} locked={a.locked}
                      loading={busy === a.id}
                      onSelect={handleSelect} onDeselect={handleDeselect}
                      selectedCount={selectedCount} maxSlots={planCfg.apiSlots} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {upgradeModal && (
        <UpgradeModal plan={plan} onClose={() => setUpgradeModal(false)} onUpgrade={handleUpgrade} />
      )}
    </div>
  );
}