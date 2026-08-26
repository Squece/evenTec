// Verifica o ID token do Firebase Auth sem precisar do Admin SDK (que não
// roda em Cloudflare Workers) — usando as chaves públicas do próprio
// Google. Isso é o suficiente pra provar "quem está chamando é mesmo um
// usuário logado do projeto eventec-academic"; não é uma reimplementação
// completa do Admin SDK (não verifica revogação, por exemplo), mas cobre o
// que este Worker precisa: e-mail verificado embutido no token assinado.
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Env } from './env';

export class AuthError extends Error {}

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export interface FirebaseClaims extends JWTPayload {
  email?: string;
  name?: string;
  user_id?: string;
}

export async function verificarToken(request: Request, env: Env): Promise<FirebaseClaims> {
  const cabecalho = request.headers.get('Authorization') ?? '';
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : null;
  if (!token) throw new AuthError('Token ausente.');

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
    });
    return payload as FirebaseClaims;
  } catch {
    throw new AuthError('Token inválido ou expirado.');
  }
}
