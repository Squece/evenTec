# evenTec

Plataforma de gestão de eventos acadêmicos. **Em produção**:
[https://eventec-academic.web.app](https://eventec-academic.web.app)

Sem backend Firebase próprio — o projeto roda no plano gratuito (Spark) do
Firebase. Autorização é feita inteiramente por `firestore.rules`; o único
componente de servidor é um Cloudflare Worker gratuito que guarda as
chaves do Resend/Twilio. Contexto completo da decisão (e por quê) em
[CLAUDE.md](CLAUDE.md).

```
firestore.rules   regras de segurança — fazem o papel que Cloud Functions fariam
web/              frontend (Vite + React + TS + Tailwind) — Firebase Hosting
worker/           Cloudflare Worker — só envia e-mail/WhatsApp com o segredo protegido
functions/        Cloud Functions v2 completas, prontas mas NÃO implantadas —
                  caminho de upgrade se o projeto for pro plano Blaze
```

## Fluxo de presença por QR Code

1. Aluno se inscreve → uma transação no próprio navegador cria
   `registrations/{eventId}_{userId}` e incrementa `events.vagasOcupadas`,
   validada por `firestore.rules` (sem Cloud Function). Dispara (best
   effort) o e-mail de confirmação via Worker.
2. O QR Code (`web/src/pages/aluno/MinhasInscricoes.tsx`, com
   `qrcode.react`) já existe assim que a inscrição existe — o ID é
   determinístico, não precisa esperar nada gerar em background.
3. Na hora do evento, o organizador escaneia
   (`web/src/pages/organizador/ScannerQRCode.tsx`, com `html5-qrcode`),
   que lê a inscrição do Firestore e marca `status: 'presente'` — a regra
   só deixa isso acontecer se quem chamou for organizador daquele evento.
4. Ao encerrar o evento (Painel de Inscritos), o navegador do organizador
   gera o PDF do certificado (`pdf-lib`, roda em browser também), salva em
   base64 direto no Firestore (`certificates/{registrationId}`, sem
   Storage) e notifica o aluno por e-mail/WhatsApp via Worker.
5. Qualquer pessoa confere um certificado em `/verificar-certificado` — é
   uma leitura pública do Firestore (`allow read: if true` em
   `certificates`), sem precisar de endpoint HTTP dedicado.
6. Lembretes pros inscritos são disparados manualmente pelo organizador
   (botão no Painel de Inscritos) — sem servidor rodando 24/7, não tem
   como agendar isso sozinho.

## Rodando o frontend (`web/`)

```bash
cd web
cp .env.example .env   # já vem preenchido se você copiar do .env existente
npm install
npm run dev
```

Variáveis necessárias no `.env`: as 6 chaves `VITE_FIREBASE_*` (Console do
Firebase > Configurações do projeto > Seus apps > SDK setup) e
`VITE_WORKER_URL` (URL que `wrangler deploy` imprime — ver abaixo).

Pra rodar contra os emuladores locais em vez do projeto real, defina
`VITE_USE_EMULATORS=true` no `.env` e, em outro terminal, na raiz do
projeto: `firebase emulators:start`.

## Rodando/implantando as regras do Firestore

```bash
firebase login
firebase use --add          # só na primeira vez numa máquina nova
firebase deploy --only firestore:rules
```

Funciona no plano Spark (gratuito) — regras não exigem Blaze.

## Rodando/implantando o Worker (`worker/`)

```bash
cd worker
npm install
wrangler login
wrangler secret put RESEND_API_KEY
wrangler secret put TWILIO_ACCOUNT_SID
wrangler secret put TWILIO_AUTH_TOKEN
wrangler deploy
```

No Twilio Sandbox, cada aluno precisa mandar `join <código>` pro número do
Sandbox uma vez antes de conseguir receber WhatsApp — o código sai do
console do Twilio. Depois do primeiro `wrangler deploy`, copie a URL
impressa pra `VITE_WORKER_URL` no `.env` do frontend, e adicione o domínio
de produção do frontend em `ALLOWED_ORIGINS` no `worker/wrangler.toml`
antes de redeployar.

## Publicando o frontend no Firebase Hosting

```bash
cd web && npm run build && cd ..
firebase deploy --only hosting
```

## Ainda falta (próximos passos)

- Domínio verificado no Resend (hoje usa `onboarding@resend.dev`) e número
  de WhatsApp aprovado (hoje usa o Sandbox do Twilio).
- Testar as Firestore Rules no emulador antes de confiar cegamente nelas.
- Divulgação "programada" (publicar sozinho numa data futura) e lembretes
  diários automáticos ficaram sem equivalente nesta arquitetura sem
  servidor — ver CLAUDE.md.
- Se um dia migrar pro plano Blaze, `functions/` já tem a versão completa
  com Cloud Functions, custom claims e Storage — ver CLAUDE.md pra
  reconciliar o modelo de dados antes de reativar.
