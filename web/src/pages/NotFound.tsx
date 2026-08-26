import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="text-center mt-16 space-y-3">
      <h1 className="text-3xl font-bold">Página não encontrada</h1>
      <Link to="/" className="text-blue-600 underline">
        Voltar ao início
      </Link>
    </div>
  );
}
