import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Zap } from 'lucide-react';

export default function Hero() {
  return (
    <section className="relative pt-28 pb-24 px-4 text-center overflow-hidden">
      {/* Ambient glow blobs */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-brand-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-20 left-1/4 w-[300px] h-[300px] bg-purple-600/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-20 right-1/4 w-[300px] h-[300px] bg-cyan-600/6 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-4xl mx-auto">
        {/* Eyebrow */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-300 text-xs font-medium font-mono mb-6 animate-fade-in">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-slow" />
          Now in public beta — free forever tier available
        </div>

        {/* Headline */}
        <h1 className="font-display font-extrabold text-5xl sm:text-6xl lg:text-7xl text-white leading-[1.08] tracking-tight mb-6 animate-fade-up">
          One Hub for<br />
          <span className="text-gradient">Every API</span>
        </h1>

        <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed mb-10 animate-fade-up" style={{ animationDelay: '0.1s' }}>
          Access, manage, and scale AI, weather, news, and data APIs from a single platform — with built-in key management, usage analytics, and plan-based rate limits.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <Link to="/signup"
            className="flex items-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white font-semibold text-sm shadow-lg shadow-brand-900/50 transition-all hover:scale-105 glow-md">
            Get Started Free <ArrowRight size={16} />
          </Link>
          <a href="#pricing"
            className="flex items-center gap-2 px-7 py-3.5 rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 text-sm font-medium transition-all">
            View Pricing
          </a>
        </div>

        {/* Social proof strip */}
        <div className="mt-14 flex flex-wrap items-center justify-center gap-8 text-xs text-slate-600 animate-fade-in" style={{ animationDelay: '0.4s' }}>
          {['No credit card required', 'Open source friendly', 'Rate-limited & secure', 'GDPR compliant'].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <Zap size={11} className="text-brand-500" />{t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
