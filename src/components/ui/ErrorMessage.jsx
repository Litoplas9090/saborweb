import Button from './Button.jsx'

// Mensaje de error visible para el usuario, con botón de reintento opcional.
export default function ErrorMessage({ message, onRetry, retryLabel = 'Reintentar', className = '' }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 ${className}`}
    >
      <span className="min-w-0">{message}</span>
      {onRetry && (
        <Button variant="danger" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
