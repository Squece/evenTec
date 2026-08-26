import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { storage } from './admin';
import { EventDoc, UserProfile } from './types';

interface DadosCertificado {
  aluno: Pick<UserProfile, 'nome' | 'rm'>;
  evento: Pick<EventDoc, 'titulo' | 'dataHora' | 'cargaHoraria'>;
  organizadorNome: string;
  codigoValidacao: string;
}

/**
 * Gera o PDF do certificado e sobe pro Storage, devolvendo a URL de download.
 * Layout propositalmente simples (pdf-lib puro, sem headless browser) pra
 * rodar sem fricção dentro de Cloud Functions. Dá pra evoluir depois pra um
 * template HTML/CSS com Puppeteer se sobrar tempo.
 */
export async function gerarCertificadoPdf(
  registrationId: string,
  dados: DadosCertificado
): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([842, 595]); // A4 paisagem
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const { width, height } = page.getSize();

  page.drawText('Certificado de participação', {
    x: width / 2 - 180,
    y: height - 120,
    size: 26,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.15),
  });

  const dataFormatada = dados.evento.dataHora.toDate().toLocaleDateString('pt-BR');
  const cargaHorariaTexto = dados.evento.cargaHoraria
    ? ` com carga horária de ${dados.evento.cargaHoraria} horas,`
    : '';

  const corpo =
    `Certificamos que ${dados.aluno.nome} (RM ${dados.aluno.rm ?? '-'}) participou do evento ` +
    `"${dados.evento.titulo}", realizado em ${dataFormatada},${cargaHorariaTexto} ` +
    `promovido por ${dados.organizadorNome}.`;

  page.drawText(quebrarLinhas(corpo, 90), {
    x: 80,
    y: height - 220,
    size: 13,
    font: fontRegular,
    lineHeight: 20,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText(`Código de validação: ${dados.codigoValidacao}`, {
    x: 80,
    y: 60,
    size: 11,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  const pdfBytes = await pdfDoc.save();

  const bucket = storage.bucket();
  const caminho = `certificados/${registrationId}.pdf`;
  const arquivo = bucket.file(caminho);
  await arquivo.save(Buffer.from(pdfBytes), {
    contentType: 'application/pdf',
    metadata: { cacheControl: 'private, max-age=0' },
  });

  const [url] = await arquivo.getSignedUrl({
    action: 'read',
    expires: '2099-01-01', // ajuste a política real de expiração de link depois
  });

  return url;
}

function quebrarLinhas(texto: string, tamanhoMaximo: number): string {
  const palavras = texto.split(' ');
  const linhas: string[] = [];
  let linhaAtual = '';

  for (const palavra of palavras) {
    if ((linhaAtual + palavra).length > tamanhoMaximo) {
      linhas.push(linhaAtual.trim());
      linhaAtual = '';
    }
    linhaAtual += palavra + ' ';
  }
  linhas.push(linhaAtual.trim());
  return linhas.join('\n');
}
