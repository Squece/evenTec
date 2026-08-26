import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { EventDoc, RegistrationDoc } from '../../types/models';
import { Feedback } from '../../components/Feedback';
import Spinner from '../../components/Spinner';
import { formatarDataHora } from '../../lib/formato';
import { notificarConfirmacaoInscricao } from '../../lib/worker';

export default function DetalheEvento() {
  const { id } = useParams<{ id: string }>();
  const { usuario } = useAuth();
  const [evento, setEvento] = useState<EventDoc | null | undefined>(undefined);
  const [inscricao, setInscricao] = useState<RegistrationDoc | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [processando, setProcessando] = useState(false);

  // ID determinístico (ver firestore.rules): evita duas inscrições ativas
  // do mesmo aluno no mesmo evento e permite reaproveitar o doc ao cancelar
  // e se inscrever de novo.
  const registrationId = id && usuario ? `${id}_${usuario.uid}` : null;

  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, 'events', id), (snap) => {
      setEvento(snap.exists() ? (snap.data() as EventDoc) : null);
    });
  }, [id]);

  useEffect(() => {
    if (!registrationId) return;
    return onSnapshot(doc(db, 'registrations', registrationId), (snap) => {
      setInscricao(snap.exists() ? (snap.data() as RegistrationDoc) : null);
    });
  }, [registrationId]);

  async function inscrever() {
    if (!id || !usuario || !registrationId) return;
    setProcessando(true);
    setMensagem(null);
    try {
      // Capacidade era checada numa transação de Cloud Function; agora é a
      // própria transação do cliente + a regra em firestore.rules que
      // garante atomicidade (se a regra rejeitar, a transação inteira
      // falha, ninguém fica "meio inscrito").
      await runTransaction(db, async (tx) => {
        const eventoRef = doc(db, 'events', id);
        const eventoSnap = await tx.get(eventoRef);
        const eventoAtual = eventoSnap.data() as EventDoc;
        if (eventoAtual.capacidade != null && eventoAtual.vagasOcupadas >= eventoAtual.capacidade) {
          throw new Error('lotado');
        }
        tx.set(doc(db, 'registrations', registrationId), {
          eventId: id,
          userId: usuario.uid,
          status: 'inscrito',
          criadoEm: serverTimestamp(),
        });
        tx.update(eventoRef, { vagasOcupadas: eventoAtual.vagasOcupadas + 1 });
      });
      setMensagem({ tipo: 'sucesso', texto: 'Inscrição confirmada!' });
      void notificarConfirmacaoInscricao(evento?.titulo ?? '', `${window.location.origin}/minhas-inscricoes`);
    } catch (err) {
      const lotadoAgora = err instanceof Error && err.message === 'lotado';
      setMensagem({
        tipo: 'erro',
        texto: lotadoAgora ? 'Esse evento acabou de lotar.' : 'Não foi possível se inscrever. Tente novamente.',
      });
    } finally {
      setProcessando(false);
    }
  }

  async function cancelar() {
    if (!id || !registrationId) return;
    setProcessando(true);
    setMensagem(null);
    try {
      await runTransaction(db, async (tx) => {
        const eventoRef = doc(db, 'events', id);
        const eventoSnap = await tx.get(eventoRef);
        const eventoAtual = eventoSnap.data() as EventDoc;
        tx.update(doc(db, 'registrations', registrationId), { status: 'cancelado' });
        tx.update(eventoRef, { vagasOcupadas: eventoAtual.vagasOcupadas - 1 });
      });
      setMensagem({ tipo: 'sucesso', texto: 'Inscrição cancelada.' });
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Não foi possível cancelar agora.' });
    } finally {
      setProcessando(false);
    }
  }

  if (evento === undefined) return <Spinner />;
  if (evento === null) return <p>Evento não encontrado.</p>;

  const inscrito = inscricao && inscricao.status !== 'cancelado';
  const lotado = evento.capacidade != null && evento.vagasOcupadas >= evento.capacidade;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-bold">{evento.titulo}</h1>
      <p className="text-slate-700 whitespace-pre-line">{evento.descricao}</p>
      <dl className="text-sm text-slate-600 space-y-1">
        <div>
          <dt className="inline font-medium">Quando: </dt>
          <dd className="inline">{formatarDataHora(evento.dataHora)}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Onde: </dt>
          <dd className="inline">
            {evento.local} ({evento.modalidade})
          </dd>
        </div>
        {evento.cargaHoraria != null && (
          <div>
            <dt className="inline font-medium">Carga horária: </dt>
            <dd className="inline">{evento.cargaHoraria}h</dd>
          </div>
        )}
        {evento.capacidade != null && (
          <div>
            <dt className="inline font-medium">Vagas: </dt>
            <dd className="inline">{Math.max(evento.capacidade - evento.vagasOcupadas, 0)} restante(s)</dd>
          </div>
        )}
      </dl>

      {mensagem && <Feedback tipo={mensagem.tipo} mensagem={mensagem.texto} />}

      {inscricao?.status === 'presente' ? (
        <p className="text-green-700 font-medium">Presença confirmada neste evento. ✔</p>
      ) : inscrito ? (
        <div className="space-y-2">
          <p className="text-blue-700 font-medium">Você está inscrito neste evento.</p>
          <Link to="/minhas-inscricoes" className="block text-sm text-blue-600 underline">
            Ver meu QR Code
          </Link>
          <button
            onClick={cancelar}
            disabled={processando}
            className="w-full border border-red-300 text-red-700 rounded-md py-2 font-medium disabled:opacity-60"
          >
            Cancelar inscrição
          </button>
        </div>
      ) : lotado ? (
        <p className="text-red-700 font-medium">Evento lotado.</p>
      ) : (
        <button
          onClick={inscrever}
          disabled={processando}
          className="w-full bg-blue-600 text-white rounded-md py-2.5 font-medium disabled:opacity-60"
        >
          {processando ? 'Inscrevendo…' : 'Inscrever-se'}
        </button>
      )}
    </div>
  );
}
