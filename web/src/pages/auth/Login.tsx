import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { Feedback } from '../../components/Feedback';
import { Campo } from '../../components/Campo';
import { mensagemDeErro } from '../../lib/erros';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await signInWithEmailAndPassword(auth, email, senha);
      navigate('/');
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  async function entrarComGoogle() {
    setErro(null);
    setEnviando(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      // Se for a primeira vez, ainda não existe doc em `users` — o
      // ProtectedRoute/Raiz redireciona sozinho pra completar o cadastro.
      navigate('/');
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-8 px-4">
      <h1 className="text-2xl font-bold mb-6 text-center">Entrar no evenTec</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Campo label="E-mail" type="email" value={email} onChange={setEmail} required autoComplete="email" />
        <Campo
          label="Senha"
          type="password"
          value={senha}
          onChange={setSenha}
          required
          autoComplete="current-password"
        />
        {erro && <Feedback tipo="erro" mensagem={erro} />}
        <button
          type="submit"
          disabled={enviando}
          className="w-full bg-blue-600 text-white rounded-md py-2.5 font-medium disabled:opacity-60"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <div className="flex items-center gap-3 my-4">
        <div className="h-px bg-slate-200 flex-1" />
        <span className="text-xs text-slate-500">ou</span>
        <div className="h-px bg-slate-200 flex-1" />
      </div>

      <button
        onClick={entrarComGoogle}
        disabled={enviando}
        className="w-full border border-slate-300 rounded-md py-2.5 font-medium flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <GoogleIcon />
        Entrar com Google
      </button>

      <p className="text-sm text-center mt-4 space-x-2">
        <Link to="/cadastro/aluno" className="text-blue-600 underline">
          Sou aluno
        </Link>
        <span>·</span>
        <Link to="/cadastro/organizador" className="text-blue-600 underline">
          Sou organizador
        </Link>
      </p>
      <p className="text-xs text-center mt-3">
        <Link to="/verificar-certificado" className="text-slate-500 underline">
          Verificar autenticidade de um certificado
        </Link>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}
