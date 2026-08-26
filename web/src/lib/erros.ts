export function mensagemDeErro(err: unknown): string {
  const codigo = (err as { code?: string })?.code ?? '';
  const mapa: Record<string, string> = {
    'auth/email-already-in-use': 'Esse e-mail já está cadastrado.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/user-not-found': 'E-mail ou senha inválidos.',
    'auth/wrong-password': 'E-mail ou senha inválidos.',
    'auth/invalid-credential': 'E-mail ou senha inválidos.',
    'auth/too-many-requests': 'Muitas tentativas. Tente novamente em instantes.',
  };
  return mapa[codigo] ?? 'Ocorreu um erro. Tente novamente.';
}
