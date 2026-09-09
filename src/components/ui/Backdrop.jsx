// Fondo dinámico de SaborWeb. Capa decorativa (sin interacción, oculta a
// lectores de pantalla) con animación CSS pura.
// El root usa -z-10 y el contenedor padre lleva la clase `isolate`: así el
// fondo queda SIEMPRE detrás del contenido y el texto se lee nítido.
// TODAS las pantallas muestran ingredientes flotando: 6 para las vistas
// públicas ("warm") y 6 diferentes para los paneles ("admin") — 12 en total.
// Usar como primer hijo de un contenedor con `relative isolate` y
// `overflow-x-clip` (o overflow-hidden).

const FOOD_FLOATS_WARM = [
  { icon: '🍽️', top: '12%', left: '6%', size: '5rem', delay: '0s', duration: '13s' },
  { icon: '🌶️', top: '68%', left: '9%', size: '4rem', delay: '-4s', duration: '11s' },
  { icon: '🥑', top: '22%', left: '86%', size: '4.5rem', delay: '-2s', duration: '14s' },
  { icon: '🍋', top: '78%', left: '82%', size: '3.5rem', delay: '-7s', duration: '12s' },
  { icon: '🥘', top: '48%', left: '46%', size: '6rem', delay: '-5s', duration: '16s' },
  { icon: '🌿', top: '6%', left: '56%', size: '3rem', delay: '-9s', duration: '10s' },
]

const FOOD_FLOATS_ADMIN = [
  { icon: '🍕', top: '10%', left: '8%', size: '4.5rem', delay: '-1s', duration: '12s' },
  { icon: '🍔', top: '70%', left: '6%', size: '4rem', delay: '-6s', duration: '14s' },
  { icon: '🍣', top: '18%', left: '84%', size: '4rem', delay: '-3s', duration: '11s' },
  { icon: '🥗', top: '75%', left: '86%', size: '4.5rem', delay: '-8s', duration: '13s' },
  { icon: '🍰', top: '45%', left: '48%', size: '4rem', delay: '-5s', duration: '15s' },
  { icon: '☕', top: '5%', left: '55%', size: '3.5rem', delay: '-10s', duration: '10s' },
]

const GRADIENTS = {
  warm: 'bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100',
  admin: 'bg-gradient-to-br from-slate-100 via-indigo-50/70 to-slate-100',
}

export default function Backdrop({ variant = 'warm' }) {
  const floats = variant === 'admin' ? FOOD_FLOATS_ADMIN : FOOD_FLOATS_WARM

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${GRADIENTS[variant]}`}
    >
      {/* ingredientes flotando. La capa externa flota (animación); la interna
          crece al pasar el cursor. Como el fondo queda siempre detrás del
          contenido, el hover solo responde en zonas libres de la pantalla. */}
      {floats.map((f) => (
        <span
          key={f.icon}
          className="sw-float absolute select-none"
          style={{
            top: f.top,
            left: f.left,
            fontSize: f.size,
            animationDelay: f.delay,
            animationDuration: f.duration,
          }}
        >
          <span className="block cursor-pointer leading-none opacity-25 transition-transform duration-300 ease-out hover:scale-125 hover:opacity-40">
            {f.icon}
          </span>
        </span>
      ))}
    </div>
  )
}
