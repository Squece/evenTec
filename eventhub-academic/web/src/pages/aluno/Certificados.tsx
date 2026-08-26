import { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { CertificateDoc, EventDoc } from '../../types/models';
import Spinner from '../../components/Spinner';

interface CertificadoComEvento {
  id: string;
  certificado: CertificateDoc;
  evento: EventDoc | null;
}

export default function Certificados() {
  const { usuario } = useAuth();
  const [certificados, setCertificados] = useState<CertificadoComEvento[] | null>(null);

  useEffect(() => {
    if (!usuario) return;
    const q = query(collection(db, 'certificates'), where('userId', '==', usuario.uid));
    return onSnapshot(q, async (snap) => {
      const itens = await Promise.all(
        snap.docs.map(async (d) => {
          const certificado = d.data() as CertificateDoc;
          const eventoSnap = await getDoc(doc(db, 'events', certificado.eventId));
          return { id: d.id, certificado, evento: eventoSnap.exists() ? (eventoSnap.data() as EventDoc) : null };
        })
      );
      setCertificados(itens);
    });
  }, [usuario]);

  if (certificados === null) return <Spinner />;
  if (certificados.length === 0) return <p className="text-slate-600">Nenhum certificado disponível ainda.</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Meus certificados</h1>
      <ul className="space-y-3">
        {certificados.map(({ id, certificado, evento }) => (
          <li key={id} className="border rounded-lg p-4 bg-white flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{evento?.titulo ?? 'Evento'}</p>
              <p className="text-xs text-slate-500">Código: {certificado.codigoValidacao}</p>
            </div>
            <a
              href={`data:application/pdf;base64,${certificado.pdfBase64}`}
              download={`certificado-${evento?.titulo ?? id}.pdf`}
              className="shrink-0 bg-blue-600 text-white text-sm rounded-md px-3 py-2 font-medium"
            >
              Baixar PDF
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
