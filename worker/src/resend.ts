import type { Env } from './env';

interface EnvioEmail {
  para: string;
  assunto: string;
  html: string;
}

export async function enviarEmail(env: Env, dados: EnvioEmail): Promise<boolean> {
  try {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'evenTec <onboarding@resend.dev>', // troque pelo domínio verificado quando existir
        to: dados.para,
        subject: dados.assunto,
        html: dados.html,
      }),
    });

    if (!resposta.ok) {
      console.error('[email] Resend respondeu', resposta.status, await resposta.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] erro inesperado ao enviar', err);
    return false;
  }
}
