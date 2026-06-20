import React from 'react';
import { Link } from 'react-router-dom';
import { Zap, Github, Twitter } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-surface-950/80 backdrop-blur-xl mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
                <Zap size={16} className="text-white" />
              </div>
              <span className="font-display font-bold text-white">Universal API Hub</span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
              One platform to access, manage, and scale all your AI APIs. Built for developers.
            </p>
            <div className="flex gap-3 mt-4">
              <a href="#" className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all">
                <Github size={16} />
              </a>
              <a href="#" className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all">
                <Twitter size={16} />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-display font-semibold text-white text-sm mb-3">Product</h4>
            <ul className="space-y-2">
              {['Features', 'Pricing', 'Changelog', 'Status'].map((l) => (
                <li key={l}><a href={`#${l.toLowerCase()}`} className="text-sm text-slate-500 hover:text-white transition-colors">{l}</a></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold text-white text-sm mb-3">Company</h4>
            <ul className="space-y-2">
              {['Docs', 'Contact', 'Privacy', 'Terms'].map((l) => (
                <li key={l}><a href="#" className="text-sm text-slate-500 hover:text-white transition-colors">{l}</a></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-600">© {new Date().getFullYear()} Universal API Hub. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/login"  className="text-xs text-slate-500 hover:text-white transition-colors">Sign in</Link>
            <Link to="/signup" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">Get started →</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
