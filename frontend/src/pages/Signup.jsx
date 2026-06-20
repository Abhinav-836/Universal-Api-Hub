import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Zap, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import ThreeBackground from '../components/ThreeBackground';

const PW_CHECKS = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'Uppercase letter',       test: (v) => /[A-Z]/.test(v) },
  { label: 'Lowercase letter',       test: (v) => /[a-z]/.test(v) },
  { label: 'Number',                 test: (v) => /\d/.test(v) },
];

export default function Signup() {
  const { register, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm]       = useState({ email: '', username: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const failed = PW_CHECKS.filter((c) => !c.test(form.password));
    if (failed.length) { setError('Password does not meet all requirements.'); return; }
    setLoading(true);
    try {
      await register(form);
      await login({ email: form.email, password: form.password });
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.errors?.[0]?.msg || err.response?.data?.error || 'Registration failed.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-12 relative">
      <ThreeBackground />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 mb-4 glow-brand hover:scale-105 transition-transform">
            <Zap size={26} className="text-white" />
          </Link>
          <h1 className="font-display text-3xl font-bold text-white">Create account</h1>
          <p className="text-slate-400 mt-1.5 text-sm">Get your free API Hub account — no credit card needed</p>
        </div>

        <div className="card-glass rounded-2xl p-8">
          {error && (
            <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-6 text-sm text-red-400 animate-fade-in">
              <AlertCircle size={15} className="shrink-0" />{error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Email</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} required
                placeholder="you@example.com" className="input-base" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Username</label>
              <input type="text" name="username" value={form.username} onChange={handleChange} required
                placeholder="yourname" minLength={3} maxLength={30} pattern="[a-zA-Z0-9]+" className="input-base" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} name="password" value={form.password} onChange={handleChange} required
                  placeholder="Create a strong password" className="input-base pr-11" />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {form.password && (
                <div className="mt-3 grid grid-cols-2 gap-1.5 animate-fade-in">
                  {PW_CHECKS.map(({ label, test }) => (
                    <div key={label} className={`flex items-center gap-1.5 text-[11px] ${test(form.password) ? 'text-emerald-400' : 'text-slate-600'}`}>
                      <CheckCircle2 size={11} />{label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 rounded-xl mt-2">
              {loading
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><span>Create free account</span> <ArrowRight size={16} /></>}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">Sign in →</Link>
        </p>
      </div>
    </div>
  );
}
