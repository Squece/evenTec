import type { Env } from './env';

interface EnvioWhatsApp {
  telefone: string;
  mensagem: string;
}

// Sandbox do Twilio — o aluno precisa mandar "join <código>" pro número
// abaixo pelo menos uma vez antes de conseguir receber mensagens.
const WHATSAPP_FROM_PADRAO = 'whatsapp:+14155238886';

export async function enviarWhatsApp(env: Env, dados: EnvioWhatsApp): Promise<boolean> {
  const apenasDigitos = dados.telefone.replace(/\D/g, '');
  const comDdi = apenasDigitos.startsWith('55') ? apenasDigitos : `55${apenasDigitos}`;
  const from = env.TWILIO_WHATSAPP_FROM || WHATSAPP_FROM_PADRAO;

  const corpo = new URLSearchParams({
    From: from,
    To: `whatsapp:+${comDdi}`,
    Body: dados.mensagem,
  });

  try {
    const resposta = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: corpo,
    });

    if (!resposta.ok) {
      console.error('[whatsapp] Twilio respondeu', resposta.status, await resposta.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[whatsapp] erro inesperado ao enviar', err);
    return false;
  }
}
