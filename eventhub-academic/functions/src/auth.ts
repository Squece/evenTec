import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getAuth } from 'firebase-admin/auth';
import { UserProfile } from './types';

/**
 * Define o custom claim de role assim que o perfil é criado no Firestore.
 * Sem isso, `request.auth.token.role` nunca existe e toda checagem de
 * "ehOrganizador()" (firestore.rules) ou `role !== 'organizador'` (Cloud
 * Functions) falha sempre — é o que de fato separa aluno de organizador.
 */
export const onUserProfileCreated = onDocumentCreated('users/{uid}', async (event) => {
  const perfil = event.data?.data() as UserProfile | undefined;
  if (!perfil) return;

  await getAuth().setCustomUserClaims(event.params.uid, { role: perfil.role });
});
