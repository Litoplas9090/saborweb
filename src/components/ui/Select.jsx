const ACCENTS = {
  indigo: 'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200',
  amber: 'focus:border-amber-500 focus:ring-2 focus:ring-amber-200',
}

export default function Select({ accent = 'indigo', className = '', children, ...props }) {
  return (
    <select
      className={`rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition ${ACCENTS[accent]} ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}
