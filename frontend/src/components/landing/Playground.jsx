import React, { useState } from 'react';
import { Terminal, Send, Loader } from 'lucide-react';
import api from '../../services/api';

export default function Playground() {
  const [apiKey,   setApiKey]   = useState('');
  const [message,  setMessage]  = useState('What is the Universal API Hub?');
  const [response, setResponse] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [elapsed,  setElapsed]  = useState(null);

  const run = async () => {
    if (!apiKey.trim()) { setResponse({ error: 'Enter your API key (uhb_...)' }); return; }
    setLoading(true); setResponse(null);
    const t0 = Date.now();
    try {
      const res = await api.post('/api/v1/chat', { message }, { headers: { 'X-API-Key': apiKey } });
      setElapsed(Date.now() - t0);
      setResponse({ data: res.data, status: res.status });
    } catch (err) {
      setElapsed(Date.now() - t0);
      setResponse({ error: err.response?.data || err.message, status: err.response?.status });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="playground" className="py-16 px-4 max-w-3xl mx-auto">
      <div className="text-center mb-10">
        <p className="text-xs font-mono text-brand-400 tracking-widest uppercase mb-3">Try it live</p>
        <h2 className="font-display font-extrabold text-4xl text-white mb-4">
          API <span className="text-gradient">Playground</span>
        </h2>
        <p className="text-slate-400 text-sm">Test the chat endpoint right here — bring your own key.</p>
      </div>

      <div className="card-glass rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <Terminal size={16} className="text-brand-400" />
          <span className="font-display font-semibold text-sm text-white">POST /api/v1/chat</span>
          <span className="ml-auto text-[10px] bg-brand-500/15 text-brand-300 px-2 py-0.5 rounded-full font-mono">LIVE</span>
        </div>

        {/* API key */}
        <div className="mb-3">
          <label className="block text-[11px] text-slate-500 font-mono uppercase tracking-wider mb-1.5">API Key</label>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="uhb_your_api_key_here"
            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-300 placeholder-slate-700 focus:outline-none focus:border-brand-500/40 transition-all" />
        </div>

        {/* Message body */}
        <div className="mb-4">
          <label className="block text-[11px] text-slate-500 font-mono uppercase tracking-wider mb-1.5">Message</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-300 placeholder-slate-700 focus:outline-none focus:border-brand-500/40 transition-all resize-none" />
        </div>

        <button onClick={run} disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-all disabled:opacity-60 mb-4">
          {loading ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
          {loading ? 'Sending…' : 'Send Request'}
        </button>

        {response && (
          <div className="animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-slate-500 font-mono">Response</span>
              {response.status && (
                <span className={`font-mono text-xs px-2 py-0.5 rounded ${response.status >= 400 ? 'text-red-400 bg-red-900/30' : 'text-emerald-400 bg-emerald-900/30'}`}>
                  {response.status}
                </span>
              )}
              {elapsed && <span className="text-[10px] text-slate-600 ml-auto font-mono">{elapsed}ms</span>}
            </div>
            <pre className="bg-black/40 border border-white/5 rounded-xl p-3 text-[11px] font-mono text-slate-300 overflow-auto max-h-48 scrollbar-hide">
              {JSON.stringify(response.data || response.error, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}
