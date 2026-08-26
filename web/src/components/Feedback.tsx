interface FeedbackProps {
  tipo: 'sucesso' | 'erro';
  mensagem: string;
}

export function Feedback({ tipo, mensagem }: FeedbackProps) {
  const estilos =
    tipo === 'sucesso'
      ? 'bg-green-50 text-green-800 border-green-300'
      : 'bg-red-50 text-red-800 border-red-300';

  return (
    <div role="status" className={`border rounded-md px-3 py-2 text-sm ${estilos}`}>
      {mensagem}
    </div>
  );
}
