import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { Feedback } from '../../components/Feedback';
import { Campo } from '../../components/Campo';
import { mensagemDeErro } from '../../lib/erros';

export default function CadastroOrganizador() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const credencial = await createUserWithEmailAndPassword(auth, email, senha);
      await updateProfile(credencial.user, { displayName: nome });
      await setDoc(doc(db, 'users', credencial.user.uid), {
        uid: credencial.user.uid,
        role: 'organizador',
        nome,
        email,
        telefone,
        criadoEm: serverTimestamp(),
      });
      // Sem custom claims (não tem Cloud Function pra setar): o papel vem
      // direto do documento do Firestore, que o listener do AuthContext já
      // pega quase na hora (latency compensation do próprio SDK) — não
      // precisa esperar nada externo propagar.
      navigate('/organizador/eventos');
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-8 px-4">
      <h1 className="text-2xl font-bold mb-6 text-center">Cadastro do organizador</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Campo label="Nome" value={nome} onChange={setNome} required autoComplete="name" />
        <Campo label="E-mail" type="email" value={email} onChange={setEmail} required autoComplete="email" />
        <Campo
          label="Telefone (com DDD)"
          value={telefone}
          onChange={setTelefone}
          required
          placeholder="11999998888"
          autoComplete="tel"
        />
        <Campo
          label="Senha"
          type="password"
          value={senha}
          onChange={setSenha}
          required
          autoComplete="new-password"
        />
        {erro && <Feedback tipo="erro" mensagem={erro} />}
        <button
          type="submit"
          disabled={enviando}
          className="w-full bg-blue-600 text-white rounded-md py-2.5 font-medium disabled:opacity-60"
        >
          {enviando ? 'Cadastrando…' : 'Cadastrar'}
        </button>
      </form>
      <p className="text-sm text-center mt-4">
        Já tem conta?{' '}
        <Link to="/login" className="text-blue-600 underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
