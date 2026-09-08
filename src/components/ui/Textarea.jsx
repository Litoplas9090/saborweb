const ACCENTS = {
  indigo: 'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200',
  amber: 'focus:border-amber-500 focus:ring-2 focus:ring-amber-200',
}

export default function Textarea({ accent = 'indigo', className = '', ...props }) {
  return (
    <textarea
      className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition ${ACCENTS[accent]} ${className}`}
      {...props}
    />
  )
}
