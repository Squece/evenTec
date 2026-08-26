import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Campo } from '../../components/Campo';
import { Feedback } from '../../components/Feedback';
import type { UserRole } from '../../types/models';

// Login com Google não coleta RM/curso/papel — quem entra pela primeira
// vez por aqui passa por essa tela antes de qualquer outra coisa (ver
// ProtectedRoute: usuário autenticado sem doc em `users` cai aqui).
export default function CompletarPerfilGoogle() {
  const { usuario, perfil } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<UserRole>('aluno');
  const [nome, setNome] = useState(usuario?.displayName ?? '');
  const [curso, setCurso] = useState('');
  const [telefone, setTelefone] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (perfil) navigate('/', { replace: true });
  }, [perfil, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!usuario) return;
    setErro(null);
    setEnviando(true);
    try {
      await setDoc(doc(db, 'users', usuario.uid), {
        uid: usuario.uid,
        role,
        nome,
        ...(role === 'aluno' ? { curso } : {}),
        email: usuario.email ?? '',
        telefone,
        telefoneVerificado: false,
        criadoEm: serverTimestamp(),
      });
      navigate(role === 'aluno' ? '/confirmar-identidade' : '/organizador/eventos', { replace: true });
    } catch {
      setErro('Não foi possível salvar seu perfil. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-8 px-4">
      <h1 className="text-2xl font-bold mb-2 text-center">Só mais um passo</h1>
      <p className="text-sm text-slate-600 text-center mb-6">
        Complete seu cadastro pra continuar, {usuario?.email}.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset className="flex gap-4 text-sm justify-center">
          <label className="flex items-center gap-1">
            <input type="radio" checked={role === 'aluno'} onChange={() => setRole('aluno')} />
            Sou aluno
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={role === 'organizador'} onChange={() => setRole('organizador')} />
            Sou organizador
          </label>
        </fieldset>

        <Campo label="Nome completo" value={nome} onChange={setNome} required autoComplete="name" />

        {role === 'aluno' && <Campo label="Curso" value={curso} onChange={setCurso} required />}

        <Campo
          label="Telefone (com DDD)"
          value={telefone}
          onChange={setTelefone}
          required
          placeholder="11999998888"
          autoComplete="tel"
        />

        {erro && <Feedback tipo="erro" mensagem={erro} />}

        <button
          type="submit"
          disabled={enviando}
          className="w-full bg-blue-600 text-white rounded-md py-2.5 font-medium disabled:opacity-60"
        >
          {enviando ? 'Salvando…' : 'Continuar'}
        </button>
      </form>
    </div>
  );
}
