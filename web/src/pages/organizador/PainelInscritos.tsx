import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { EventDoc, RegistrationDoc, UserProfile } from '../../types/models';
import { Feedback } from '../../components/Feedback';
import Spinner from '../../components/Spinner';
import { gerarCertificadoPdfBase64, gerarCodigoValidacao } from '../../lib/certificado';
import { enviarLembrete, notificarCertificado } from '../../lib/worker';

interface InscritoComPerfil {
  id: string;
  registro: RegistrationDoc;
  aluno: UserProfile | null;
}

export default function PainelInscritos() {
  const { id } = useParams<{ id: string }>();
  const { perfil } = useAuth();
  const [evento, setEvento] = useState<EventDoc | null | undefined>(undefined);
  const [inscritos, setInscritos] = useState<InscritoComPerfil[] | null>(null);
  const [fechando, setFechando] = useState(false);
  const [enviandoLembretes, setEnviandoLembretes] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, 'events', id), (snap) => {
      setEvento(snap.exists() ? (snap.data() as EventDoc) : null);
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'registrations'), where('eventId', '==', id));
    return onSnapshot(q, async (snap) => {
      const itens = await Promise.all(
        snap.docs
          .map((d) => ({ id: d.id, registro: d.data() as RegistrationDoc }))
          .filter((i) => i.registro.status !== 'cancelado')
          .map(async (i) => {
            const alunoSnap = await getDoc(doc(db, 'users', i.registro.userId));
            return { ...i, aluno: alunoSnap.exists() ? (alunoSnap.data() as UserProfile) : null };
          })
      );
      setInscritos(itens);
    });
  }, [id]);

  // Substitui a Cloud Function `closeEvent`: sem Blaze, o PDF é gerado aqui
  // mesmo no navegador do organizador (pdf-lib roda em browser) e salvo em
  // base64 no Firestore — sem Storage. firestore.rules confere que só um
  // organizador do evento cria certificado, e só pra quem está 'presente'.
  async function fecharEvento() {
    if (!id || !evento) return;
    if (!confirm('Encerrar o evento e gerar os certificados de quem está com presença confirmada?')) return;
    setFechando(true);
    setMensagem(null);
    try {
      const presentes = (inscritos ?? []).filter((i) => i.registro.status === 'presente' && i.aluno);
      let certificadosGerados = 0;

      for (const { id: registrationId, aluno } of presentes) {
        if (!aluno) continue;

        const certRef = doc(db, 'certificates', registrationId);
        const certSnap = await getDoc(certRef);
        if (certSnap.exists()) continue; // idempotente: já gerado numa tentativa anterior

        const codigoValidacao = gerarCodigoValidacao();
        const pdfBase64 = await gerarCertificadoPdfBase64({
          aluno: { nome: aluno.nome },
          evento: { titulo: evento.titulo, dataHora: evento.dataHora, cargaHoraria: evento.cargaHoraria },
          organizadorNome: perfil?.nome ?? 'Organizador',
          codigoValidacao,
        });

        await setDoc(certRef, {
          registrationId,
          eventId: id,
          userId: aluno.uid,
          codigoValidacao,
          pdfBase64,
          emitidoEm: serverTimestamp(),
        });

        void notificarCertificado({
          nome: aluno.nome,
          email: aluno.email,
          telefone: aluno.telefone,
          nomeEvento: evento.titulo,
        });

        certificadosGerados++;
      }

      await updateDoc(doc(db, 'events', id), { status: 'encerrado' });
      setMensagem({ tipo: 'sucesso', texto: `Evento encerrado. ${certificadosGerados} certificado(s) gerado(s).` });
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Não foi possível encerrar o evento.' });
    } finally {
      setFechando(false);
    }
  }

  // Substitui o lembrete automático diário (era Cloud Scheduler): sem
  // nenhum backend rodando, não tem como disparar isso sozinho num
  // horário fixo — o organizador aciona manualmente quando quiser.
  async function dispararLembretes() {
    if (!evento || !id) return;
    setEnviandoLembretes(true);
    setMensagem(null);
    try {
      const pendentes = (inscritos ?? []).filter((i) => i.registro.status === 'inscrito' && i.aluno);
      await Promise.all(
        pendentes.map((i) =>
          enviarLembrete({
            nome: i.aluno!.nome,
            email: i.aluno!.email,
            telefone: i.aluno!.telefone,
            nomeEvento: evento.titulo,
            linkApp: `${window.location.origin}/eventos/${id}`,
          })
        )
      );
      setMensagem({ tipo: 'sucesso', texto: `Lembrete enviado pra ${pendentes.length} inscrito(s).` });
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Não foi possível enviar os lembretes.' });
    } finally {
      setEnviandoLembretes(false);
    }
  }

  if (evento === undefined || inscritos === null) return <Spinner />;
  if (evento === null) return <p>Evento não encontrado.</p>;

  const presentes = inscritos.filter((i) => i.registro.status === 'presente').length;
  const podeGerenciar = evento.status === 'publicado' || evento.status === 'em_andamento';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">{evento.titulo} — inscritos</h1>
        {podeGerenciar && (
          <div className="flex flex-wrap gap-2">
            <Link to={`/organizador/eventos/${id}/scanner`} className="text-sm bg-slate-800 text-white rounded-md px-3 py-2">
              Scanner QR
            </Link>
            <button
              onClick={dispararLembretes}
              disabled={enviandoLembretes}
              className="text-sm bg-slate-200 text-slate-800 rounded-md px-3 py-2 disabled:opacity-60"
            >
              {enviandoLembretes ? 'Enviando…' : 'Enviar lembrete'}
            </button>
            <button
              onClick={fecharEvento}
              disabled={fechando}
              className="text-sm bg-red-600 text-white rounded-md px-3 py-2 disabled:opacity-60"
            >
              {fechando ? 'Encerrando…' : 'Encerrar evento'}
            </button>
          </div>
        )}
      </div>

      {mensagem && <Feedback tipo={mensagem.tipo} mensagem={mensagem.texto} />}

      <p className="text-sm text-slate-600">
        {presentes} de {inscritos.length} confirmado(s) presente(s)
      </p>

      {inscritos.length === 0 ? (
        <p className="text-slate-600">Ninguém se inscreveu ainda.</p>
      ) : (
        <ul className="divide-y border rounded-lg bg-white">
          {inscritos.map(({ id: regId, registro, aluno }) => (
            <li key={regId} className="p-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{aluno?.nome ?? 'Aluno'}</p>
                <p className="text-xs text-slate-500">{aluno?.email ?? '-'}</p>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                  registro.status === 'presente' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {registro.status === 'presente' ? 'Presente' : 'Aguardando'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
