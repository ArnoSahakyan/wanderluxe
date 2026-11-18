import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store';
import { ROUTES } from '../../shared';

export const UnprotectedRoute = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  if (!isAuthenticated) return <Outlet />;
  // "Try as admin" (sign-in page) lands in the admin area; everyone else on their profile.
  const home = user?.demo && user.role === 'admin' ? ROUTES.ADMIN_DASHBOARD : ROUTES.PROFILE;
  return <Navigate to={home} replace />;
};
