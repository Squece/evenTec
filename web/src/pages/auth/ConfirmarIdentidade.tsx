import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Feedback } from '../../components/Feedback';
import { Campo } from '../../components/Campo';
import { confirmarCodigo, enviarCodigoConfirmacao } from '../../lib/worker';

export default function ConfirmarIdentidade() {
  const { usuario, perfil } = useAuth();
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (perfil?.telefoneVerificado) navigate('/eventos', { replace: true });
  }, [perfil, navigate]);

  async function enviarCodigo() {
    if (!perfil?.emailInstitucional) {
      setMensagem({ tipo: 'erro', texto: 'Seu perfil não tem e-mail institucional cadastrado.' });
      return;
    }
    setCarregando(true);
    setMensagem(null);
    const sucesso = await enviarCodigoConfirmacao(perfil.emailInstitucional);
    setEnviado(sucesso);
    setMensagem(
      sucesso
        ? { tipo: 'sucesso', texto: 'Código enviado! Confira seu e-mail institucional.' }
        : { tipo: 'erro', texto: 'Não foi possível enviar o código. Tente novamente.' }
    );
    setCarregando(false);
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!usuario) return;
    setCarregando(true);
    setMensagem(null);
    try {
      const confere = await confirmarCodigo(codigo);
      if (!confere) {
        setMensagem({ tipo: 'erro', texto: 'Código incorreto ou expirado.' });
        return;
      }
      // O Worker já validou o código (ver worker/src/index.ts); sem um
      // backend Firebase rodando, é o próprio cliente que grava o
      // resultado — firestore.rules permite esse campo específico.
      await updateDoc(doc(db, 'users', usuario.uid), { telefoneVerificado: true });
      navigate('/eventos', { replace: true });
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Não foi possível confirmar agora. Tente novamente.' });
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-8 px-4 space-y-4">
      <h1 className="text-2xl font-bold text-center">Confirme sua identidade</h1>
      <p className="text-sm text-slate-600 text-center">
        Enviamos um código de 6 dígitos pro seu e-mail institucional
        {perfil?.emailInstitucional ? ` (${perfil.emailInstitucional})` : ''} pra confirmar seu cadastro.
      </p>

      {!enviado ? (
        <button
          onClick={enviarCodigo}
          disabled={carregando}
          className="w-full bg-blue-600 text-white rounded-md py-2.5 font-medium disabled:opacity-60"
        >
          {carregando ? 'Enviando…' : 'Enviar código por e-mail'}
        </button>
      ) : (
        <form onSubmit={confirmar} className="space-y-4">
          <Campo label="Código recebido" value={codigo} onChange={setCodigo} required placeholder="000000" />
          <button
            type="submit"
            disabled={carregando}
            className="w-full bg-blue-600 text-white rounded-md py-2.5 font-medium disabled:opacity-60"
          >
            {carregando ? 'Confirmando…' : 'Confirmar'}
          </button>
          <button type="button" onClick={enviarCodigo} className="w-full text-sm text-blue-600 underline">
            Reenviar código
          </button>
        </form>
      )}

      {mensagem && <Feedback tipo={mensagem.tipo} mensagem={mensagem.texto} />}
    </div>
  );
}
