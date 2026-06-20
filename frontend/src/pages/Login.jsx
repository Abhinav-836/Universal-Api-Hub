import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Zap, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';
import ThreeBackground from '../components/ThreeBackground';

export default function Login() {
  const { login, authAttempts } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form);
      navigate('/dashboard');
    } catch (err) {
      if (err.message?.includes('Too many login attempts')) {
        setError('⏳ Too many login attempts. Please wait 15 minutes.');
      } else {
        setError(err.response?.data?.error || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <ThreeBackground />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 mb-4 glow-brand hover:scale-105 transition-transform">
            <Zap size={26} className="text-white" />
          </Link>
          <h1 className="font-display text-3xl font-bold text-white">Welcome back</h1>
          <p className="text-slate-400 mt-1.5 text-sm">Sign in to your Universal API Hub account</p>
          {authAttempts > 2 && (
            <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
              ⚠️ Multiple login attempts detected. Please wait before trying again.
            </div>
          )}
        </div>

        <div className="card-glass rounded-2xl p-8">
          {error && (
            <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 mb-6 text-sm animate-fade-in ${
              error.includes('Too many') 
                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}>
              <AlertCircle size={15} className="shrink-0" />{error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="you@example.com"
                className="input-base"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  placeholder="••••••••"
                  className="input-base pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || authAttempts > 3}
              className="btn-primary w-full py-3 rounded-xl mt-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : authAttempts > 3 ? (
                'Too many attempts. Please wait.'
              ) : (
                <>
                  <span>Sign in</span> <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-sm text-slate-500">
          No account?{' '}
          <Link to="/signup" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
            Create one free →
          </Link>
        </p>
      </div>
    </div>
  );
}