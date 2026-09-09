// Fondo dinámico de SaborWeb. Capa decorativa (sin interacción, oculta a
// lectores de pantalla) con animación CSS pura.
// El root usa -z-10 y el contenedor padre lleva la clase `isolate`: así el
// fondo queda SIEMPRE detrás del contenido y el texto se lee nítido.
// Variantes: "warm" (vistas públicas: gradiente cálido + ingredientes
// flotando muy tenues) y "admin" (paneles: gradiente sobrio).
// Usar como primer hijo de un contenedor con `relative isolate` y
// `overflow-x-clip` (o overflow-hidden).

const FOOD_FLOATS = [
  { icon: '🍽️', top: '12%', left: '6%', size: '5rem', delay: '0s', duration: '13s' },
  { icon: '🌶️', top: '68%', left: '9%', size: '4rem', delay: '-4s', duration: '11s' },
  { icon: '🥑', top: '22%', left: '86%', size: '4.5rem', delay: '-2s', duration: '14s' },
  { icon: '🍋', top: '78%', left: '82%', size: '3.5rem', delay: '-7s', duration: '12s' },
  { icon: '🥘', top: '48%', left: '46%', size: '6rem', delay: '-5s', duration: '16s' },
  { icon: '🌿', top: '6%', left: '56%', size: '3rem', delay: '-9s', duration: '10s' },
]

export default function Backdrop({ variant = 'warm' }) {
  if (variant === 'admin') {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-gradient-to-br from-slate-100 via-indigo-50/70 to-slate-100"
      />
    )
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100"
    >
      {/* ingredientes flotando (muy tenues: ambiente sin tocar la legibilidad) */}
      {FOOD_FLOATS.map((f) => (
        <span
          key={f.icon}
          className="sw-float absolute select-none leading-none opacity-[0.06]"
          style={{
            top: f.top,
            left: f.left,
            fontSize: f.size,
            animationDelay: f.delay,
            animationDuration: f.duration,
          }}
        >
          {f.icon}
        </span>
      ))}
    </div>
  )
}
