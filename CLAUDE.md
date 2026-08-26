# evenTec — contexto do projeto

(nomes anteriores do projeto: EventHub Academic, eveTec)

## Visão geral
Plataforma web de gestão de eventos acadêmicos com dois perfis de usuário —
Aluno e Organizador — cobrindo o ciclo completo: criação/divulgação do
evento, inscrição, confirmação de presença por QR Code e emissão/validação
de certificados em PDF.

**Projeto Firebase real:** `eventec-academic`
**URL em produção:** https://eventec-academic.web.app
**Worker de notificações:** https://eventec-notificacoes.kauanvdsf.workers.dev

## Requisitos funcionais

### Módulo do aluno
- Cadastro e autenticação com e-mail pessoal (login) + e-mail institucional
  + telefone, com confirmação de identidade — via **código enviado ao
  e-mail institucional (Resend)**, não SMS (Firebase Phone Auth exigiria
  plano Blaze + reCAPTCHA, fora do escopo do projeto). Sem RM — não faz
  parte do cadastro nem do certificado.
- Login com Google também disponível; quem entra pela primeira vez por lá
  passa por uma tela de completar cadastro (escolhe papel, preenche
  curso/e-mail institucional/telefone).
- Visualização apenas de eventos publicados/abertos.
- Inscrição em eventos com feedback visual claro.
- Tela com o próprio QR Code (gerado a partir da inscrição) para ser
  escaneado pelo organizador na hora do evento.
- Download do certificado em PDF após o evento ser encerrado e validado
  pelo organizador. O certificado deve conter: nome, nome do evento, data,
  carga horária (quando houver), nome do organizador/instituição e código
  de validação único.

### Módulo do organizador
- Cadastro e autenticação de organizadores.
- Criação de eventos: título, descrição, data/hora, local
  (presencial/online), carga horária, capacidade (opcional, atualizável em
  tempo real), organizadores parceiros vinculados.
- Configuração de divulgação (imediata, programada, segmentada por
  curso/unidade) e lembretes para alunos já inscritos (disparo manual —
  ver "Decisão: sem Blaze" abaixo).
- Controle de status do evento: rascunho → publicado → em andamento →
  encerrado.
- Scanner de QR Code do aluno para confirmar presença em tempo real.
- Fechamento do evento com validação de presenças e geração/liberação dos
  certificados, enviados por e-mail e WhatsApp.

## Requisitos não funcionais
- Interface responsiva, mobile-first, acessível.
- Separação de permissões rígida entre aluno e organizador.
- PDF confiável, com layout limpo e código de verificação.
- Feedback visual claro em toda ação crítica (inscrição, geração de
  certificado, fechamento de evento).
- Arquitetura pensada para evoluir (API pública de validação, dashboard
  analítico, integração com sistemas acadêmicos).

## Decisão de arquitetura: sem Blaze, sem Cloud Functions
O projeto começou desenhado em cima de Cloud Functions (2ª geração). Na
prática, **toda Cloud Function v2 exige o plano pago (Blaze) do Firebase
pra ser sequer implantada** — não é sobre o que a função faz por dentro,
é exigência de infraestrutura do Google (Cloud Run/Cloud Build por baixo).
Como decidiu-se não usar Blaze, o projeto foi redesenhado pra rodar
**inteiramente sem backend Firebase**:

- **Autorização** (quem pode ler/escrever o quê) é feita só por
  `firestore.rules` — sem custom claims (que dependiam de uma Cloud
  Function pra serem setados). O papel do usuário é lido direto do
  próprio documento em `users/{uid}` dentro das regras, via `get()`.
- **QR Code / check-in**: sem assinatura HMAC server-side. O QR carrega só
  `{registrationId, eventId}`; o organizador escaneia e o app lê a
  inscrição direto do Firestore. A segurança vem do ID do documento (longo
  e imprevisível) + da regra que só deixa o organizador daquele evento
  virar o status pra `'presente'`, e só a partir de `'inscrito'`.
- **Capacidade do evento**: em vez de uma transação de Cloud Function, é
  uma transação do próprio cliente (`runTransaction` no navegador do
  aluno), validada por uma regra que só aceita incrementar `vagasOcupadas`
  em 1 quando isso está emparelhado (mesma transação) com a criação real
  da inscrição daquele usuário — usa `getAfter()` pra conferir.
- **Certificado em PDF**: gerado no navegador do ORGANIZADOR (pdf-lib
  funciona em browser) na hora de encerrar o evento, e salvo em **base64
  direto no documento do Firestore** (`certificates.pdfBase64`) — sem
  Firebase Storage, que desde out/2024 também exige Blaze pra qualquer
  uso. Cabe tranquilo no limite de 1MB por documento (PDF de uma página,
  fontes padrão, sem fontes embutidas).
- **E-mail (Resend) e WhatsApp (Twilio)**: essas APIs exigem uma chave
  secreta que nunca pode ficar no navegador — isso é regra de segurança
  das próprias Resend/Twilio, não do Firebase. Como não há Cloud Functions
  pra guardar esse segredo, existe um **Cloudflare Worker** só pra isso
  (`worker/`, free tier, sem cartão) — ver seção própria abaixo.
- **Lembretes automáticos** viravam um Cloud Scheduler; sem nenhum backend
  rodando 24/7, isso virou um **botão manual** ("Enviar lembrete") no
  Painel de Inscritos do organizador.
- **Divulgação "programada"** (publicar um rascunho automaticamente numa
  data futura) também dependia de um Cloud Scheduler — **não tem
  equivalente implementado no frontend atual**; o campo `dataDivulgacao`
  existe no modelo de dados, mas nada dispara a publicação sozinho. Fica
  como pendência caso o projeto volte a ter algum tipo de execução
  agendada (Blaze ou um cron do próprio Worker no Cloudflare).

`functions/` (Cloud Functions v2 completas, com HMAC, custom claims,
Storage, Cloud Scheduler) **continua no repositório, compila, mas não está
implantado nem conectado ao frontend** — é o caminho de upgrade natural se
o projeto decidir migrar pra Blaze no futuro. Ver "O que existe mas está
dormente" mais abaixo.

## O Worker de notificações (`worker/`)
Cloudflare Worker gratuito (sem cartão), único componente de servidor do
projeto. Faz só isto:
1. Confere a assinatura de um Firebase ID token (via `jose` + a chave
   pública do Google em
   `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`)
   pra garantir que quem chamou é um usuário logado de verdade do projeto
   `eventec-academic`. Não reimplementa o Admin SDK inteiro (não checa
   revogação de token, por exemplo) — é o suficiente pro que essas rotas
   fazem.
2. Dispara e-mail via Resend e WhatsApp via Twilio Sandbox, direto por
   `fetch` nas APIs REST deles (sem SDK Node, que não é garantido rodar
   bem em Workers).
3. Guarda os códigos de confirmação de identidade num namespace de KV
   (`CODES`), com TTL de 10 minutos — não usa Firestore pra isso.

Rotas: `POST /confirmacao-inscricao`, `POST /codigo/enviar`,
`POST /codigo/confirmar`, `POST /certificado/notificar`, `POST /lembrete`.
Todas exigem `Authorization: Bearer <idToken>`.

**Limitação conhecida:** o Worker não tem acesso ao Firestore, então não
consegue confirmar que quem chamou `/certificado/notificar` ou `/lembrete`
é *realmente* o organizador daquele evento específico — só confere que é
um usuário autenticado válido. Pior cenário de abuso: alguém logado dispara
e-mails/WhatsApp de "certificado disponível" com conteúdo fixo pra
endereços arbitrários usando a cota do projeto — chato, não malicioso, e
mitigado na prática pelo Twilio Sandbox exigir opt-in (`join <código>`) por
número. Resolver isso de verdade exigiria dar ao Worker acesso ao Firestore
(service account + REST API do Firestore, ou voltar a usar Cloud Functions
com Blaze).

Segredos do Worker (via `wrangler secret put`, nunca em `wrangler.toml`):
`RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_WHATSAPP_FROM` (opcional).

## Modelo de dados (Firestore)
- `users/{uid}` — role, nome, curso (só aluno, usado na divulgação
  segmentada), email (pessoal — é o login), emailInstitucional (só aluno,
  recebe o código de confirmação de identidade), telefone,
  telefoneVerificado
- `events/{id}` — titulo, descricao, dataHora, local, modalidade,
  cargaHoraria, capacidade, vagasOcupadas, status, organizadorId,
  parceiros[], divulgacao ({ tipo: imediata|programada|segmentada,
  cursosAlvo[] }), lembretesAtivos, dataDivulgacao
- `registrations/{eventId}_{userId}` — **ID determinístico** (não
  auto-gerado): impede duas inscrições ativas do mesmo aluno no mesmo
  evento e permite que a regra de `events` confira a inscrição pareada sem
  precisar de query. Campos: eventId, userId, status, checkedInAt
- `certificates/{registrationId}` — **ID = ID da inscrição** (1 certificado
  por inscrição, idempotente). Campos: registrationId, eventId, userId,
  codigoValidacao, pdfBase64, emitidoEm. Leitura pública (`allow read: if
  true`) — é comprovante feito pra ser conferido por qualquer pessoa com o
  código.

Não existem mais as coleções `notificationsLog` e `verificationCodes`
(eram só pra quando havia Cloud Functions escrevendo log/estado
server-side; o Worker usa Cloudflare KV pros códigos, e não há log de
notificação nesta versão).

## Fluxos principais (arquitetura atual, sem backend Firebase)

**Inscrição:** aluno abre um evento → `runTransaction` no navegador cria
`registrations/{eventId}_{userId}` e incrementa `events.vagasOcupadas`,
ambos validados por `firestore.rules` → dispara (best-effort, não bloqueia
a UI) uma chamada ao Worker pra mandar o e-mail de confirmação.

**QR Code / check-in:** o aluno já vê o QR assim que a inscrição existe
(`registrationId` é conhecido na hora, ID determinístico) — `qrcode.react`
codifica `{registrationId, eventId}`. O organizador escaneia com
`html5-qrcode`, lê a inscrição do Firestore, e se estiver tudo certo faz
`updateDoc` pra `status: 'presente'` — a regra garante que só o organizador
daquele evento consegue.

**Cancelamento:** o aluno cancela a própria inscrição
(`inscrito → cancelado`) numa transação que também decrementa
`vagasOcupadas` — pode se reinscrever depois, reaproveitando o mesmo
documento.

**Fechamento do evento:** o organizador clica "Encerrar evento" no Painel
de Inscritos → pra cada inscrição `'presente'` sem certificado ainda, o
navegador do organizador gera o PDF (pdf-lib), grava em
`certificates/{registrationId}` (base64) e chama o Worker pra notificar o
aluno por e-mail/WhatsApp → evento vira `'encerrado'`.

**Confirmação de identidade:** aluno pede um código →
Worker gera, guarda no KV, manda por e-mail (Resend) → aluno digita o
código → Worker confere contra o KV → se bater, o **próprio cliente**
grava `telefoneVerificado: true` no Firestore (a regra permite esse campo
específico). É um gate de onboarding, não uma trava de segurança sobre
dados sensíveis.

## O que existe mas está dormente (`functions/`)
Cloud Functions v2 completas, testadas com `tsc`, mas **não implantadas**
(removidas de `firebase.json` de propósito, pra não quebrar um
`firebase deploy` sem `--only`). Ficam como caminho de upgrade se o
projeto decidir ir pra Blaze:
```
functions/src/types.ts        tipos compartilhados
functions/src/admin.ts        init do Firebase Admin SDK
functions/src/qrCode.ts       geração/validação do token HMAC do QR do aluno
functions/src/certificate.ts  geração do PDF (pdf-lib) + upload pro Storage
functions/src/email.ts        envio de e-mail via Resend
functions/src/whatsapp.ts     envio de WhatsApp via Twilio Sandbox
functions/src/auth.ts         custom claim role via Admin SDK
functions/src/identityVerification.ts
                               código de confirmação via e-mail (versão Cloud Function)
functions/src/index.ts        onRegistrationCreated, onRegistrationCancelled,
                               checkInAttendance, closeEvent, verifyCertificate,
                               enviarLembretesDiarios, publicarEventosProgramados
```
Se um dia migrar pra Blaze: readicionar `functions` em `firebase.json`,
rodar `firebase deploy --only functions`, e trocar as chamadas diretas ao
Firestore no frontend (`web/src/pages/...`) de volta por `httpsCallable`
— o modelo de dados de `functions/src/types.ts` não é mais 100% igual ao
de `web/src/types/models.ts` (o do frontend não tem mais `qrToken`, e
`certificates` trocou `pdfUrl` por `pdfBase64`), então precisaria
reconciliar os dois antes.

## O que já está implementado (frontend — `web/`)
Vite + React + TypeScript + Tailwind v4, em `web/src/`:
```
lib/firebase.ts                init do SDK client (Auth, Firestore) + conexão
                                com emuladores via VITE_USE_EMULATORS
lib/worker.ts                  chamadas autenticadas ao Cloudflare Worker
lib/certificado.ts             geração do PDF do certificado no navegador
                                (pdf-lib) + código de validação
types/models.ts                modelo de dados do Firestore usado pelo cliente
contexts/AuthContext.tsx       usuário + perfil (Firestore) + loading
components/ProtectedRoute.tsx  gate por role + redireciona pro fluxo de
                                confirmação de identidade se necessário
pages/auth/                    Login, CadastroAluno, CadastroOrganizador,
                                ConfirmarIdentidade (código por e-mail via Worker)
pages/aluno/                   ListaEventos (filtra segmentação por curso),
                                DetalheEvento (inscrever/cancelar via transação),
                                MinhasInscricoes (QR via qrcode.react),
                                Certificados (lista + download do PDF base64)
pages/organizador/             ListaEventosOrganizador, FormularioEvento
                                (CRUD + máquina de estados + parceiros +
                                divulgação), PainelInscritos (tempo real +
                                encerrar evento + enviar lembrete manual),
                                ScannerQRCode (html5-qrcode → updateDoc direto)
pages/publico/VerificarCertificado.tsx
                                consulta o Firestore direto (allow read: if true)
```
`firebase.json` aponta hosting pra `web/dist` e liga os emuladores de
Auth/Firestore/Hosting nas mesmas portas que `web/src/lib/firebase.ts`
espera. Sem seção `functions`/`storage` de propósito (ver acima).

### Coisas que ficaram de fora por escopo (dá pra evoluir depois)
- Layout ainda é uma barra de navegação simples (sem menu hambúrguer
  dedicado); funciona mobile-first mas é o ponto mais "MVP" da UI.
- Sem paginação nas listas (`eventos`, `inscritos`).
- Sem code-splitting (`vite build` avisa que o bundle passa de 500kB,
  principalmente por causa do `pdf-lib` no bundle principal).
- Divulgação "programada" não publica sozinha (ver acima).
- Lembretes são manuais, não diários automáticos (ver acima).
- Worker não confere se quem chama `/certificado/notificar` e `/lembrete`
  é realmente organizador daquele evento (ver limitação na seção do
  Worker).

## Convenções do projeto
- Comentários de código e nomes de campo em português.
- UI em pt-BR.
- Status de evento: `rascunho`, `publicado`, `em_andamento`, `encerrado`.
- Status de inscrição: `inscrito`, `presente`, `ausente`, `cancelado`.

## Pendências / avisos conhecidos
- Resend usa `onboarding@resend.dev` como remetente — trocar por domínio
  verificado quando existir.
- WhatsApp via Twilio Sandbox — cada número precisa mandar `join <código>`
  pro número do Sandbox antes de receber mensagens; API oficial da Meta
  fica pra uma fase futura.
- Firestore Rules ainda não testadas no emulador — rodar
  `firebase emulators:start` antes de confiar cegamente nelas.
- `.firebaserc` já aponta pro projeto real (`eventec-academic`); numa
  máquina nova, rode `firebase login` e o CLI já reconhece esse arquivo —
  não precisa `firebase use --add` de novo, só logar com a conta certa.
