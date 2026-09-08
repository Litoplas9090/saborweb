// Input unificado. El acento del foco sigue la paleta de la vista:
// 'indigo' en paneles admin, 'amber' en vistas públicas.
const ACCENTS = {
  indigo: 'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200',
  amber: 'focus:border-amber-500 focus:ring-2 focus:ring-amber-200',
}

export default function Input({ accent = 'indigo', className = '', ...props }) {
  return (
    <input
      className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition ${ACCENTS[accent]} ${className}`}
      {...props}
    />
  )
}
