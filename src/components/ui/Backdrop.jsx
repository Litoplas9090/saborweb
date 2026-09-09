// Fondo dinámico de SaborWeb. Capa decorativa (sin interacción, oculta a
// lectores de pantalla) con animación CSS pura: bokeh en deriva lenta, vapor
// de cocina ascendente e ingredientes flotando. No afecta el rendimiento:
// solo transform y opacity.
// Variantes: "warm" (vistas públicas, ambiente de restaurante) y
// "admin" (paneles de gestión, sobrio). Usar como primer hijo de un
// contenedor con `relative` y `overflow-x-clip` (o overflow-hidden).

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
        className="pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-br from-slate-100 via-indigo-50/70 to-slate-100"
      >
        <div className="sw-drift absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-200/50 blur-3xl" />
        <div className="sw-drift-slow absolute -right-32 top-1/3 h-96 w-96 rounded-full bg-amber-200/40 blur-3xl" />
        <div
          className="sw-drift absolute -bottom-40 left-1/3 h-96 w-96 rounded-full bg-sky-200/40 blur-3xl"
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
      {/* bokeh cálido en deriva lenta (baja opacidad: ambiente sin restar legibilidad) */}
      <div className="sw-drift absolute -top-24 left-8 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl" />
      <div className="sw-drift-slow absolute right-0 top-1/4 h-96 w-96 rounded-full bg-orange-300/15 blur-3xl" />
      <div
        className="sw-drift absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-yellow-200/25 blur-3xl"
        style={{ animationDelay: '-9s' }}
      />
      {/* ingredientes flotando (muy tenues) */}
      {FOOD_FLOATS.map((f) => (
        <span
          key={f.icon}
          className="sw-float absolute select-none leading-none opacity-[0.05]"
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
