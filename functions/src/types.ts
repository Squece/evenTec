export type UserRole = 'aluno' | 'organizador';

export interface UserProfile {
  uid: string;
  role: UserRole;
  nome: string;
  rm?: string;
  curso?: string; // usado pra divulgação segmentada de eventos (só faz sentido pro aluno)
  email: string;
  telefone: string;
  telefoneVerificado: boolean;
  criadoEm: FirebaseFirestore.Timestamp;
}

export type EventStatus = 'rascunho' | 'publicado' | 'em_andamento' | 'encerrado';

export type TipoDivulgacao = 'imediata' | 'programada' | 'segmentada';

export interface DivulgacaoConfig {
  tipo: TipoDivulgacao;
  cursosAlvo?: string[]; // só usado quando tipo === 'segmentada'
}

export interface EventDoc {
  titulo: string;
  descricao: string;
  dataHora: FirebaseFirestore.Timestamp;
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
  dataDivulgacao?: FirebaseFirestore.Timestamp; // usado quando divulgacao.tipo === 'programada'
  criadoEm: FirebaseFirestore.Timestamp;
}

export interface RegistrationDoc {
  eventId: string;
  userId: string;
  status: 'inscrito' | 'presente' | 'ausente' | 'cancelado';
  qrToken?: string;
  checkedInAt?: FirebaseFirestore.Timestamp;
  criadoEm: FirebaseFirestore.Timestamp;
}

export interface CertificateDoc {
  registrationId: string;
  eventId: string;
  userId: string;
  codigoValidacao: string;
  pdfUrl: string;
  emitidoEm: FirebaseFirestore.Timestamp;
}

export interface NotificationLogDoc {
  eventId: string;
  userId: string;
  tipo: 'confirmacao_inscricao' | 'lembrete' | 'certificado';
  canal: 'email' | 'whatsapp';
  sucesso: boolean;
  enviadoEm: FirebaseFirestore.Timestamp;
}
