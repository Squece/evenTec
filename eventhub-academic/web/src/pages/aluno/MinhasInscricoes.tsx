import { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { EventDoc, RegistrationDoc } from '../../types/models';
import { formatarDataHora } from '../../lib/formato';
import Spinner from '../../components/Spinner';

interface InscricaoComEvento {
  id: string;
  registro: RegistrationDoc;
  evento: EventDoc | null;
}

const ROTULOS_STATUS: Record<RegistrationDoc['status'], string> = {
  inscrito: 'Inscrito',
  presente: 'Presença confirmada',
  ausente: 'Ausente',
  cancelado: 'Cancelado',
};

export default function MinhasInscricoes() {
  const { usuario } = useAuth();
  const [inscricoes, setInscricoes] = useState<InscricaoComEvento[] | null>(null);

  useEffect(() => {
    if (!usuario) return;
    const q = query(collection(db, 'registrations'), where('userId', '==', usuario.uid));
    return onSnapshot(q, async (snap) => {
      const itens = await Promise.all(
        snap.docs
          .map((d) => ({ id: d.id, registro: d.data() as RegistrationDoc }))
          .filter((i) => i.registro.status !== 'cancelado')
          .map(async (i) => {
            const eventoSnap = await getDoc(doc(db, 'events', i.registro.eventId));
            return { ...i, evento: eventoSnap.exists() ? (eventoSnap.data() as EventDoc) : null };
          })
      );
      setInscricoes(itens);
    });
  }, [usuario]);

  if (inscricoes === null) return <Spinner />;
  if (inscricoes.length === 0) return <p className="text-slate-600">Você ainda não se inscreveu em nenhum evento.</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Minhas inscrições</h1>
      <ul className="space-y-4">
        {inscricoes.map(({ id, registro, evento }) => (
          <li key={id} className="border rounded-lg p-4 bg-white space-y-3">
            <div>
              <p className="font-semibold">{evento?.titulo ?? 'Evento'}</p>
              {evento && <p className="text-sm text-slate-600">{formatarDataHora(evento.dataHora)}</p>}
              <p className="text-sm mt-1">
                Status: <span className="font-medium">{ROTULOS_STATUS[registro.status]}</span>
              </p>
            </div>
            {registro.status === 'inscrito' && (
              <div className="flex flex-col items-center gap-2 py-2">
                <QRCodeSVG value={JSON.stringify({ registrationId: id, eventId: registro.eventId })} size={180} />
                <p className="text-xs text-slate-500 text-center">
                  Mostre esse QR Code pro organizador na hora do evento.
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
