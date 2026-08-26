import { createHmac, randomUUID } from 'crypto';

// O segredo deve vir de uma variável de ambiente segura, nunca de um valor fixo.
// Configure com: firebase functions:secrets:set QR_SECRET
const QR_SECRET = process.env.QR_SECRET ?? 'troque-este-valor-em-producao';

export interface QrPayload {
  registrationId: string;
  eventId: string;
  token: string;
}

/**
 * Gera o payload assinado que vira o QR Code do ALUNO (não do organizador).
 * O QR carrega só os IDs + uma assinatura HMAC, então o organizador consegue
 * validar a autenticidade sem depender de nada além do próprio código escaneado.
 */
export function gerarQrPayload(registrationId: string, eventId: string): QrPayload {
  return { registrationId, eventId, token: assinar(registrationId, eventId) };
}

export function assinar(registrationId: string, eventId: string): string {
  return createHmac('sha256', QR_SECRET)
    .update(`${eventId}:${registrationId}`)
    .digest('hex')
    .slice(0, 32);
}

/** Usado pelo app do ORGANIZADOR depois de escanear o QR do aluno. */
export function validarAssinatura(registrationId: string, eventId: string, token: string): boolean {
  return assinar(registrationId, eventId) === token;
}

/** Código de validação pública do certificado — independente do token de presença. */
export function gerarCodigoValidacaoCertificado(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
}
