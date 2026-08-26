// Geração do PDF do certificado, portada de functions/src/certificate.ts
// pra rodar no navegador do organizador — pdf-lib funciona em browser
// também, e sem Blaze não tem Cloud Function nem Storage pra fazer isso do
// lado do servidor (ver CLAUDE.md).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Timestamp } from 'firebase/firestore';

interface DadosCertificado {
  aluno: { nome: string };
  evento: { titulo: string; dataHora: Timestamp; cargaHoraria?: number };
  organizadorNome: string;
  codigoValidacao: string;
}

export function gerarCodigoValidacao(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
}

export async function gerarCertificadoPdfBase64(dados: DadosCertificado): Promise<string> {
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
    `Certificamos que ${dados.aluno.nome} participou do evento ` +
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

  return pdfDoc.saveAsBase64();
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
