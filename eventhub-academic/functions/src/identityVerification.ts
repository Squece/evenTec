import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { randomInt } from 'crypto';
import { db } from './admin';
import { enviarEmail } from './email';
import { UserProfile } from './types';

// Confirmação de identidade do aluno por código enviado ao e-mail
// institucional (Resend), no lugar de SMS — Firebase Phone Auth exigiria
// plano Blaze + reCAPTCHA, fora do escopo do hackathon (decisão registrada
// no CLAUDE.md). O código só é entregue por e-mail: a coleção
// `verificationCodes` é bloqueada pro cliente nas firestore.rules, então
// não dá pra "confirmar" sem realmente ter recebido o e-mail.

const VALIDADE_MINUTOS = 10;
const MAX_TENTATIVAS = 5;

interface VerificationCodeDoc {
  codigo: string;
  expiraEm: FirebaseFirestore.Timestamp;
  tentativas: number;
}

function gerarCodigo(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export const enviarCodigoConfirmacao = onCall({ secrets: ['RESEND_API_KEY'] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login antes de solicitar o código.');
  }

  const userSnap = await db.collection('users').doc(request.auth.uid).get();
  const usuario = userSnap.data() as UserProfile | undefined;
  if (!usuario) {
    throw new HttpsError('not-found', 'Perfil não encontrado.');
  }
  if (usuario.telefoneVerificado) {
    return { ok: true, jaVerificado: true };
  }

  const codigo = gerarCodigo();
  const expiraEm = new Date(Date.now() + VALIDADE_MINUTOS * 60 * 1000);

  await db.collection('verificationCodes').doc(request.auth.uid).set({
    codigo,
    expiraEm,
    tentativas: 0,
  });

  await enviarEmail({
    para: usuario.email,
    assunto: 'Seu código de confirmação — evenTec',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Confirme sua identidade</h2>
        <p>Use o código abaixo para confirmar seu cadastro no evenTec:</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px;">${codigo}</p>
        <p style="color: #666; font-size: 14px;">
          Válido por ${VALIDADE_MINUTOS} minutos. Se não foi você, ignore este e-mail.
        </p>
      </div>
    `,
  });

  return { ok: true, jaVerificado: false };
});

export const confirmarCodigo = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login antes de confirmar o código.');
  }
  const { codigo } = request.data as { codigo: string };
  if (!codigo) {
    throw new HttpsError('invalid-argument', 'Informe o código recebido por e-mail.');
  }

  const ref = db.collection('verificationCodes').doc(request.auth.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('failed-precondition', 'Solicite um novo código antes de confirmar.');
  }

  const dados = snap.data() as VerificationCodeDoc;
  if (dados.tentativas >= MAX_TENTATIVAS) {
    throw new HttpsError('resource-exhausted', 'Muitas tentativas. Solicite um novo código.');
  }
  if (dados.expiraEm.toDate().getTime() < Date.now()) {
    throw new HttpsError('deadline-exceeded', 'Código expirado. Solicite um novo.');
  }
  if (dados.codigo !== codigo.trim()) {
    await ref.update({ tentativas: FieldValue.increment(1) });
    throw new HttpsError('invalid-argument', 'Código incorreto.');
  }

  await db.collection('users').doc(request.auth.uid).update({ telefoneVerificado: true });
  await ref.delete();

  return { ok: true };
});
