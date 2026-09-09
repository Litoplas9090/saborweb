import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { money, shortOrderId } from '../../lib/format.js'
import { unlockAudio, playAlertSound } from '../../lib/audio.js'
import Button from '../../components/ui/Button.jsx'
import Select from '../../components/ui/Select.jsx'
import ErrorMessage from '../../components/ui/ErrorMessage.jsx'
import { LoadingMessage } from '../../components/ui/Spinner.jsx'

// Flujo del pedido (SPEC sección 4 + etapa de pago)
const STAGES = ['registrado', 'en_preparacion', 'preparado', 'entregado', 'pagado']

const NEXT_STAGE = {
  registrado: 'en_preparacion',
  en_preparacion: 'preparado',
  preparado: 'entregado',
  entregado: 'pagado',
}

const STAGE_LABEL = {
  registrado: 'Registrado',
  en_preparacion: 'En preparación',
  preparado: 'Preparado',
  entregado: 'Entregado',
  pagado: 'Pagado',
}

const ADVANCE_LABEL = {
  registrado: '→ Preparar',
  en_preparacion: '→ Marcar preparado',
  preparado: '→ Entregar',
  entregado: '→ Marcar pagado',
}

const STAGE_COLORS = {
  registrado: 'border-blue-400 bg-blue-50 text-blue-700',
  en_preparacion: 'border-amber-400 bg-amber-50 text-amber-700',
  preparado: 'border-green-400 bg-green-50 text-green-700',
  entregado: 'border-gray-300 bg-gray-100 text-gray-500',
  pagado: 'border-emerald-500 bg-emerald-100 text-emerald-800',
}

// Emite el broadcast que el cliente escucha en el canal "order:{id}" (Hito 6)
function broadcastStatus(orderId, status) {
  const channel = supabase.channel(`order:${orderId}`, {
    config: { broadcast: { self: false } },
  })
  channel.subscribe((subscribeStatus) => {
    if (subscribeStatus === 'SUBSCRIBED') {
      channel.send({
        type: 'broadcast',
        event: 'status_changed',
        payload: { order_id: orderId, status },
      })
      setTimeout(() => supabase.removeChannel(channel), 800)
    }
  })
}

export default function OrdersBoard() {
  const { profile } = useAuth()
  const isSuperadmin = profile?.role === 'superadmin'
  const myRestaurantId = profile?.restaurant_id

  const [restaurants, setRestaurants] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const restaurantId = isSuperadmin ? selectedId : myRestaurantId
  // Acceso transversal del superadmin: /admin/pedidos?r=<restaurant_id> (Hito 8)
  const [searchParams] = useSearchParams()
  const restaurantFromUrl = searchParams.get('r')

  const [orders, setOrders] = useState([])
  const [itemsByOrder, setItemsByOrder] = useState({}) // orderId -> [{name, quantity, unit_price}]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0) // incrementar para reintentar la carga
  const [showDelivered, setShowDelivered] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const knownIds = useRef(new Set()) // pedidos ya conocidos: detecta llegadas vía polling

  /* ---------- Sonido activado por defecto: se desbloquea con el primer gesto
  del usuario (cualquier clic o tecla en la página) ---------- */

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

  function notifyNewOrder() {
    if ('vibrate' in navigator) navigator.vibrate([300, 150, 300])
    playAlertSound()
  }

  const visibleStages = showDelivered
    ? STAGES
    : STAGES.filter((s) => s !== 'entregado' && s !== 'pagado')

  /* ---------- Carga inicial ---------- */

  useEffect(() => {
    if (!isSuperadmin) return
    supabase
      .from('restaurants')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        setRestaurants(data ?? [])
        setSelectedId((prev) => prev ?? restaurantFromUrl ?? data?.[0]?.id ?? null)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperadmin])

  // Pedidos de HOY (los entregados salen del tablero activo al día siguiente)
  async function fetchOrders({ silent } = {}) {
    if (!restaurantId) {
      setOrders([])
      setItemsByOrder({})
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const { data: orderRows, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', startOfToday.toISOString())
      .order('created_at', { ascending: false })

    if (ordersError) {
      if (!silent) setError(ordersError.message)
      setOrders([])
      setLoading(false)
      return
    }

    const rows = orderRows ?? []

    // En refrescos silenciosos, alertar si llegaron pedidos nuevos
    if (silent) {
      const arrived = rows.filter((r) => !knownIds.current.has(r.id))
      if (arrived.length > 0) notifyNewOrder()
    }
    rows.forEach((r) => knownIds.current.add(r.id))

    setOrders(rows)
    loadItems(rows.map((o) => o.id))
    setLoading(false)
  }

  useEffect(() => {
    knownIds.current.clear()
    fetchOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, reload])

  // Respaldo si el WebSocket de Realtime no conecta (proxy corporativo, etc.):
  // re-carga silenciosa vía REST para que el tablero siga vivo.
  useEffect(() => {
    if (!restaurantId) return
    const interval = setInterval(() => fetchOrders({ silent: true }), 30000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId])

  async function loadItems(orderIds) {
    if (orderIds.length === 0) {
      setItemsByOrder({})
      return
    }
    const { data } = await supabase
      .from('order_items')
      .select('order_id, quantity, unit_price, menu_item:menu_items(name)')
      .in('order_id', orderIds)

    const grouped = {}
    for (const row of data ?? []) {
      if (!grouped[row.order_id]) grouped[row.order_id] = []
      grouped[row.order_id].push({
        name: row.menu_item?.name ?? 'Plato',
        quantity: row.quantity,
        unit_price: row.unit_price,
      })
    }
    setItemsByOrder(grouped)
  }

  /* ---------- Realtime: pedidos nuevos y cambios sin recargar ---------- */

  useEffect(() => {
    if (!restaurantId) return

    const channel = supabase
      .channel(`board:${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            knownIds.current.delete(payload.old.id)
            setOrders((prev) => prev.filter((o) => o.id !== payload.old.id))
            return
          }
          const row = payload.new
          setOrders((prev) => {
            const exists = prev.some((o) => o.id === row.id)
            if (exists) return prev.map((o) => (o.id === row.id ? row : o))
            return [row, ...prev]
          })
          if (payload.eventType === 'INSERT') {
            knownIds.current.add(row.id)
            notifyNewOrder()
            loadItems([row.id])
          }
        }
      )
      .subscribe((status, err) => {
        if (status !== 'SUBSCRIBED') {
          console.warn('[realtime] canal del tablero:', status, err ?? '')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId])

  /* ---------- Acciones ---------- */

  async function advance(order) {
    const next = NEXT_STAGE[order.status]
    if (!next) return
    setError(null)

    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: next })
      .eq('id', order.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    // Actualización optimista: la tarjeta se mueve ya, sin depender del WebSocket
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)))

    broadcastStatus(order.id, next)
  }

  /* ---------- Render ---------- */

  if (!restaurantId && !isSuperadmin) {
    return (
      <section>
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <p className="mt-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Tu cuenta no tiene un restaurante asignado. Contacta al superadmin.
        </p>
      </section>
    )
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Pedidos</h1>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`text-xs font-semibold ${soundOn ? 'text-green-600' : 'text-gray-400'}`}
          >
            {soundOn ? '🔊 Alertas activadas' : '🔕 Haz clic en la página para activar el sonido'}
          </span>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showDelivered}
              onChange={(e) => setShowDelivered(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Mostrar entregados y pagados de hoy
          </label>
        </div>
      </div>

      {isSuperadmin && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="restaurant" className="text-sm font-medium text-gray-600">
            Restaurante:
          </label>
          <Select
            id="restaurant"
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value || null)}
          >
            {restaurants.length === 0 && <option value="">Sin restaurantes</option>}
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <ErrorMessage
        className="mt-4"
        message={error}
        onRetry={() => setReload((r) => r + 1)}
      />

      {loading ? (
        <LoadingMessage label="Cargando pedidos…" />
      ) : (
        <div className="mt-6 flex snap-x gap-4 overflow-x-auto pb-4">
          {visibleStages.map((stage) => {
            const stageOrders = orders.filter((o) => o.status === stage)
            return (
              <div key={stage} className="w-72 flex-shrink-0 snap-start">
                <div
                  className={`flex items-center justify-between rounded-t-xl border px-4 py-3 ${STAGE_COLORS[stage]}`}
                >
                  <span className="text-sm font-bold">{STAGE_LABEL[stage]}</span>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">
                    {stageOrders.length}
                  </span>
                </div>

                <div className="min-h-[120px] space-y-3 rounded-b-xl border border-t-0 border-gray-200 bg-gray-100/60 p-3">
                  {stageOrders.length === 0 ? (
                    <p className="py-6 text-center text-xs text-gray-400">
                      Sin pedidos
                    </p>
                  ) : (
                    stageOrders.map((order) => (
                      <article
                        key={order.id}
                        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900">
                            {shortOrderId(order.id)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(order.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <p className="mt-2 text-sm font-semibold">
                          {order.customer_name}
                        </p>
                        <p className="text-xs text-gray-500">📞 {order.customer_phone}</p>

                        <ul className="mt-2 space-y-0.5 border-t border-dashed border-gray-200 pt-2 text-sm text-gray-700">
                          {(itemsByOrder[order.id] ?? []).map((item, idx) => (
                            <li key={idx} className="flex justify-between gap-2">
                              <span className="min-w-0 truncate">
                                {item.quantity}× {item.name}
                              </span>
                            </li>
                          ))}
                          {(itemsByOrder[order.id] ?? []).length === 0 && (
                            <li className="text-xs text-gray-400">Cargando platos…</li>
                          )}
                        </ul>

                        <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
                          <span className="font-bold text-indigo-600">
                            {money(order.total_amount)}
                          </span>
                          {ADVANCE_LABEL[order.status] && (
                            <Button size="sm" onClick={() => advance(order)}>
                              {ADVANCE_LABEL[order.status]}
                            </Button>
                          )}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
