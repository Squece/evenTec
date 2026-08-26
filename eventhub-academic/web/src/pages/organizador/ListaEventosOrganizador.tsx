import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { EventDoc, EventStatus } from '../../types/models';
import { formatarDataHora } from '../../lib/formato';
import Spinner from '../../components/Spinner';

interface EventoComId extends EventDoc {
  id: string;
}

const ROTULOS_STATUS: Record<EventStatus, string> = {
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  em_andamento: 'Em andamento',
  encerrado: 'Encerrado',
};

type Filtro = 'todos' | 'divulgados';

export default function ListaEventosOrganizador() {
  const { usuario } = useAuth();
  const [eventos, setEventos] = useState<EventoComId[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');

  useEffect(() => {
    if (!usuario) return;
    const q = query(collection(db, 'events'), where('organizadorId', '==', usuario.uid));
    return onSnapshot(q, (snap) => {
      setEventos(snap.docs.map((d) => ({ id: d.id, ...(d.data() as EventDoc) })));
    });
  }, [usuario]);

  // "Divulgado" = evento já publicado e visível pros alunos (inclui os que
  // estão em andamento, já que continuam publicamente visíveis).
  const eventosFiltrados =
    eventos?.filter(
      (evento) =>
        filtro === 'todos' || evento.status === 'publicado' || evento.status === 'em_andamento'
    ) ?? null;
  const totalDivulgados =
    eventos?.filter((e) => e.status === 'publicado' || e.status === 'em_andamento').length ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-2xl font-bold">Meus eventos</h1>
        <Link
          to="/organizador/eventos/novo"
          className="bg-blue-600 text-white text-sm rounded-md px-3 py-2 font-medium shrink-0"
        >
          Novo evento
        </Link>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setFiltro('todos')}
          className={`text-sm rounded-full px-3 py-1.5 font-medium ${
            filtro === 'todos' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
          }`}
        >
          Todos
        </button>
        <button
          type="button"
          onClick={() => setFiltro('divulgados')}
          className={`text-sm rounded-full px-3 py-1.5 font-medium ${
            filtro === 'divulgados' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
          }`}
        >
          Divulgados{eventos !== null ? ` (${totalDivulgados})` : ''}
        </button>
      </div>

      {eventosFiltrados === null ? (
        <Spinner />
      ) : eventosFiltrados.length === 0 ? (
        <p className="text-slate-600">
          {filtro === 'divulgados'
            ? 'Você ainda não tem nenhum evento divulgado.'
            : 'Você ainda não criou nenhum evento.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {eventosFiltrados.map((evento) => (
            <li key={evento.id} className="border rounded-lg p-4 bg-white space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{evento.titulo}</p>
                <span className="text-xs px-2 py-1 rounded-full bg-slate-100 shrink-0">
                  {ROTULOS_STATUS[evento.status]}
                </span>
              </div>
              <p className="text-sm text-slate-600">{formatarDataHora(evento.dataHora)}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link to={`/organizador/eventos/${evento.id}/editar`} className="text-blue-600 underline">
                  Editar
                </Link>
                <Link to={`/organizador/eventos/${evento.id}/inscritos`} className="text-blue-600 underline">
                  Inscritos
                </Link>
                {(evento.status === 'publicado' || evento.status === 'em_andamento') && (
                  <Link to={`/organizador/eventos/${evento.id}/scanner`} className="text-blue-600 underline">
                    Scanner QR
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
