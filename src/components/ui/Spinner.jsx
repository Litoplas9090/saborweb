// Indicadores de carga unificados: spinner aislado, mensaje en línea y
// pantalla completa centrada.
export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg
      className={`animate-spin text-current ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  )
}

// Carga en línea dentro de una sección (listas, métricas, etc.)
export function LoadingMessage({ label = 'Cargando…', className = '' }) {
  return (
    <p className={`mt-8 flex items-center gap-2 text-sm text-gray-500 ${className}`}>
      <Spinner />
      {label}
    </p>
  )
}

// Pantalla completa de carga (páginas públicas y guards de rutas)
export function PageLoading({ label = 'Cargando…' }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">
      <p className="flex items-center gap-3 text-sm">
        <Spinner className="h-6 w-6" />
        {label}
      </p>
    </main>
  )
}
