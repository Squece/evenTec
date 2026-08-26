import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { RegistrationDoc } from '../../types/models';
import { Feedback } from '../../components/Feedback';

const REGIAO_ID = 'leitor-qrcode';

interface PayloadQr {
  registrationId: string;
  eventId: string;
}

export default function ScannerQRCode() {
  const { id: eventId } = useParams<{ id: string }>();
  const processandoRef = useRef(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(REGIAO_ID);

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (textoLido) => {
          void handleLeitura(textoLido);
        },
        () => {
          // erro de leitura de um frame específico — ignorado, o scanner continua tentando
        }
      )
      .catch(() => setMensagem({ tipo: 'erro', texto: 'Não foi possível acessar a câmera.' }));

    return () => {
      scanner.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Sem Cloud Function pra validar o QR: lê a inscrição direto do Firestore
  // e confia no ID (longo, imprevisível) + na regra em firestore.rules, que
  // só deixa o ORGANIZADOR do evento marcar 'presente' e só a partir de
  // 'inscrito' — o aluno nunca poderia fazer esse write sozinho.
  async function handleLeitura(textoLido: string) {
    if (processandoRef.current || !eventId) return;
    processandoRef.current = true;
    try {
      const payload = JSON.parse(textoLido) as PayloadQr;
      if (payload.eventId !== eventId) {
        setMensagem({ tipo: 'erro', texto: 'Esse QR Code é de outro evento.' });
        return;
      }

      const ref = doc(db, 'registrations', payload.registrationId);
      const snap = await getDoc(ref);
      const registro = snap.data() as RegistrationDoc | undefined;

      if (!snap.exists() || registro?.eventId !== eventId) {
        setMensagem({ tipo: 'erro', texto: 'Inscrição não encontrada para este evento.' });
        return;
      }
      if (registro.status === 'presente') {
        setMensagem({ tipo: 'sucesso', texto: 'Presença já estava confirmada.' });
        return;
      }
      if (registro.status !== 'inscrito') {
        setMensagem({ tipo: 'erro', texto: 'Essa inscrição não está mais ativa.' });
        return;
      }

      await updateDoc(ref, { status: 'presente', checkedInAt: serverTimestamp() });
      setMensagem({ tipo: 'sucesso', texto: 'Presença confirmada!' });
    } catch {
      setMensagem({ tipo: 'erro', texto: 'QR Code inválido.' });
    } finally {
      setTimeout(() => {
        processandoRef.current = false;
      }, 1500);
    }
  }

  return (
    <div className="max-w-sm mx-auto space-y-4">
      <h1 className="text-xl font-bold text-center">Escanear QR Code</h1>
      <div id={REGIAO_ID} className="rounded-lg overflow-hidden" />
      {mensagem && <Feedback tipo={mensagem.tipo} mensagem={mensagem.texto} />}
    </div>
  );
}
