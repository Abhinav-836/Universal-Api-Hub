import React from 'react';
import ThreeBackground from '../components/ThreeBackground';
import Hero     from '../components/landing/Hero';
import Features from '../components/landing/Features';
import Playground from '../components/landing/Playground';
import Pricing  from '../components/landing/Pricing';
import Footer   from '../components/ui/Footer';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';

export default function Home() {
  return (
    <div className="relative min-h-screen">
      <ThreeBackground />

      {/* Public navbar */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-surface-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center glow-brand">
              <Zap size={16} className="text-white" />
            </div>
            <span className="font-display text-lg font-bold text-white">
              Universal<span className="text-gradient"> API Hub</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a href="#features" className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:block">Features</a>
            <a href="#pricing"  className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:block">Pricing</a>
            <Link to="/login"  className="text-sm text-slate-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5">Sign in</Link>
            <Link to="/signup" className="text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-lg px-4 py-1.5 font-medium transition-all">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <div className="relative z-10">
        <Hero />
        <Features />
        <Playground />
        <Pricing />
        <Footer />
      </div>
    </div>
  );
}
