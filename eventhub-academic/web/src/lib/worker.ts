// Chama o Cloudflare Worker (worker/) que guarda as chaves do Resend/Twilio
// longe do navegador. Toda rota exige o ID token do usuário logado — o
// Worker verifica a assinatura antes de disparar qualquer coisa.
import { auth } from './firebase';

const WORKER_URL = import.meta.env.VITE_WORKER_URL as string;

async function chamarWorker(caminho: string, corpo: unknown): Promise<boolean> {
  const usuario = auth.currentUser;
  if (!usuario) return false;

  try {
    const token = await usuario.getIdToken();
    const resposta = await fetch(`${WORKER_URL}${caminho}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(corpo),
    });
    return resposta.ok;
  } catch {
    return false;
  }
}

export function notificarConfirmacaoInscricao(nomeEvento: string, linkApp?: string) {
  return chamarWorker('/confirmacao-inscricao', { nomeEvento, linkApp });
}

interface DadosNotificacaoCertificado {
  nome: string;
  email: string;
  telefone?: string;
  nomeEvento: string;
  linkApp?: string;
}

export function notificarCertificado(dados: DadosNotificacaoCertificado) {
  return chamarWorker('/certificado/notificar', dados);
}

export function enviarLembrete(dados: DadosNotificacaoCertificado) {
  return chamarWorker('/lembrete', dados);
}
