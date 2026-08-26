import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../../lib/firebase';
import type { EventDoc } from '../../types/models';
import { useAuth } from '../../contexts/AuthContext';
import { formatarDataHora } from '../../lib/formato';
import Spinner from '../../components/Spinner';

interface EventoComId extends EventDoc {
  id: string;
}

export default function ListaEventos() {
  const { perfil } = useAuth();
  const [eventos, setEventos] = useState<EventoComId[] | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'events'), where('status', 'in', ['publicado', 'em_andamento']));
    return onSnapshot(q, (snap) => {
      setEventos(snap.docs.map((d) => ({ id: d.id, ...(d.data() as EventDoc) })));
    });
  }, []);

  if (eventos === null) return <Spinner />;

  const visiveis = eventos.filter((evento) => {
    if (evento.divulgacao?.tipo !== 'segmentada') return true;
    const alvo = evento.divulgacao.cursosAlvo ?? [];
    return alvo.length === 0 || (perfil?.curso != null && alvo.includes(perfil.curso));
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Eventos</h1>
      {visiveis.length === 0 ? (
        <p className="text-slate-600">Nenhum evento disponível no momento.</p>
      ) : (
        <ul className="space-y-3">
          {visiveis.map((evento) => (
            <li key={evento.id}>
              <Link
                to={`/eventos/${evento.id}`}
                className="block border rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
              >
                <p className="font-semibold">{evento.titulo}</p>
                <p className="text-sm text-slate-600">
                  {formatarDataHora(evento.dataHora)} · {evento.local}
                </p>
                {evento.capacidade != null && (
                  <p className="text-xs text-slate-500 mt-1">
                    {Math.max(evento.capacidade - evento.vagasOcupadas, 0)} vaga(s) restante(s)
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
