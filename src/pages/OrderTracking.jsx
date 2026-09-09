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
import Backdrop from '../components/ui/Backdrop.jsx'

const ORDER_KEY = 'saborweb_order' // último número de pedido consultado
const LAST_SLUG_KEY = 'saborweb_last_slug'

const STAGES = ['registrado', 'en_preparacion', 'preparado']

const STAGE_LABEL = {
  registrado: 'Registrado',
  en_preparacion: 'En preparación',
  preparado: '¡Preparado!',
  // "entregado"/"pagado" son cierres internos del restaurante: solo badge
  entregado: 'Entregado',
  pagado: 'Pagado',
}

const STAGE_BADGE = {
  registrado: 'bg-blue-100 text-blue-700',
  en_preparacion: 'bg-amber-100 text-amber-700',
  preparado: 'bg-green-100 text-green-700',
  entregado: 'bg-gray-200 text-gray-500',
  pagado: 'bg-gray-200 text-gray-500',
}

export default function OrderTracking() {
  const [orderNo, setOrderNo] = useState('')
  const [soundOn, setSoundOn] = useState(false)
  const [orders, setOrders] = useState([])
  const [itemsByOrder, setItemsByOrder] = useState({})
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [liveConnected, setLiveConnected] = useState(false)
  const [alarming, setAlarming] = useState({}) // orderId -> true mientras suena el bucle
  const [menuSlug, setMenuSlug] = useState(() => localStorage.getItem(LAST_SLUG_KEY) ?? null)
  const prevStatuses = useRef({}) // para detectar transiciones en los refrescos silenciosos
  const alarmLoops = useRef({}) // orderId -> intervalId del bucle de alerta

  // Restaurante del pedido más reciente (para "Volver al menú"); si el RPC no
  // trae restaurant_id, se queda el último slug visitado guardado en MenuPage
  useEffect(() => {
    const restaurantId = orders[0]?.restaurant_id
    if (!restaurantId) return
    supabase
      .from('restaurants')
      .select('slug')
      .eq('id', restaurantId)
      .single()
      .then(({ data }) => {
        if (data?.slug) setMenuSlug(data.slug)
      })
  }, [orders])

  /* ---------- Alerta de "preparado": bucle de sonido + vibración ---------- */

  function triggerReadyAlert(orderId) {
    if (alarmLoops.current[orderId]) return // ya está sonando
    // Vibración en móviles compatibles (Android/Chrome); iOS y desktop la ignoran
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([400, 150, 400, 150, 800])
    }
    playAlertSound()
    alarmLoops.current[orderId] = setInterval(() => playAlertSound(), 2500)
    setAlarming((prev) => ({ ...prev, [orderId]: true }))
  }

  function stopAlarmLoop(orderId) {
    if (alarmLoops.current[orderId]) {
      clearInterval(alarmLoops.current[orderId])
      delete alarmLoops.current[orderId]
    }
    setAlarming((prev) => (prev[orderId] ? { ...prev, [orderId]: false } : prev))
  }

  function handleReceived(orderId) {
    stopAlarmLoop(orderId)
  }

  // Limpiar los bucles de alerta al salir de la página
  useEffect(() => {
    const loops = alarmLoops.current
    return () => Object.values(loops).forEach(clearInterval)
  }, [])

  /* ---------- Sonido activado por defecto: se desbloquea con el primer gesto
  del usuario (teclear el número o hacer clic ya es suficiente) ---------- */

  useEffect(() => {
    const unlock = async () => {
      const running = await unlockAudio()
      setSoundOn(running)
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  /* ---------- Consulta del pedido por su número corto ---------- */

  // Normaliza lo que teclea el usuario: acepta "#A1B2C3D4", "a1b2c3d4", etc.
  function normalizeOrderNo(value) {
    return value.trim().replace(/^#/, '').toUpperCase()
  }

  async function loadOrders(orderNumber, { silent } = {}) {
    if (!silent) {
      setLoading(true)
      setError(null)
      setSearched(true)
    }
    localStorage.setItem(ORDER_KEY, orderNumber)

    const { data: orderRows, error: rpcError } = await supabase.rpc('get_order_by_short', {
      p_short_id: orderNumber,
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
    // y detener el bucle si el pedido avanzó a otra etapa
    if (silent) {
      for (const row of rows) {
        const before = prevStatuses.current[row.id]
        if (row.status === 'preparado' && before && before !== 'preparado') {
          triggerReadyAlert(row.id)
        } else if (row.status !== 'preparado' && alarmLoops.current[row.id]) {
          stopAlarmLoop(row.id)
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

  // Al llegar con ?p=#NUMERO (desde la confirmación del pedido) o con el último
  // número guardado, consultar de inmediato
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get('p')
    const saved = fromUrl ?? localStorage.getItem(ORDER_KEY)
    if (saved) {
      const normalized = normalizeOrderNo(saved)
      setOrderNo(normalized)
      loadOrders(normalized)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearch(e) {
    e.preventDefault()
    const normalized = normalizeOrderNo(orderNo)
    setOrderNo(normalized)
    loadOrders(normalized)
  }

  /* ---------- Realtime: broadcast "order:{id}" de cada pedido activo ---------- */

  const activeIds = orders
    .filter((o) => o.status !== 'entregado' && o.status !== 'pagado')
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

          // Alerta en bucle al pasar a "preparado"; se detiene si avanza (SPEC §4)
          if (newStatus === 'preparado') {
            triggerReadyAlert(id)
          } else {
            stopAlarmLoop(id)
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') setLiveConnected(true)
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setLiveConnected(false)
          }
        })
    )

    return () => {
      setLiveConnected(false)
      channels.forEach((c) => supabase.removeChannel(c))
    }
  }, [activeIds])

  // Respaldo si el WebSocket no conecta: refresco silencioso mientras haya
  // pedidos activos, para que el estado se actualice sin recargar la página.
  useEffect(() => {
    if (!searched) return
    const hasActive = orders.some(
      (o) => o.status !== 'entregado' && o.status !== 'pagado'
    )
    if (!hasActive) return
    const interval = setInterval(() => loadOrders(orderNo, { silent: true }), 10000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, orderNo, orders])

  /* ---------- Render ---------- */

  return (
    <main className="relative min-h-screen overflow-x-clip pb-10">
      <Backdrop />
      <header className="bg-amber-600 text-white">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div>
            {menuSlug ? (
              <Link to={`/${menuSlug}`} className="text-sm text-amber-200 hover:underline">
                ← Volver al menú
              </Link>
            ) : (
              <Link to="/" className="text-sm text-amber-200 hover:underline">
                ← SaborWeb
              </Link>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
            Seguimiento de pedidos
          </h1>
          <p className="mt-1 text-sm text-amber-100">
            Digite el número de pedido que recibiste al confirmar tu compra.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4">
        {/* Sonido y vibración activados por defecto (se desbloquean con el primer gesto) */}
        {soundOn && (
          <p className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            🔊 Notificaciones de sonido y vibración activadas.
          </p>
        )}

        {/* Formulario de número de pedido */}
        <form onSubmit={handleSearch} className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Input
            accent="amber"
            type="text"
            required
            minLength={4}
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)}
            placeholder="Ej: #A1B2C3D4"
            className="!px-4 !py-3 uppercase sm:flex-1"
          />
          <Button
            variant="brand"
            type="submit"
            disabled={loading}
            className="shrink-0 !px-5 !py-3 whitespace-nowrap"
          >
            {loading ? 'Buscando…' : 'Ver mi pedido'}
          </Button>
        </form>

        {searched && !error && (
          <p className="mt-2 text-xs text-gray-400">
            {liveConnected
              ? '🟢 Conexión en vivo activa: los cambios se ven al instante.'
              : '🟡 Actualización automática cada 10 segundos (mantén esta pestaña abierta).'}
          </p>
        )}

        <ErrorMessage
          className="mt-4"
          message={error}
          onRetry={() => loadOrders(normalizeOrderNo(orderNo))}
        />

        {/* Resultados */}
        {loading && (
          <p className="mt-6 flex items-center gap-2 text-sm text-gray-500">
            <Spinner />
            Consultando tu pedido…
          </p>
        )}

        {/* Resultados */}
        {searched && !loading && !error && (
          <>
            {orders.length === 0 ? (
              <EmptyState
                className="mt-6"
                message="No encontramos ningún pedido con ese número. Verifica el número e intenta de nuevo."
              />
            ) : (
              <ul className="mt-6 space-y-4">
                {orders.map((order) => (
                  <li
                    key={order.id}
                    className={`rounded-xl border bg-white p-5 shadow-sm ${
                      alarming[order.id]
                        ? 'border-green-500 ring-2 ring-green-500 animate-pulse'
                        : 'border-gray-200'
                    }`}
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
                        // "entregado"/"pagado" (cierres internos) se dibujan completados
                        const currentIdx = ['entregado', 'pagado'].includes(order.status)
                          ? STAGES.length - 1
                          : STAGES.indexOf(order.status)
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
                    <div className="mt-1 flex text-[10px] text-gray-400">
                      {STAGES.map((s, idx) => (
                        <span key={s} className="flex-1 text-center">
                          {idx + 1}. {STAGE_LABEL[s]}
                        </span>
                      ))}
                    </div>

                    <p className="mt-3 text-xs text-gray-400">
                      {new Date(order.created_at).toLocaleString()} —{' '}
                      {order.customer_name}
                    </p>

                    {alarming[order.id] && (
                      <Button
                        variant="brand"
                        fullWidth
                        className="mt-4 !bg-green-600 !py-3 hover:!bg-green-700"
                        onClick={() => handleReceived(order.id)}
                      >
                        ✓ Recibido — detener alerta
                      </Button>
                    )}

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
