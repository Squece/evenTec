import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { EventDoc, EventStatus, TipoDivulgacao, UserProfile } from '../../types/models';
import { Feedback } from '../../components/Feedback';
import { Campo } from '../../components/Campo';
import { paraDatetimeLocal } from '../../lib/formato';
import Spinner from '../../components/Spinner';

const PROXIMO_STATUS: Partial<Record<EventStatus, EventStatus>> = {
  rascunho: 'publicado',
  publicado: 'em_andamento',
};
const ROTULO_TRANSICAO: Partial<Record<EventStatus, string>> = {
  rascunho: 'Publicar evento',
  publicado: 'Marcar como em andamento',
};

export default function FormularioEvento() {
  const { id } = useParams<{ id: string }>();
  const editando = Boolean(id);
  const { usuario } = useAuth();
  const navigate = useNavigate();

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataHora, setDataHora] = useState('');
  const [local, setLocal] = useState('');
  const [modalidade, setModalidade] = useState<'presencial' | 'online'>('presencial');
  const [cargaHoraria, setCargaHoraria] = useState('');
  const [capacidade, setCapacidade] = useState('');
  const [tipoDivulgacao, setTipoDivulgacao] = useState<TipoDivulgacao>('imediata');
  const [dataDivulgacao, setDataDivulgacao] = useState('');
  const [cursosAlvo, setCursosAlvo] = useState('');
  const [lembretesAtivos, setLembretesAtivos] = useState(true);
  const [parceiroIds, setParceiroIds] = useState<string[]>([]);
  const [organizadoresDisponiveis, setOrganizadoresDisponiveis] = useState<UserProfile[]>([]);
  const [status, setStatus] = useState<EventStatus>('rascunho');

  const [carregando, setCarregando] = useState(editando);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'users'), where('role', '==', 'organizador'))).then((snap) => {
      setOrganizadoresDisponiveis(
        snap.docs.map((d) => d.data() as UserProfile).filter((o) => o.uid !== usuario?.uid)
      );
    });
  }, [usuario]);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'events', id)).then((snap) => {
      if (!snap.exists()) return;
      const evento = snap.data() as EventDoc;
      setTitulo(evento.titulo);
      setDescricao(evento.descricao);
      setDataHora(paraDatetimeLocal(evento.dataHora.toDate()));
      setLocal(evento.local);
      setModalidade(evento.modalidade);
      setCargaHoraria(evento.cargaHoraria != null ? String(evento.cargaHoraria) : '');
      setCapacidade(evento.capacidade != null ? String(evento.capacidade) : '');
      setTipoDivulgacao(evento.divulgacao?.tipo ?? 'imediata');
      setDataDivulgacao(evento.dataDivulgacao ? paraDatetimeLocal(evento.dataDivulgacao.toDate()) : '');
      setCursosAlvo((evento.divulgacao?.cursosAlvo ?? []).join(', '));
      setLembretesAtivos(evento.lembretesAtivos ?? true);
      setParceiroIds(evento.parceiros ?? []);
      setStatus(evento.status);
      setCarregando(false);
    });
  }, [id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!usuario) return;
    setSalvando(true);
    setMensagem(null);
    try {
      const dados = {
        titulo,
        descricao,
        dataHora: Timestamp.fromDate(new Date(dataHora)),
        local,
        modalidade,
        cargaHoraria: cargaHoraria ? Number(cargaHoraria) : undefined,
        capacidade: capacidade ? Number(capacidade) : undefined,
        parceiros: parceiroIds,
        divulgacao: {
          tipo: tipoDivulgacao,
          ...(tipoDivulgacao === 'segmentada'
            ? { cursosAlvo: cursosAlvo.split(',').map((c) => c.trim()).filter(Boolean) }
            : {}),
        },
        lembretesAtivos,
        ...(tipoDivulgacao === 'programada' && dataDivulgacao
          ? { dataDivulgacao: Timestamp.fromDate(new Date(dataDivulgacao)) }
          : {}),
      };

      if (editando && id) {
        await updateDoc(doc(db, 'events', id), dados);
      } else {
        await addDoc(collection(db, 'events'), {
          ...dados,
          vagasOcupadas: 0,
          status: tipoDivulgacao === 'imediata' ? 'publicado' : 'rascunho',
          organizadorId: usuario.uid,
          criadoEm: serverTimestamp(),
        });
      }
      navigate('/organizador/eventos');
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Não foi possível salvar o evento.' });
    } finally {
      setSalvando(false);
    }
  }

  async function avancarStatus() {
    if (!id) return;
    const proximo = PROXIMO_STATUS[status];
    if (!proximo) return;
    await updateDoc(doc(db, 'events', id), { status: proximo });
    setStatus(proximo);
  }

  if (carregando) return <Spinner />;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{editando ? 'Editar evento' : 'Novo evento'}</h1>

      {editando && (
        <div className="border rounded-lg p-3 bg-white flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm">
            Status atual: <strong>{status}</strong>
          </span>
          {PROXIMO_STATUS[status] && (
            <button onClick={avancarStatus} className="text-sm bg-slate-800 text-white rounded-md px-3 py-1.5">
              {ROTULO_TRANSICAO[status]}
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Campo label="Título" value={titulo} onChange={setTitulo} required />

        <div>
          <label htmlFor="descricao" className="block text-sm font-medium mb-1">
            Descrição
          </label>
          <textarea
            id="descricao"
            required
            rows={4}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="dataHora" className="block text-sm font-medium mb-1">
            Data e hora
          </label>
          <input
            id="dataHora"
            type="datetime-local"
            required
            value={dataHora}
            onChange={(e) => setDataHora(e.target.value)}
            className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <Campo label="Local" value={local} onChange={setLocal} required />

        <div>
          <label htmlFor="modalidade" className="block text-sm font-medium mb-1">
            Modalidade
          </label>
          <select
            id="modalidade"
            value={modalidade}
            onChange={(e) => setModalidade(e.target.value as 'presencial' | 'online')}
            className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="presencial">Presencial</option>
            <option value="online">Online</option>
          </select>
        </div>

        <Campo label="Carga horária em horas (opcional)" type="number" value={cargaHoraria} onChange={setCargaHoraria} />
        <Campo label="Capacidade (opcional)" type="number" value={capacidade} onChange={setCapacidade} />

        <fieldset className="border rounded-md p-3 space-y-2">
          <legend className="text-sm font-medium px-1">Organizadores parceiros</legend>
          {organizadoresDisponiveis.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum outro organizador cadastrado ainda.</p>
          ) : (
            organizadoresDisponiveis.map((o) => (
              <label key={o.uid} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={parceiroIds.includes(o.uid)}
                  onChange={(e) =>
                    setParceiroIds((atual) =>
                      e.target.checked ? [...atual, o.uid] : atual.filter((uid) => uid !== o.uid)
                    )
                  }
                />
                {o.nome}
              </label>
            ))
          )}
        </fieldset>

        <fieldset className="border rounded-md p-3 space-y-3">
          <legend className="text-sm font-medium px-1">Divulgação</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            {(['imediata', 'programada', 'segmentada'] as TipoDivulgacao[]).map((tipo) => (
              <label key={tipo} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="divulgacao"
                  checked={tipoDivulgacao === tipo}
                  onChange={() => setTipoDivulgacao(tipo)}
                />
                {rotuloDivulgacao(tipo)}
              </label>
            ))}
          </div>
          {tipoDivulgacao === 'programada' && (
            <div>
              <label htmlFor="dataDivulgacao" className="block text-sm font-medium mb-1">
                Publicar em
              </label>
              <input
                id="dataDivulgacao"
                type="datetime-local"
                required
                value={dataDivulgacao}
                onChange={(e) => setDataDivulgacao(e.target.value)}
                className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          {tipoDivulgacao === 'segmentada' && (
            <Campo label="Cursos ou unidades alvo, separados por vírgula" value={cursosAlvo} onChange={setCursosAlvo} />
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={lembretesAtivos} onChange={(e) => setLembretesAtivos(e.target.checked)} />
            Enviar lembretes automáticos pros inscritos
          </label>
        </fieldset>

        {mensagem && <Feedback tipo={mensagem.tipo} mensagem={mensagem.texto} />}

        <button
          type="submit"
          disabled={salvando}
          className="w-full bg-blue-600 text-white rounded-md py-2.5 font-medium disabled:opacity-60"
        >
          {salvando ? 'Salvando…' : 'Salvar evento'}
        </button>
      </form>
    </div>
  );
}

function rotuloDivulgacao(tipo: TipoDivulgacao) {
  return { imediata: 'Imediata', programada: 'Programada', segmentada: 'Segmentada' }[tipo];
}
