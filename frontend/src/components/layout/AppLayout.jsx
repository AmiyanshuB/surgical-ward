import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';

const roleColors = { doctor: 'bg-blue-500', consultant: 'bg-purple-500', admin: 'bg-slate-500' };

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: 'grid' },
    ...(user?.role === 'admin' || user?.role === 'consultant' ? [{ to: '/admin', label: 'Admin', icon: 'admin' }] : []),
  ];

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-56 flex-shrink-0 bg-slate-900 flex-col border-r border-slate-800">
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            </div>
            <div>
              <div className="text-white text-sm font-semibold leading-tight">Surgical Ward</div>
              <div className="text-slate-500 text-xs">Monitoring</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => <SideNavItem key={item.to} item={item} />)}
        </nav>
        <div className="px-4 py-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold ${roleColors[user?.role] || 'bg-slate-500'}`}>{user?.full_name?.[0] || '?'}</div>
            <div className="min-w-0">
              <div className="text-white text-xs font-medium truncate">{user?.full_name}</div>
              <div className="text-slate-500 text-xs capitalize">{user?.role}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full text-left text-slate-400 hover:text-white text-xs flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-800 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-64 bg-slate-900 flex flex-col shadow-2xl">
            <div className="px-5 py-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                </div>
                <div>
                  <div className="text-white text-sm font-semibold">Surgical Ward</div>
                  <div className="text-slate-500 text-xs">Monitoring</div>
                </div>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white p-1">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {navItems.map(item => <SideNavItem key={item.to} item={item} onClick={() => setSidebarOpen(false)} />)}
            </nav>
            <div className="px-4 py-4 border-t border-slate-800">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold ${roleColors[user?.role] || 'bg-slate-500'}`}>{user?.full_name?.[0] || '?'}</div>
                <div>
                  <div className="text-white text-sm font-medium">{user?.full_name}</div>
                  <div className="text-slate-400 text-xs capitalize">{user?.role}</div>
                </div>
              </div>
              <button onClick={handleLogout} className="w-full text-left text-slate-400 hover:text-white text-sm flex items-center gap-2 py-2 px-2 rounded hover:bg-slate-800 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 bg-slate-900 border-b border-slate-800 flex-shrink-0" style={{paddingTop:'max(12px,env(safe-area-inset-top))',paddingBottom:'12px'}}>
          <button onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-white p-1 -ml-1">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M3 12h18M3 6h18M3 18h18" /></svg>
          </button>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            <span className="text-white text-sm font-semibold">
              {location.pathname === '/dashboard' ? 'Ward Dashboard'
                : location.pathname.startsWith('/patients') ? 'Patient Detail'
                : location.pathname === '/admin' ? 'Admin'
                : 'Ward Monitor'}
            </span>
          </div>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${roleColors[user?.role] || 'bg-slate-500'}`}>{user?.full_name?.[0] || '?'}</div>
        </header>

        {/* Scrollable content — extra bottom padding for mobile nav */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex z-40" style={{paddingBottom:'env(safe-area-inset-bottom)'}}>
          {navItems.map(item => {
            const isActive = location.pathname === item.to || (item.to === '/dashboard' && location.pathname.startsWith('/patients'));
            return (
              <NavLink key={item.to} to={item.to} className="flex-1 flex flex-col items-center justify-center py-3 gap-1">
                <span className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {item.icon === 'grid'
                    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="8" r="4"/><path strokeLinecap="round" d="M6 20v-2a6 6 0 0112 0v2"/></svg>}
                </span>
                <span className={`text-xs font-medium ${isActive ? 'text-emerald-400' : 'text-slate-500'}`}>{item.label}</span>
              </NavLink>
            );
          })}
          <button onClick={() => setSidebarOpen(true)} className="flex-1 flex flex-col items-center justify-center py-3 gap-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${roleColors[user?.role] || 'bg-slate-500'}`}>{user?.full_name?.[0] || '?'}</div>
            <span className="text-xs font-medium text-slate-500">Profile</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

function SideNavItem({ item, onClick }) {
  const icons = {
    grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    admin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/></svg>,
  };
  return (
    <NavLink to={item.to} onClick={onClick}
      className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
      <span className="w-4 h-4 flex-shrink-0">{icons[item.icon]}</span>
      {item.label}
    </NavLink>
  );
}