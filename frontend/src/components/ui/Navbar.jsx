import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PLANS } from '../../utils/constants';
import { Zap, LayoutDashboard, Globe, LogOut, Menu, X, ChevronDown } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  if (!user) return null;

  const plan = PLANS[user.plan] || PLANS.free;
  const isActive = (p) => location.pathname === p;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className={`sticky top-0 z-50 border-b transition-all duration-300 ${
      scrolled
        ? 'border-white/8 bg-surface-950/90 backdrop-blur-xl shadow-lg shadow-black/20'
        : 'border-white/5 bg-surface-950/70 backdrop-blur-md'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center glow-brand group-hover:scale-105 transition-transform">
              <Zap size={16} className="text-white" />
            </div>
            <span className="font-display text-lg font-bold text-white hidden sm:block">
              Universal<span className="text-gradient"> API Hub</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            <NavLink to="/dashboard" active={isActive('/dashboard')} icon={<LayoutDashboard size={15} />}>
              Dashboard
            </NavLink>
            <NavLink to="/apis" active={isActive('/apis')} icon={<Globe size={15} />}>
              APIs
            </NavLink>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            <span className={`hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${plan.badge}`}>
              {plan.name}
            </span>

            {/* User dropdown */}
            <div className="relative">
              <button
                onClick={() => setDropOpen(!dropOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-sm text-slate-300"
              >
                <div className="w-7 h-7 rounded-full bg-brand-600/30 border border-brand-500/40 flex items-center justify-center text-brand-300 text-xs font-bold">
                  {user.username?.[0]?.toUpperCase() || 'U'}
                </div>
                <span className="hidden sm:block max-w-[100px] truncate">{user.username}</span>
                <ChevronDown size={13} className={`transition-transform ${dropOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDropOpen(false)} />
                  <div className="absolute right-0 mt-2 w-44 card-glass rounded-xl shadow-xl py-1 border border-white/10 z-20 animate-fade-in">
                    <div className="px-3 py-2 border-b border-white/10">
                      <p className="text-xs text-slate-400 truncate">{user.email}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-white/5"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/5 py-3 space-y-1 animate-fade-in">
            <MobileLink to="/dashboard" icon={<LayoutDashboard size={16} />} onClick={() => setMobileOpen(false)}>
              Dashboard
            </MobileLink>
            <MobileLink to="/apis" icon={<Globe size={16} />} onClick={() => setMobileOpen(false)}>
              API Selection
            </MobileLink>
          </div>
        )}
      </div>
    </nav>
  );
}

const NavLink = ({ to, active, icon, children }) => (
  <Link
    to={to}
    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
      active ? 'bg-brand-600/20 text-brand-300' : 'text-slate-400 hover:text-white hover:bg-white/5'
    }`}
  >
    {icon}
    {children}
  </Link>
);

const MobileLink = ({ to, icon, onClick, children }) => (
  <Link to={to} onClick={onClick} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/5">
    {icon}
    {children}
  </Link>
);