export default function Spinner() {
  return (
    <div className="flex justify-center items-center py-12" role="status" aria-label="Carregando">
      <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
