// Envio via Twilio WhatsApp Sandbox. API oficial da Meta não é viável no
// prazo (exige verificação de negócio) — decisão já registrada no
// CLAUDE.md. Segue a mesma ideia do email.ts: interface estável, corpo
// isolado num arquivo só, fácil de trocar por outro provedor depois.
//
// Antes de usar: o número do aluno precisa ter enviado "join <código>"
// pro número do Sandbox pelo menos uma vez (o código sai do console do
// Twilio). Sem isso o Twilio recusa a mensagem.

import twilio from 'twilio';

interface EnvioWhatsApp {
  telefone: string; // com ou sem formatação — só dígitos são usados, com DDD
  mensagem: string;
}

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Número do Sandbox do Twilio (padrão da conta de testes); sobrescreva via
// TWILIO_WHATSAPP_FROM quando migrar pra um número aprovado.
const WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886';

export async function enviarWhatsApp(dados: EnvioWhatsApp): Promise<boolean> {
  const apenasDigitos = dados.telefone.replace(/\D/g, '');
  const comDdi = apenasDigitos.startsWith('55') ? apenasDigitos : `55${apenasDigitos}`;

  try {
    const mensagem = await client.messages.create({
      from: WHATSAPP_FROM,
      to: `whatsapp:+${comDdi}`,
      body: dados.mensagem,
    });

    console.log('[whatsapp] enviado com sucesso:', dados.telefone, mensagem.sid);
    return true;
  } catch (err) {
    console.error('[whatsapp] erro ao enviar:', dados.telefone, err);
    return false;
  }
}
