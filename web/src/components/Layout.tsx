import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const LINKS_ALUNO = [
  { to: '/eventos', label: 'Eventos' },
  { to: '/minhas-inscricoes', label: 'Minhas inscrições' },
  { to: '/certificados', label: 'Certificados' },
];

const LINKS_ORGANIZADOR = [{ to: '/organizador/eventos', label: 'Meus eventos' }];

export function Layout() {
  const { usuario, perfil, sair } = useAuth();

  const links = perfil?.role === 'organizador' ? LINKS_ORGANIZADOR : perfil?.role === 'aluno' ? LINKS_ALUNO : [];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="bg-blue-600 text-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <span className="font-bold text-lg">evenTec</span>
          {usuario && (
            <nav className="flex flex-wrap gap-1 text-sm" aria-label="Navegação principal">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md ${isActive ? 'bg-white/20 font-semibold' : 'hover:bg-white/10'}`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              <button onClick={sair} className="px-3 py-1.5 rounded-md hover:bg-white/10">
                Sair
              </button>
            </nav>
          )}
        </div>
      </header>
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
