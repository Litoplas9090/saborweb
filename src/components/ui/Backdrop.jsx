// Fondo dinámico de SaborWeb. Capa decorativa (sin interacción, oculta a
// lectores de pantalla) con animación CSS pura.
// REGLA DE LEGIBILIDAD: toda decoración vive en las esquinas, medio fuera de
// la pantalla; la zona central queda limpia para que el contenido se lea
// nítido. Solo transform/opacity en las animaciones (rendimiento).
// Variantes: "warm" (vistas públicas) y "admin" (paneles de gestión).
// Usar como primer hijo de un contenedor con `relative` y `overflow-x-clip`.

export default function Backdrop({ variant = 'warm' }) {
  if (variant === 'admin') {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-br from-slate-100 via-indigo-50/70 to-slate-100"
      >
        <div className="sw-drift absolute -left-40 -top-40 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="sw-drift-slow absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-amber-200/30 blur-3xl" />
        <div
          className="sw-drift absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-sky-200/30 blur-3xl"
          style={{ animationDelay: '-8s' }}
        />
      </div>
    )
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100"
    >
      {/* Resplandores SOLO en las esquinas (medio fuera de pantalla).
          Derivan lentamente: el fondo se mueve sin tocar la zona de lectura. */}
      <div className="sw-drift absolute -left-40 -top-40 h-96 w-96 rounded-full bg-amber-300/25 blur-3xl" />
      <div className="sw-drift-slow absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-orange-300/20 blur-3xl" />
      <div
        className="sw-drift absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-yellow-200/25 blur-3xl"
        style={{ animationDelay: '-9s' }}
      />
    </div>
  )
}
