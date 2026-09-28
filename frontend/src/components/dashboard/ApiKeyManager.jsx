import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Key, Plus, Trash2, Copy, Check, ChevronDown, X, Eye, EyeOff } from 'lucide-react';
import { apiKeyService } from '../../services/auth';
import { KEY_TYPES, KEY_TYPE_COLORS } from '../../utils/constants';

export default function ApiKeyManager({ apis = [], onToast, onKeyCreated }) {
  const [keys, setKeys]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newKey, setNewKey]       = useState(null);  // raw key after create
  const [copied, setCopied]       = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiKeyService.list();
      setKeys(data.keys || data || []);
    } catch { onToast?.('Failed to load keys', 'error'); }
    finally { setLoading(false); }
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = async (id) => {
    try {
      await apiKeyService.revoke(id);
      onToast?.('Key revoked');
      load();
    } catch { onToast?.('Failed to revoke key', 'error'); }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Key size={16} className="text-brand-400" />
          <h2 className="font-display font-semibold text-white text-sm">API Keys</h2>
          <span className="text-[10px] bg-white/5 text-slate-400 rounded-full px-2 py-0.5 font-mono">{keys.length}</span>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-brand-600/20 text-brand-300 border border-brand-500/20 hover:bg-brand-600/30 transition-all"
        >
          <Plus size={12} /> New Key
        </button>
      </div>

      {/* New key revealed */}
      {typeof newKey === 'string' && newKey && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 animate-fade-in">
          <p className="text-xs text-emerald-400 font-medium mb-2">⚠ Copy now — key won't be shown again</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono text-white bg-black/30 rounded-lg px-3 py-2 overflow-auto scrollbar-hide">
              {newKey}
            </code>
            <button onClick={() => copyToClipboard(newKey, 'new')}
              className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-all shrink-0">
              {copied === 'new' ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="text-[10px] text-slate-500 mt-2 hover:text-slate-400">Dismiss</button>
        </div>
      )}

      {/* Key list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-12 bg-white/3 rounded-xl animate-pulse" />)}
        </div>
      ) : keys.length === 0 ? (
        <p className="text-slate-500 text-xs text-center py-6">No keys yet — create one above.</p>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/5 hover:border-white/10 transition-all group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-white truncate">{k.label}</span>
                  {/* BUG FIX: the backend returns `key_type` (matching the DB column),
                      not `type` — this badge and its color lookup were always falling
                      back to the default (undefined -> blank badge, dev color). */}
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${KEY_TYPE_COLORS[k.key_type] || KEY_TYPE_COLORS.dev}`}>
                    {k.key_type}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-600 font-mono">
                  <span>{k.key_prefix}••••••••</span>
                  {k.expires_at && <span>Exp: {new Date(k.expires_at).toLocaleDateString()}</span>}
                </div>
              </div>
              <button onClick={() => handleRevoke(k.id)}
                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {keys.length > 0 && (
        <p className="text-[10px] text-slate-600 mt-3">
          Only the key prefix is stored — the full key is shown once, right after you create it.
        </p>
      )}

      {/* Create modal */}
      {showModal && (
        <CreateKeyModal
          apis={apis}
          onClose={() => setShowModal(false)}
          onCreated={(rawKey) => { setNewKey(rawKey); onKeyCreated?.(rawKey); setShowModal(false); load(); onToast?.('Key created!'); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function CreateKeyModal({ apis, onClose, onCreated, onToast }) {
  const [form, setForm] = useState({ label: '', type: 'dev', expiresAt: '', scopedApis: [] });
  const [loading, setLoading] = useState(false);

  const handle = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const toggleApi = (id) => setForm((f) => ({
    ...f,
    scopedApis: f.scopedApis.includes(id) ? f.scopedApis.filter((x) => x !== id) : [...f.scopedApis, id],
  }));

  const submit = async () => {
    if (!form.label.trim()) { onToast?.('Label required', 'warning'); return; }
    setLoading(true);
    try {
      // BUG FIX: the backend route validates/reads `keyType` (see
      // user.routes.js / ApiKeyController.create), not `type`. Sending
      // `type` meant the selected key type (dev/prod/test) was silently
      // dropped and every created key defaulted to 'dev'.
      const payload = { label: form.label, keyType: form.type };
      if (form.expiresAt) payload.expiresAt = form.expiresAt;
      if (form.scopedApis.length) payload.scopedApis = form.scopedApis;
      const data = await apiKeyService.create(payload);
      // BUG FIX: the API responds { success, key: { ...record, rawKey } }, so the
      // raw key lives at data.key.rawKey. This used `data.rawKey || data.key`,
      // which fell through to the whole key OBJECT; that object was then
      // rendered as a React child ({newKey}) -> "Objects are not valid as a
      // React child" -> the entire app unmounted (blank page) right after
      // every successful key creation.
      const raw = data?.key?.rawKey || data?.rawKey;
      if (typeof raw !== 'string') throw new Error('No raw key returned');
      onCreated(raw);
    } catch { onToast?.('Failed to create key', 'error'); }
    finally { setLoading(false); }
  };

  // BUG FIX: this modal was rendered inline inside the API Keys card, which
  // uses `.card-glass` (backdrop-filter). A backdrop-filter makes that card
  // the containing block for any `position: fixed` child, so `fixed inset-0`
  // sized the overlay to the CARD instead of the viewport: the modal was
  // clipped at the bottom (Create Key button unreachable) and stacked
  // underneath the neighbouring Playground / Recent Requests cards.
  // Rendering through a portal into <body> escapes that stacking context;
  // the panel also scrolls on short screens so the button is always reachable.
  return createPortal(
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto card-glass rounded-2xl p-6 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-white">Create API Key</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider font-medium">Label</label>
            <input name="label" value={form.label} onChange={handle} placeholder="My production key"
              className="input-base" />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider font-medium">Type</label>
            <div className="flex gap-2">
              {KEY_TYPES.map((t) => (
                <button key={t} onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all capitalize ${
                    form.type === t ? `${KEY_TYPE_COLORS[t]} border-current/30` : 'border-white/10 text-slate-500 hover:text-white'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider font-medium">Expires (optional)</label>
            <input type="date" name="expiresAt" value={form.expiresAt} onChange={handle}
              className="input-base" />
          </div>

          {apis.length > 0 && (
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider font-medium">
                Scope to APIs (leave empty = all)
              </label>
              <div className="max-h-36 overflow-y-auto space-y-1 scrollbar-hide">
                {apis.filter((a) => a.selected).map((a) => (
                  <label key={a.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer">
                    <input type="checkbox" checked={form.scopedApis.includes(a.id)} onChange={() => toggleApi(a.id)}
                      className="accent-brand-500" />
                    <span className="text-xs text-slate-300">{a.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button onClick={submit} disabled={loading}
            className="btn-primary w-full py-3 rounded-xl text-sm">
            {loading ? 'Creating…' : 'Create Key'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}