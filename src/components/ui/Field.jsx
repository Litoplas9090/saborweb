// Campo de formulario con etiqueta y texto de ayuda.
export default function Field({ label, htmlFor, hint, className = '', children }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
      )}
      {children}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
}
