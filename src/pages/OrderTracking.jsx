import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { money, shortOrderId } from '../lib/format.js'
import { unlockAudio, playAlertSound } from '../lib/audio.js'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { Spinner } from '../components/ui/Spinner.jsx'

const PHONE_KEY = 'saborweb_phone'

const STAGES = ['registrado', 'en_preparacion', 'preparado', 'entregado']

const STAGE_LABEL = {
  registrado: 'Registrado',
  en_preparacion: 'En preparación',
  preparado: '¡Preparado!',
  entregado: 'Entregado',
}

const STAGE_BADGE = {
  registrado: 'bg-blue-100 text-blue-700',
  en_preparacion: 'bg-amber-100 text-amber-700',
  preparado: 'bg-green-100 text-green-700',
  entregado: 'bg-gray-200 text-gray-500',
}

export default function OrderTracking() {
  const [phone, setPhone] = useState(() => localStorage.getItem(PHONE_KEY) ?? '')
  const [soundOn, setSoundOn] = useState(false)
  const [orders, setOrders] = useState([])
  const [itemsByOrder, setItemsByOrder] = useState({})
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const prevStatuses = useRef({}) // para detectar transiciones en los refrescos silenciosos

  /* ---------- Desbloqueo de audio (gesto del usuario) ---------- */

  async function handleActivateSound() {
    const running = await unlockAudio()
    setSoundOn(running)
    if (running) playAlertSound() // confirmación audible
  }

  /* ---------- Consulta de pedidos por teléfono ---------- */

  async function loadOrders(phoneValue, { silent } = {}) {
    if (!silent) {
      setLoading(true)
      setError(null)
      setSearched(true)
    }
    localStorage.setItem(PHONE_KEY, phoneValue)

    const { data: orderRows, error: rpcError } = await supabase.rpc('get_my_orders', {
      p_phone: phoneValue,
    })

    if (rpcError) {
      if (!silent) {
        setError('No pudimos consultar tus pedidos. Intenta de nuevo.')
        setOrders([])
        setItemsByOrder({})
      }
      setLoading(false)
      return
    }

    const rows = orderRows ?? []
    setOrders(rows)

    // En refrescos silenciosos, alertar si un pedido acaba de pasar a "preparado"
    if (silent) {
      for (const row of rows) {
        const before = prevStatuses.current[row.id]
        if (row.status === 'preparado' && before && before !== 'preparado') {
          playAlertSound()
        }
      }
    }
    prevStatuses.current = Object.fromEntries(rows.map((r) => [r.id, r.status]))

    // Platos de cada pedido (RPC get_order_items incluye el nombre del plato)
    const grouped = {}
    await Promise.all(
      rows.map(async (order) => {
        const { data: itemRows } = await supabase.rpc('get_order_items', {
          p_order_id: order.id,
        })
        grouped[order.id] = itemRows ?? []
      })
    )
    setItemsByOrder(grouped)
    setLoading(false)
  }

  // Al volver con el teléfono guardado, mostrar los pedidos de inmediato
  useEffect(() => {
    const saved = localStorage.getItem(PHONE_KEY)
    if (saved) loadOrders(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearch(e) {
    e.preventDefault()
    loadOrders(phone.trim())
  }

  /* ---------- Realtime: broadcast "order:{id}" de cada pedido activo ---------- */

  const activeIds = orders
    .filter((o) => o.status !== 'entregado')
    .map((o) => o.id)
    .join(',')

  useEffect(() => {
    if (!activeIds) return
    const ids = activeIds.split(',')

    const channels = ids.map((id) =>
      supabase
        .channel(`order:${id}`)
        .on('broadcast', { event: 'status_changed' }, (msg) => {
          const newStatus = msg.payload?.status
          if (!newStatus) return

          setOrders((prev) =>
            prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
          )
          prevStatuses.current[id] = newStatus

          // Alerta sonora al pasar a "preparado" (SPEC sección 4)
          if (newStatus === 'preparado') {
            playAlertSound()
          }
        })
        .subscribe()
    )

    return () => {
      channels.forEach((c) => supabase.removeChannel(c))
    }
  }, [activeIds])

  // Respaldo si el WebSocket no conecta: refresco silencioso mientras haya
  // pedidos activos, para que el estado se actualice sin recargar la página.
  useEffect(() => {
    if (!searched) return
    const hasActive = orders.some((o) => o.status !== 'entregado')
    if (!hasActive) return
    const interval = setInterval(() => loadOrders(phone, { silent: true }), 20000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, phone, orders])

  /* ---------- Render ---------- */

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-amber-600 text-white">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <Link to="/" className="text-sm text-amber-200 hover:underline">
            ← SaborWeb
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
            Seguimiento de pedidos
          </h1>
          <p className="mt-1 text-sm text-amber-100">
            Ingresa el teléfono con el que hiciste tu pedido.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4">
        {/* Botón de desbloqueo de audio */}
        {!soundOn && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">
              🔕 Activa el sonido para recibir una alerta cuando tu pedido esté listo.
            </p>
            <Button variant="brand" onClick={handleActivateSound}>
              Activar alertas de sonido
            </Button>
          </div>
        )}
        {soundOn && (
          <p className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            🔊 Alertas de sonido activadas. Te avisaremos cuando tu pedido esté preparado
            (mantén esta pestaña abierta).
          </p>
        )}

        {/* Formulario de teléfono */}
        <form onSubmit={handleSearch} className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Input
            accent="amber"
            type="tel"
            required
            minLength={6}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ej: 3001234567"
            className="!px-4 !py-3 sm:flex-1"
          />
          <Button
            variant="brand"
            type="submit"
            disabled={loading}
            className="shrink-0 !px-5 !py-3 whitespace-nowrap"
          >
            {loading ? 'Buscando…' : 'Ver mis pedidos'}
          </Button>
        </form>

        <ErrorMessage
          className="mt-4"
          message={error}
          onRetry={() => search(phone.trim())}
        />

        {/* Resultados */}
        {loading && (
          <p className="mt-6 flex items-center gap-2 text-sm text-gray-500">
            <Spinner />
            Consultando tus pedidos…
          </p>
        )}

        {/* Resultados */}
        {searched && !loading && !error && (
          <>
            {orders.length === 0 ? (
              <EmptyState
                className="mt-6"
                message="No encontramos pedidos registrados con este número de teléfono."
              />
            ) : (
              <ul className="mt-6 space-y-4">
                {orders.map((order) => (
                  <li
                    key={order.id}
                    className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold">{shortOrderId(order.id)}</span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${STAGE_BADGE[order.status]}`}
                      >
                        {STAGE_LABEL[order.status]}
                      </span>
                    </div>

                    {/* Indicador de progreso por etapas */}
                    <div className="mt-4 flex items-center">
                      {STAGES.map((stage, idx) => {
                        const currentIdx = STAGES.indexOf(order.status)
                        const reached = idx <= currentIdx
                        return (
                          <div key={stage} className="flex flex-1 items-center">
                            <div
                              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                reached ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-400'
                              }`}
                            >
                              {idx + 1}
                            </div>
                            {idx < STAGES.length - 1 && (
                              <div
                                className={`h-1 flex-1 ${
                                  idx < currentIdx ? 'bg-amber-600' : 'bg-gray-200'
                                }`}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-gray-400">
                      {STAGES.map((s) => (
                        <span key={s} className="w-6 text-center">
                          {STAGE_LABEL[s].split(' ')[0]}
                        </span>
                      ))}
                    </div>

                    <p className="mt-3 text-xs text-gray-400">
                      {new Date(order.created_at).toLocaleString()} —{' '}
                      {order.customer_name}
                    </p>

                    <ul className="mt-3 space-y-1 border-t border-dashed border-gray-200 pt-3 text-sm">
                      {(itemsByOrder[order.id] ?? []).map((item, idx) => (
                        <li key={idx} className="flex justify-between gap-2">
                          <span>
                            {item.quantity}× {item.name ?? 'Plato'}
                          </span>
                          <span className="text-gray-500">
                            {money(item.unit_price * item.quantity)}
                          </span>
                        </li>
                      ))}
                      {(itemsByOrder[order.id] ?? []).length === 0 && (
                        <li className="text-xs text-gray-400">Cargando platos…</li>
                      )}
                    </ul>

                    <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
                      <span className="text-sm text-gray-500">Total</span>
                      <span className="font-extrabold text-amber-700">
                        {money(order.total_amount)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </main>
  )
}
