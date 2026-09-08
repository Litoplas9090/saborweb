// Botón unificado de la plataforma.
// Variantes: primary (índigo, paneles admin), brand (ámbar, vistas públicas),
// outline (secundario), danger (destructivo), ghost (sutil).
const VARIANTS = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
  brand: 'bg-amber-600 text-white hover:bg-amber-700',
  outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100',
  danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
  ghost: 'text-gray-500 hover:bg-gray-100',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    />
  )
}
