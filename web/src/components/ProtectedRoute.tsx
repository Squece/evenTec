import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Spinner from './Spinner';
import type { UserRole } from '../types/models';

interface ProtectedRouteProps {
  role?: UserRole;
}

export function ProtectedRoute({ role }: ProtectedRouteProps) {
  const { usuario, perfil, carregando } = useAuth();
  const location = useLocation();

  if (carregando) return <Spinner />;
  if (!usuario) return <Navigate to="/login" replace />;

  // Login com Google cria a conta no Firebase Auth mas não o doc em
  // `users` — sem ele não dá nem pra saber o papel. Manda completar o
  // cadastro antes de navegar pro resto do app.
  if (!perfil && location.pathname !== '/completar-perfil') {
    return <Navigate to="/completar-perfil" replace />;
  }

  if (role && perfil?.role !== role) return <Navigate to="/" replace />;

  // Aluno com identidade ainda não confirmada não navega pro resto do
  // app — exceto pra própria tela de confirmação, senão vira loop.
  if (
    perfil?.role === 'aluno' &&
    !perfil.telefoneVerificado &&
    location.pathname !== '/confirmar-identidade'
  ) {
    return <Navigate to="/confirmar-identidade" replace />;
  }

  return <Outlet />;
}
