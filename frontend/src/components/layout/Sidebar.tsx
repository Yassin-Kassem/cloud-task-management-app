import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  Columns3,
  FolderKanban,
  Users,
  LogOut,
  ChevronRight,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/board', label: 'Board', icon: Columns3 },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/teams', label: 'Teams', icon: Users },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-full w-[260px] flex-col bg-[hsl(var(--sidebar-bg))] text-[hsl(var(--sidebar-fg))]">
      <div className="flex h-16 items-center gap-3 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--sidebar-accent))]">
          <Columns3 className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-bold tracking-tight">Mini-Jira</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 pt-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                isActive
                  ? 'bg-[hsl(var(--sidebar-muted))] text-white'
                  : 'text-slate-400 hover:bg-[hsl(var(--sidebar-muted))] hover:text-white'
              }`}
            >
              <Icon className={`h-[18px] w-[18px] ${isActive ? 'text-[hsl(var(--sidebar-accent))]' : 'text-slate-500 group-hover:text-slate-300'}`} />
              {label}
              {isActive && <ChevronRight className="ml-auto h-4 w-4 text-slate-500" />}
            </Link>
          );
        })}
      </nav>

      {user && (
        <div className="border-t border-slate-700/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--sidebar-accent))]/20 text-sm font-semibold text-[hsl(var(--sidebar-accent))]">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-white">{user.displayName}</p>
              <p className="truncate text-xs text-slate-400">
                {user.role === 'MANAGER' ? 'Manager' : `Team: ${user.teamId}`}
              </p>
            </div>
            <button
              onClick={logout}
              className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
