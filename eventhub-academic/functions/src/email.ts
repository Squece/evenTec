// Integração real com o Resend. A interface (enviarEmail) já era chamada
// pelo resto do código antes disso existir, então nenhum outro arquivo
// (index.ts, certificate.ts, etc.) precisou mudar quando o TODO foi preenchido.

import { Resend } from 'resend';

interface EnvioEmail {
  para: string;
  assunto: string;
  html: string;
}

const resend = new Resend(process.env.RESEND_API_KEY);

export async function enviarEmail(dados: EnvioEmail): Promise<boolean> {
  try {
    const { data, error } = await resend.emails.send({
      from: 'evenTec <onboarding@resend.dev>', // troque pelo domínio verificado quando existir
      to: dados.para,
      subject: dados.assunto,
      html: dados.html,
    });

    if (error) {
      console.error('[email] falha ao enviar via Resend:', dados.para, error);
      return false;
    }

    console.log('[email] enviado com sucesso:', dados.para, data?.id);
    return true;
  } catch (err) {
    console.error('[email] erro inesperado ao enviar:', dados.para, err);
    return false;
  }
}
