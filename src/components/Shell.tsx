import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, ClipboardCheck, CalendarDays, Trophy, GraduationCap, FileSignature,
  User, LogOut, Sun, Moon, Users, Upload, Megaphone, BookOpen, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { useTenant } from '../lib/tenant';
import SubjectPicker from './SubjectPicker';
import { useTeacherSubject } from '../lib/teacherSubject';

type NavItem = { to: string; label: string; icon: any; roles?: ('student' | 'teacher' | 'admin' | 'parent')[] };
const NAV: NavItem[] = [
  { to: '/dashboard',      label: 'Home',       icon: Home },
  { to: '/erp-ai',         label: 'ERP AI',     icon: Sparkles, roles: ['student'] },
  { to: '/attendance',     label: 'Attendance', icon: ClipboardCheck, roles: ['teacher','admin'] },
  { to: '/timetable',      label: 'Timetable',  icon: CalendarDays },
  { to: '/notes',          label: 'Notes',      icon: BookOpen },
  { to: '/notices',        label: 'Notices',    icon: Megaphone },
  { to: '/leaderboard',    label: 'Ranks',      icon: Trophy },
  { to: '/directory',      label: 'Directory',  icon: Users },
  { to: '/leave',          label: 'Leave',      icon: FileSignature },
  { to: '/academics',      label: 'Academics',  icon: GraduationCap, roles: ['student','parent','teacher'] },
  { to: '/admin/students', label: 'Students',   icon: Users, roles: ['admin'] },
  { to: '/admin/teachers', label: 'Teachers',   icon: User, roles: ['admin'] },
  { to: '/admin/timetable',label: 'Set Timetable', icon: CalendarDays, roles: ['admin'] },
  { to: '/import',         label: 'Import',     icon: Upload, roles: ['admin'] },
  { to: '/profile',        label: 'Profile',    icon: User }
];

export default function Shell() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { findCollege } = useTenant();
  const { needsChoice: teacherNeedsSubject, clear: clearSubject } = useTeacherSubject();

  const items = NAV.filter(n => !n.roles || n.roles.includes(user?.role as any));
  const bottomItems = items.slice(0, 5);

  const college = user?.college_id ? findCollege(user.college_id) : undefined;
  const roleTag = user?.role === 'student'
    ? `${user.student?.course ?? ''} · Sem ${user.student?.semester ?? ''} · ${user.student?.section ?? ''}`
    : user?.role === 'teacher' ? 'Faculty'
    : user?.role === 'admin'   ? 'Admin'
    : user?.role === 'parent'  ? 'Parent'
    : '';

  const doLogout = async () => {
    clearSubject();
    await logout();
    nav('/welcome');
  };

  return (
    <div className="min-h-dvh flex">
      {/* Sidebar (desktop / tablet) */}
      <aside className="hidden md:flex w-[240px] lg:w-[260px] shrink-0 flex-col gap-2 p-4 lg:p-5 sticky top-0 h-dvh">
        <Brand college={college?.short}/>
        <nav className="mt-4 flex flex-col gap-1.5 overflow-y-auto no-scrollbar">
          {items.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[14px] lg:text-[15px] font-medium transition
                 ${isActive ? 'bg-white/80 dark:bg-white/10 shadow-soft border border-white/70 dark:border-white/10'
                            : 'hover:bg-white/60 dark:hover:bg-white/5 text-black/70 dark:text-white/70'}`}
            >
              <n.icon size={18} className="opacity-80 shrink-0"/>
              <span className="clip-1">{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto card !p-3">
          <div className="flex items-center gap-2 min-w-0">
            {user?.photo && <img src={user.photo} className="h-9 w-9 rounded-xl border border-white/60 bg-white shrink-0"/>}
            <div className="min-w-0">
              <div className="text-xs opacity-70">Signed in</div>
              <div className="font-semibold text-sm clip-1">{user?.displayName ?? '—'}</div>
              <div className="text-[10px] opacity-60 clip-1">{user?.id} · {roleTag}</div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={toggle} className="chip justify-center">
              {theme === 'dark' ? <Sun size={12}/> : <Moon size={12}/>} {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button onClick={doLogout} className="chip justify-center !text-ios-red">
              <LogOut size={12}/> Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-40">
          <div className="mx-3 mt-3 rounded-3xl glass px-3 py-2.5 flex items-center justify-between gap-2 min-w-0">
            <Brand small college={college?.short}/>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={toggle} className="h-9 w-9 rounded-full glass grid place-items-center" aria-label="Toggle theme">
                {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
              </button>
              {/* Profile shortcut — always one tap away for every role */}
              <button
                onClick={() => nav('/profile')}
                className="h-9 w-9 rounded-full glass grid place-items-center overflow-hidden ring-1 ring-white/30"
                aria-label="Open profile"
                title="Profile"
              >
                {user?.photo
                  ? <img src={user.photo} className="h-full w-full object-cover"/>
                  : <User size={16}/>}
              </button>
              <button onClick={doLogout} className="h-9 w-9 rounded-full glass grid place-items-center text-ios-red" aria-label="Log out">
                <LogOut size={16}/>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0 px-3 sm:px-4 md:px-8 pt-4 md:pt-8" style={{ paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={loc.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
              className="min-w-0"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Mobile bottom bar — full-width glass with safe area */}
        <div className="md:hidden fixed left-0 right-0 z-40 px-3" style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="glass rounded-3xl px-1.5 py-1.5 flex items-center justify-between">
            {bottomItems.map(n => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `flex-1 min-w-0 flex flex-col items-center gap-0.5 py-1.5 rounded-2xl text-[10px] font-medium
                   ${isActive ? 'text-ios-blue bg-white/70 dark:bg-white/10' : 'text-black/60 dark:text-white/60'}`}
              >
                <n.icon size={18}/>
                <span className="clip-1 max-w-[54px]">{n.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </main>

      {/* Teacher subject-selection gate (overlay whenever a teacher hasn't picked) */}
      <SubjectPicker open={user?.role === 'teacher' && teacherNeedsSubject} />
    </div>
  );
}

/* ---------- Brand: clean logo + college subtitle ---------- */
function Brand({ small = false, college }: { small?: boolean; college?: string }) {
  const displayCollege = college && college.trim() ? college : 'Universal College Platform';
  const size = small ? 'h-10 w-10' : 'h-12 w-12';
  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <div className={`${size} shrink-0 rounded-2xl overflow-hidden shadow-hi ring-1 ring-white/15 bg-gradient-to-br from-ios-blue to-ios-indigo grid place-items-center`}>
        <img
          src="/brand-icon.png?v=5"
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className={`font-bold tracking-tight text-transparent bg-clip-text clip-1
            ${small ? 'text-[15px]' : 'text-[17px]'}`}
          style={{ backgroundImage: 'linear-gradient(135deg,#307DFF 0%,#3C3DFF 55%,#7F23FF 100%)' }}>
          Campus&nbsp;ERP
        </div>
        <div className="text-[11px] opacity-70 clip-1 mt-0.5 font-medium">
          {displayCollege}
        </div>
      </div>
    </div>
  );
}

/* Kept for compatibility with existing imports (Welcome/LoginShell/SuperAdmin). */
export function GradCapIcon({ size = 24 }: { size?: number }) {
  return <img src="/brand-icon.png?v=5" alt="" width={size} height={size} className="rounded-[22%]" style={{ display: 'block' }} />;
}
