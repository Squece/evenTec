import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './admin';
import { gerarQrPayload, validarAssinatura, gerarCodigoValidacaoCertificado } from './qrCode';
import { gerarCertificadoPdf } from './certificate';
import { enviarEmail } from './email';
import { enviarWhatsApp } from './whatsapp';
import { EventDoc, RegistrationDoc, UserProfile, NotificationLogDoc } from './types';

export * from './auth';
export * from './identityVerification';

// Secrets usados pelos disparos de notificação (email.ts / whatsapp.ts).
// Precisam ser configurados antes do deploy, ex:
//   firebase functions:secrets:set RESEND_API_KEY
//   firebase functions:secrets:set TWILIO_ACCOUNT_SID
//   firebase functions:secrets:set TWILIO_AUTH_TOKEN
const SEGREDOS_NOTIFICACAO = ['RESEND_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'];

// TODO: ajustar quando o domínio de produção do evenTec for definido.
const APP_URL = process.env.APP_URL ?? 'https://eventec.app';

async function registrarNotificacao(dados: Omit<NotificationLogDoc, 'enviadoEm'>) {
  await db.collection('notificationsLog').add({
    ...dados,
    enviadoEm: FieldValue.serverTimestamp(),
  });
}

/**
 * Ao criar uma inscrição, gera o token assinado do QR Code do ALUNO e manda
 * o e-mail de confirmação da inscrição.
 * O frontend do aluno renderiza esse token como QR (ex: com qrcode.react).
 * O organizador é quem escaneia — nunca o contrário.
 */
export const onRegistrationCreated = onDocumentCreated(
  { document: 'registrations/{registrationId}', secrets: SEGREDOS_NOTIFICACAO },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const registrationId = event.params.registrationId;
    const registro = snap.data() as RegistrationDoc;

    const eventoRef = db.collection('events').doc(registro.eventId);
    const vagaConfirmada = await db.runTransaction(async (tx) => {
      const eventoAtualSnap = await tx.get(eventoRef);
      const eventoAtual = eventoAtualSnap.data() as EventDoc | undefined;
      if (!eventoAtual) return false;
      if (eventoAtual.capacidade != null && eventoAtual.vagasOcupadas >= eventoAtual.capacidade) {
        tx.update(snap.ref, { status: 'cancelado' });
        return false;
      }
      tx.update(eventoRef, { vagasOcupadas: FieldValue.increment(1) });
      return true;
    });
    // Evento lotado: inscrição já foi marcada como cancelada acima — não
    // gera QR nem manda e-mail de confirmação pra uma vaga que não existe.
    if (!vagaConfirmada) return;

    const payload = gerarQrPayload(registrationId, registro.eventId);
    await snap.ref.update({ qrToken: payload.token });

    const [eventoSnap, alunoSnap] = await Promise.all([
      db.collection('events').doc(registro.eventId).get(),
      db.collection('users').doc(registro.userId).get(),
    ]);
    const evento = eventoSnap.data() as EventDoc | undefined;
    const aluno = alunoSnap.data() as UserProfile | undefined;
    if (!evento || !aluno) return;

    const sucesso = await enviarEmail({
      para: aluno.email,
      assunto: `Inscrição confirmada: ${evento.titulo}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Olá ${aluno.nome}!</h2>
          <p>Sua inscrição no evento <strong>${evento.titulo}</strong> foi confirmada com sucesso.</p>
          <p>
            <a href="${APP_URL}/eventos/${registro.eventId}"
               style="background-color: #2563eb; color: white; padding: 12px 24px;
                      text-decoration: none; border-radius: 6px; display: inline-block;">
              Ver meu QR Code
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">Qualquer dúvida, entre em contato com a organização.</p>
        </div>
      `,
    });

    await registrarNotificacao({
      eventId: registro.eventId,
      userId: registro.userId,
      tipo: 'confirmacao_inscricao',
      canal: 'email',
      sucesso,
    });
  }
);

/**
 * Chamada pelo app do ORGANIZADOR depois de escanear o QR Code do ALUNO.
 * Valida a assinatura e marca a presença.
 */
export const checkInAttendance = onCall(async (request) => {
  const { registrationId, eventId, token } = request.data as {
    registrationId: string;
    eventId: string;
    token: string;
  };

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Apenas organizadores autenticados podem confirmar presença.');
  }
  if (request.auth.token.role !== 'organizador') {
    throw new HttpsError('permission-denied', 'Apenas organizadores podem confirmar presença.');
  }
  if (!validarAssinatura(registrationId, eventId, token)) {
    throw new HttpsError('invalid-argument', 'QR Code inválido ou adulterado.');
  }

  const ref = db.collection('registrations').doc(registrationId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.eventId !== eventId) {
    throw new HttpsError('not-found', 'Inscrição não encontrada para este evento.');
  }
  if (doc.data()?.status === 'presente') {
    return { ok: true, jaConfirmado: true };
  }

  await ref.update({
    status: 'presente',
    checkedInAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, jaConfirmado: false };
});

/**
 * O aluno pode cancelar a própria inscrição (firestore.rules só permite
 * essa transição pontual: 'inscrito' → 'cancelado', mais nada). Libera a
 * vaga de volta pro evento.
 */
export const onRegistrationCancelled = onDocumentUpdated('registrations/{registrationId}', async (event) => {
  const antes = event.data?.before.data() as RegistrationDoc | undefined;
  const depois = event.data?.after.data() as RegistrationDoc | undefined;
  if (!antes || !depois) return;

  if (antes.status === 'inscrito' && depois.status === 'cancelado') {
    await db.collection('events').doc(depois.eventId).update({
      vagasOcupadas: FieldValue.increment(-1),
    });
  }
});

/**
 * Fechamento do evento pelo organizador: para cada inscrito com presença
 * confirmada, gera o certificado (PDF + código de validação) e avisa o
 * aluno por e-mail e WhatsApp.
 */
export const closeEvent = onCall({ secrets: SEGREDOS_NOTIFICACAO }, async (request) => {
  const { eventId } = request.data as { eventId: string };

  if (!request.auth || request.auth.token.role !== 'organizador') {
    throw new HttpsError('permission-denied', 'Apenas organizadores podem encerrar eventos.');
  }

  const eventoRef = db.collection('events').doc(eventId);
  const eventoSnap = await eventoRef.get();
  if (!eventoSnap.exists) {
    throw new HttpsError('not-found', 'Evento não encontrado.');
  }
  const evento = eventoSnap.data() as EventDoc;

  if (evento.organizadorId !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Você não é o organizador deste evento.');
  }

  const organizadorSnap = await db.collection('users').doc(evento.organizadorId).get();
  const organizador = organizadorSnap.data() as UserProfile | undefined;

  const inscricoesSnap = await db
    .collection('registrations')
    .where('eventId', '==', eventId)
    .where('status', '==', 'presente')
    .get();

  let certificadosGerados = 0;

  for (const doc of inscricoesSnap.docs) {
    const registro = doc.data() as RegistrationDoc;
    const alunoSnap = await db.collection('users').doc(registro.userId).get();
    const aluno = alunoSnap.data() as UserProfile | undefined;
    if (!aluno) continue;

    const codigoValidacao = gerarCodigoValidacaoCertificado();
    const pdfUrl = await gerarCertificadoPdf(doc.id, {
      aluno: { nome: aluno.nome, rm: aluno.rm },
      evento: { titulo: evento.titulo, dataHora: evento.dataHora, cargaHoraria: evento.cargaHoraria },
      organizadorNome: organizador?.nome ?? 'Organizador',
      codigoValidacao,
    });

    await db.collection('certificates').add({
      registrationId: doc.id,
      eventId,
      userId: registro.userId,
      codigoValidacao,
      pdfUrl,
      emitidoEm: FieldValue.serverTimestamp(),
    });

    const sucessoEmail = await enviarEmail({
      para: aluno.email,
      assunto: `Seu certificado — ${evento.titulo}`,
      html: `<p>Olá ${aluno.nome}, seu certificado já está disponível na plataforma.</p>
             <p><a href="${pdfUrl}">Baixar certificado</a></p>`,
    });
    await registrarNotificacao({
      eventId,
      userId: registro.userId,
      tipo: 'certificado',
      canal: 'email',
      sucesso: sucessoEmail,
    });

    const sucessoWhatsApp = await enviarWhatsApp({
      telefone: aluno.telefone,
      mensagem: `Olá ${aluno.nome}! 🎓\n\nSeu certificado do evento *${evento.titulo}* já está disponível.\n\nBaixe aqui: ${pdfUrl}`,
    });
    await registrarNotificacao({
      eventId,
      userId: registro.userId,
      tipo: 'certificado',
      canal: 'whatsapp',
      sucesso: sucessoWhatsApp,
    });

    certificadosGerados++;
  }

  await eventoRef.update({ status: 'encerrado' });

  return { ok: true, certificadosGerados };
});

/**
 * Endpoint público (sem auth) pra validar autenticidade de um certificado
 * a partir do código impresso nele — a "API pública de validação" citada
 * como diferencial no desafio.
 */
export const verifyCertificate = onRequest(async (req, res) => {
  const codigo = (req.query.codigo as string)?.trim();
  if (!codigo) {
    res.status(400).json({ valido: false, erro: 'Informe o código de validação.' });
    return;
  }

  const snap = await db
    .collection('certificates')
    .where('codigoValidacao', '==', codigo)
    .limit(1)
    .get();

  if (snap.empty) {
    res.status(404).json({ valido: false });
    return;
  }

  const certificado = snap.docs[0].data();
  res.status(200).json({
    valido: true,
    emitidoEm: certificado.emitidoEm,
    eventId: certificado.eventId,
  });
});

// Brasília é UTC-3 fixo (sem horário de verão desde 2019) — evita puxar
// timezone do runtime, que roda em UTC independente do `timeZone` abaixo
// (esse parâmetro só controla o horário do disparo, não o relógio interno).
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;

function limitesDoDiaEmBrasilia(referencia: Date) {
  const emBrasilia = new Date(referencia.getTime() - OFFSET_BRASILIA_MS);
  const inicioBrasilia = Date.UTC(emBrasilia.getUTCFullYear(), emBrasilia.getUTCMonth(), emBrasilia.getUTCDate());
  const inicio = new Date(inicioBrasilia + OFFSET_BRASILIA_MS);
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { inicio, fim };
}

/**
 * Lembrete automático diário pros alunos já inscritos em eventos que
 * acontecem hoje. Roda como Cloud Scheduler (não node-cron: instâncias de
 * Cloud Functions não ficam de pé o tempo todo pra um setInterval/cron em
 * processo funcionar de forma confiável).
 *
 * Requer um índice composto em `events` (dataHora + status) — o primeiro
 * deploy imprime o link pra criar esse índice caso ainda não exista.
 */
export const enviarLembretesDiarios = onSchedule(
  { schedule: 'every day 08:00', timeZone: 'America/Sao_Paulo', secrets: SEGREDOS_NOTIFICACAO },
  async () => {
    const { inicio, fim } = limitesDoDiaEmBrasilia(new Date());

    const eventosHojeSnap = await db
      .collection('events')
      .where('dataHora', '>=', Timestamp.fromDate(inicio))
      .where('dataHora', '<=', Timestamp.fromDate(fim))
      .where('status', 'in', ['publicado', 'em_andamento'])
      .get();

    for (const eventoDoc of eventosHojeSnap.docs) {
      const evento = eventoDoc.data() as EventDoc;
      if (evento.lembretesAtivos === false) continue;

      const inscritosSnap = await db
        .collection('registrations')
        .where('eventId', '==', eventoDoc.id)
        .where('status', '==', 'inscrito')
        .get();

      for (const registroDoc of inscritosSnap.docs) {
        const registro = registroDoc.data() as RegistrationDoc;
        const alunoSnap = await db.collection('users').doc(registro.userId).get();
        const aluno = alunoSnap.data() as UserProfile | undefined;
        if (!aluno) continue;

        const linkEvento = `${APP_URL}/eventos/${eventoDoc.id}`;

        const sucessoEmail = await enviarEmail({
          para: aluno.email,
          assunto: `Lembrete: hoje é o dia do evento ${evento.titulo}`,
          html: `<p>Olá ${aluno.nome}, passando pra lembrar que hoje é o dia do evento <strong>${evento.titulo}</strong>.</p>
                 <p><a href="${linkEvento}">Ver meu QR Code</a></p>`,
        });
        await registrarNotificacao({
          eventId: eventoDoc.id,
          userId: registro.userId,
          tipo: 'lembrete',
          canal: 'email',
          sucesso: sucessoEmail,
        });

        const sucessoWhatsApp = await enviarWhatsApp({
          telefone: aluno.telefone,
          mensagem: `Olá ${aluno.nome}! 📅\n\nLembrete: hoje é o dia do evento *${evento.titulo}*.\n\nAcesse o app: ${linkEvento}`,
        });
        await registrarNotificacao({
          eventId: eventoDoc.id,
          userId: registro.userId,
          tipo: 'lembrete',
          canal: 'whatsapp',
          sucesso: sucessoWhatsApp,
        });
      }
    }
  }
);

/**
 * Divulgação "programada": publica automaticamente eventos em rascunho
 * quando chega a `dataDivulgacao` configurada pelo organizador. Divulgação
 * "imediata" não passa por aqui — o organizador já publica na hora, direto
 * pela tela de CRUD. Divulgação "segmentada" é um filtro de visibilidade
 * (por curso) aplicado no frontend sobre eventos já publicados, não uma
 * transição de estado.
 */
export const publicarEventosProgramados = onSchedule('every 15 minutes', async () => {
  const agora = Timestamp.now();

  const pendentesSnap = await db
    .collection('events')
    .where('status', '==', 'rascunho')
    .where('dataDivulgacao', '<=', agora)
    .get();

  const publicaveis = pendentesSnap.docs.filter(
    (doc) => (doc.data() as EventDoc).divulgacao?.tipo === 'programada'
  );

  await Promise.all(publicaveis.map((doc) => doc.ref.update({ status: 'publicado' })));
});
