import { useState, type FormEvent } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Campo } from '../../components/Campo';
import { Feedback } from '../../components/Feedback';

export default function VerificarCertificado() {
  const [codigo, setCodigo] = useState('');
  const [valido, setValido] = useState<boolean | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function verificar(e: FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    setValido(null);
    try {
      // Certificado é lido direto do Firestore (allow read: if true em
      // `certificates` — comprovante de participação é feito pra ser
      // conferido por qualquer pessoa que tenha o código).
      const q = query(collection(db, 'certificates'), where('codigoValidacao', '==', codigo.trim()));
      const snap = await getDocs(q);
      setValido(!snap.empty);
    } catch {
      setErro('Não foi possível verificar agora. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-8 px-4 space-y-4">
      <h1 className="text-2xl font-bold text-center">Verificar certificado</h1>
      <p className="text-sm text-slate-600 text-center">
        Digite o código de validação impresso no certificado pra confirmar sua autenticidade.
      </p>
      <form onSubmit={verificar} className="space-y-4">
        <Campo label="Código de validação" value={codigo} onChange={setCodigo} required />
        <button
          type="submit"
          disabled={carregando}
          className="w-full bg-blue-600 text-white rounded-md py-2.5 font-medium disabled:opacity-60"
        >
          {carregando ? 'Verificando…' : 'Verificar'}
        </button>
      </form>
      {erro && <Feedback tipo="erro" mensagem={erro} />}
      {valido !== null && (
        <Feedback
          tipo={valido ? 'sucesso' : 'erro'}
          mensagem={valido ? 'Certificado válido e autêntico.' : 'Certificado não encontrado ou inválido.'}
        />
      )}
    </div>
  );
}
