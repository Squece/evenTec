import type { Timestamp } from 'firebase/firestore';

export function formatarDataHora(ts: Timestamp): string {
  return ts.toDate().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatarData(ts: Timestamp): string {
  return ts.toDate().toLocaleDateString('pt-BR');
}

export function paraDatetimeLocal(data: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}T${pad(data.getHours())}:${pad(data.getMinutes())}`;
}
