// Worker "trocador de secrets": o app eveTec não tem nenhum backend próprio
// (sem Blaze, sem Cloud Functions — ver CLAUDE.md). Firestore Rules cobrem
// toda a lógica de autorização do app; este Worker existe só pra guardar as
// chaves do Resend/Twilio longe do navegador, já que essas APIs nunca podem
// ser chamadas com a chave exposta no cliente. Cada rota confere um Firebase
// ID token válido antes de disparar qualquer coisa.
import type { Env } from './env';
import { AuthError, verificarToken } from './auth';
import { enviarEmail } from './resend';
import { enviarWhatsApp } from './twilio';

const TTL_CODIGO_SEGUNDOS = 600;

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origem = request.headers.get('Origin') ?? '';
  const permitidas = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  return {
    'Access-Control-Allow-Origin': permitidas.includes(origem) ? origem : permitidas[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    Vary: 'Origin',
  };
}

function json(dados: unknown, status: number, cors: HeadersInit): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function gerarCodigo(): string {
  const numero = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return numero.toString().padStart(6, '0');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'POST' && url.pathname === '/confirmacao-inscricao') {
        const claims = await verificarToken(request, env);
        if (!claims.email) return json({ erro: 'Token sem e-mail.' }, 400, cors);
        const { nomeEvento, linkApp } = (await request.json()) as { nomeEvento: string; linkApp?: string };

        const sucesso = await enviarEmail(env, {
          para: claims.email,
          assunto: `Inscrição confirmada: ${nomeEvento}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Olá ${claims.name ?? ''}!</h2>
              <p>Sua inscrição no evento <strong>${nomeEvento}</strong> foi confirmada com sucesso.</p>
              ${linkApp ? `<p><a href="${linkApp}">Ver meu QR Code</a></p>` : ''}
            </div>
          `,
        });
        return json({ ok: sucesso }, 200, cors);
      }

      if (request.method === 'POST' && url.pathname === '/codigo/enviar') {
        const claims = await verificarToken(request, env);
        if (!claims.user_id) return json({ erro: 'Token inválido.' }, 400, cors);
        // O e-mail institucional não vem do token (o login é pelo e-mail
        // pessoal) — o cliente manda o valor salvo no perfil do Firestore.
        const { emailInstitucional } = (await request.json()) as { emailInstitucional?: string };
        if (!emailInstitucional) return json({ erro: 'Informe o e-mail institucional.' }, 400, cors);

        const codigo = gerarCodigo();
        await env.CODES.put(`codigo:${claims.user_id}`, codigo, { expirationTtl: TTL_CODIGO_SEGUNDOS });

        const sucesso = await enviarEmail(env, {
          para: emailInstitucional,
          assunto: 'Seu código de confirmação — evenTec',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
              <h2>Confirme sua identidade</h2>
              <p>Use o código abaixo para confirmar seu cadastro no evenTec:</p>
              <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px;">${codigo}</p>
              <p style="color: #666; font-size: 14px;">Válido por 10 minutos. Se não foi você, ignore este e-mail.</p>
            </div>
          `,
        });
        return json({ ok: sucesso }, 200, cors);
      }

      if (request.method === 'POST' && url.pathname === '/codigo/confirmar') {
        const claims = await verificarToken(request, env);
        if (!claims.user_id) return json({ erro: 'Token inválido.' }, 400, cors);
        const { codigo } = (await request.json()) as { codigo?: string };

        const chave = `codigo:${claims.user_id}`;
        const salvo = await env.CODES.get(chave);
        const confere = Boolean(salvo && codigo && salvo === codigo.trim());
        if (confere) await env.CODES.delete(chave);

        return json({ ok: confere }, 200, cors);
      }

      if (request.method === 'POST' && url.pathname === '/certificado/notificar') {
        // Só confirma que quem chamou é um usuário logado de verdade — sem
        // Firestore no Worker não dá pra confirmar aqui que é o organizador
        // daquele evento específico (isso já foi checado pelas Firestore
        // Rules na hora de gerar o certificado no cliente). Pior caso de
        // abuso: um usuário autenticado dispara e-mails/whatsapp de
        // "certificado disponível" com conteúdo fixo — chato, não malicioso.
        await verificarToken(request, env);
        const { nome, email, telefone, nomeEvento, linkApp } = (await request.json()) as {
          nome: string;
          email: string;
          telefone?: string;
          nomeEvento: string;
          linkApp?: string;
        };

        const sucessoEmail = await enviarEmail(env, {
          para: email,
          assunto: `Seu certificado — ${nomeEvento}`,
          html: `<p>Olá ${nome}, seu certificado já está disponível na plataforma.</p>
                 ${linkApp ? `<p><a href="${linkApp}">Ver certificado</a></p>` : ''}`,
        });

        const sucessoWhatsApp = telefone
          ? await enviarWhatsApp(env, {
              telefone,
              mensagem: `Olá ${nome}! 🎓\n\nSeu certificado do evento *${nomeEvento}* já está disponível no app.`,
            })
          : false;

        return json({ ok: true, sucessoEmail, sucessoWhatsApp }, 200, cors);
      }

      if (request.method === 'POST' && url.pathname === '/lembrete') {
        await verificarToken(request, env);
        const { nome, email, telefone, nomeEvento, linkApp } = (await request.json()) as {
          nome: string;
          email: string;
          telefone?: string;
          nomeEvento: string;
          linkApp?: string;
        };

        const sucessoEmail = await enviarEmail(env, {
          para: email,
          assunto: `Lembrete: hoje é o dia do evento ${nomeEvento}`,
          html: `<p>Olá ${nome}, passando pra lembrar que hoje é o dia do evento <strong>${nomeEvento}</strong>.</p>
                 ${linkApp ? `<p><a href="${linkApp}">Ver meu QR Code</a></p>` : ''}`,
        });

        const sucessoWhatsApp = telefone
          ? await enviarWhatsApp(env, {
              telefone,
              mensagem: `Olá ${nome}! 📅\n\nLembrete: hoje é o dia do evento *${nomeEvento}*.`,
            })
          : false;

        return json({ ok: true, sucessoEmail, sucessoWhatsApp }, 200, cors);
      }

      return json({ erro: 'not_found' }, 404, cors);
    } catch (err) {
      if (err instanceof AuthError) return json({ erro: err.message }, 401, cors);
      console.error(err);
      return json({ erro: 'Erro interno.' }, 500, cors);
    }
  },
};
