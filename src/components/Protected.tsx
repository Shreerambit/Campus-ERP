import { Navigate, useLocation } from 'react-router-dom';
import { Role, useAuth } from '../lib/auth';

const FORCE_CHANGE_ROLES: Role[] = ['student', 'teacher'];

export function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/welcome" replace state={{ from: loc.pathname }} />;
  if (roles && !roles.includes(user.role)) {
    if (user.role === 'super') return <Navigate to="/super" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  if (FORCE_CHANGE_ROLES.includes(user.role) && !user.passwordChanged && loc.pathname !== '/first-login') {
    return <Navigate to="/first-login" replace />;
  }
  // Students without a confirmed section (A/B) must pick one first.
  if (user.role === 'student' && user.student && !isValidSection(user.student.section)
      && loc.pathname !== '/pick-section') {
    return <Navigate to="/pick-section" replace />;
  }
  return <>{children}</>;
}

function isValidSection(s?: string | null) {
  return s === 'A' || s === 'B';
}

export function OnlyWhenLoggedOut({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user) {
    if (user.role === 'super') return <Navigate to="/super" replace />;
    if (FORCE_CHANGE_ROLES.includes(user.role) && !user.passwordChanged) return <Navigate to="/first-login" replace />;
    if (user.role === 'student' && user.student && !isValidSection(user.student.section)) {
      return <Navigate to="/pick-section" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
