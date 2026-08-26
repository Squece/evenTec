import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import Spinner from './components/Spinner';

import Login from './pages/auth/Login';
import CadastroAluno from './pages/auth/CadastroAluno';
import CadastroOrganizador from './pages/auth/CadastroOrganizador';
import ConfirmarIdentidade from './pages/auth/ConfirmarIdentidade';
import CompletarPerfilGoogle from './pages/auth/CompletarPerfilGoogle';

import ListaEventos from './pages/aluno/ListaEventos';
import DetalheEvento from './pages/aluno/DetalheEvento';
import MinhasInscricoes from './pages/aluno/MinhasInscricoes';
import Certificados from './pages/aluno/Certificados';

import ListaEventosOrganizador from './pages/organizador/ListaEventosOrganizador';
import FormularioEvento from './pages/organizador/FormularioEvento';
import PainelInscritos from './pages/organizador/PainelInscritos';
import ScannerQRCode from './pages/organizador/ScannerQRCode';

import VerificarCertificado from './pages/publico/VerificarCertificado';
import NotFound from './pages/NotFound';

function Raiz() {
  const { usuario, perfil, carregando } = useAuth();
  if (carregando) return <Spinner />;
  if (!usuario) return <Navigate to="/login" replace />;
  if (!perfil) return <Navigate to="/completar-perfil" replace />;
  if (perfil.role === 'organizador') return <Navigate to="/organizador/eventos" replace />;
  return <Navigate to="/eventos" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro/aluno" element={<CadastroAluno />} />
        <Route path="/cadastro/organizador" element={<CadastroOrganizador />} />
        <Route path="/verificar-certificado" element={<VerificarCertificado />} />

        <Route element={<Layout />}>
          <Route path="/" element={<Raiz />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/completar-perfil" element={<CompletarPerfilGoogle />} />
            <Route path="/confirmar-identidade" element={<ConfirmarIdentidade />} />
          </Route>

          <Route element={<ProtectedRoute role="aluno" />}>
            <Route path="/eventos" element={<ListaEventos />} />
            <Route path="/eventos/:id" element={<DetalheEvento />} />
            <Route path="/minhas-inscricoes" element={<MinhasInscricoes />} />
            <Route path="/certificados" element={<Certificados />} />
          </Route>

          <Route element={<ProtectedRoute role="organizador" />}>
            <Route path="/organizador/eventos" element={<ListaEventosOrganizador />} />
            <Route path="/organizador/eventos/novo" element={<FormularioEvento />} />
            <Route path="/organizador/eventos/:id/editar" element={<FormularioEvento />} />
            <Route path="/organizador/eventos/:id/inscritos" element={<PainelInscritos />} />
            <Route path="/organizador/eventos/:id/scanner" element={<ScannerQRCode />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
