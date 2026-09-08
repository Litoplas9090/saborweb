// Estado vacío unificado: lista sin resultados, menú sin platos, etc.
export default function EmptyState({ message, className = '' }) {
  return (
    <p
      className={`rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500 ${className}`}
    >
      {message}
    </p>
  )
}
