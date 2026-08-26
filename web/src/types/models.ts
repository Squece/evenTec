// Modelo de dados do Firestore. Sem backend próprio (ver CLAUDE.md): tudo
// aqui é gravado/lido direto pelo cliente, autorizado por firestore.rules.
import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'aluno' | 'organizador';

export interface UserProfile {
  uid: string;
  role: UserRole;
  nome: string;
  curso?: string;
  email: string; // e-mail pessoal — é o login (Firebase Auth)
  emailInstitucional?: string; // só aluno — recebe o código de confirmação de identidade
  telefone: string;
  telefoneVerificado: boolean;
  criadoEm: Timestamp;
}

export type EventStatus = 'rascunho' | 'publicado' | 'em_andamento' | 'encerrado';

export type TipoDivulgacao = 'imediata' | 'programada' | 'segmentada';

export interface DivulgacaoConfig {
  tipo: TipoDivulgacao;
  cursosAlvo?: string[];
}

export interface EventDoc {
  titulo: string;
  descricao: string;
  dataHora: Timestamp;
  local: string;
  modalidade: 'presencial' | 'online';
  cargaHoraria?: number;
  capacidade?: number;
  vagasOcupadas: number;
  status: EventStatus;
  organizadorId: string;
  parceiros: string[];
  divulgacao: DivulgacaoConfig;
  lembretesAtivos: boolean;
  dataDivulgacao?: Timestamp;
  criadoEm: Timestamp;
}

export type RegistrationStatus = 'inscrito' | 'presente' | 'ausente' | 'cancelado';

// ID do documento = "{eventId}_{userId}" (determinístico — ver
// firestore.rules) em vez de auto-gerado.
export interface RegistrationDoc {
  eventId: string;
  userId: string;
  status: RegistrationStatus;
  checkedInAt?: Timestamp;
  criadoEm: Timestamp;
}

// ID do documento = ID da própria inscrição (1 certificado por inscrição).
export interface CertificateDoc {
  registrationId: string;
  eventId: string;
  userId: string;
  codigoValidacao: string;
  pdfBase64: string; // PDF gerado no navegador do organizador — sem Storage
  emitidoEm: Timestamp;
}
