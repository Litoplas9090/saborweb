import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { money } from '../../lib/format.js'
import Select from '../../components/ui/Select.jsx'
import Input from '../../components/ui/Input.jsx'
import ErrorMessage from '../../components/ui/ErrorMessage.jsx'
import { LoadingMessage } from '../../components/ui/Spinner.jsx'

// Duración en días de cada rango del selector (SPEC sección 5.2)
const RANGE_DAYS = { dia: 1, semana: 7, mes: 30 }
const RANGE_LABEL = { dia: 'Día', semana: 'Semana', mes: 'Mes' }
const RANGE_KEYS = Object.keys(RANGE_DAYS)

const RANGE_ACTIVE = 'bg-indigo-600 text-white'
const RANGE_IDLE =
  'bg-white text-gray-600 border border-gray-300 hover:border-indigo-400 hover:text-indigo-600'

function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Lista de días locales [desde, hasta] inclusive, como { key, label }
function dayBuckets(from, to) {
  const days = []
  const cursor = new Date(from)
  while (cursor <= to) {
    days.push({
      key: toISODate(cursor),
      label: `${cursor.getDate()}/${cursor.getMonth() + 1}`,
      count: 0,
      total: 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

export default function Dashboard() {
  const { profile } = useAuth()
  const isSuperadmin = profile?.role === 'superadmin'
  const myRestaurantId = profile?.restaurant_id

  const [restaurants, setRestaurants] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const restaurantId = isSuperadmin ? selectedId : myRestaurantId
  // Acceso transversal del superadmin: /admin/dashboard?r=<restaurant_id> (Hito 8)
  const [searchParams] = useSearchParams()
  const restaurantFromUrl = searchParams.get('r')

  const todayISO = toISODate(new Date())
  const [range, setRange] = useState('semana')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - (RANGE_DAYS.semana - 1))
    return toISODate(d)
  })

  const [perDay, setPerDay] = useState([])
  const [topDishes, setTopDishes] = useState([])
  const [salesTotal, setSalesTotal] = useState(0)
  const [orderCount, setOrderCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0) // incrementar para reintentar la carga

  /* ---------- Selector de restaurante (superadmin) ---------- */

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

  /* ---------- Carga de métricas (base: consultas de la SPEC sección 8) ---------- */

  useEffect(() => {
    if (!restaurantId) {
      setPerDay([])
      setTopDishes([])
      setSalesTotal(0)
      setOrderCount(0)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    const [y, m, d] = startDate.split('-').map(Number)
    const from = new Date(y, m - 1, d, 0, 0, 0, 0)
    const to = new Date(y, m - 1, d, 0, 0, 0, 0)
    to.setDate(to.getDate() + RANGE_DAYS[range]) // exclusive: fin del rango
    const fromISO = from.toISOString()
    const toISO = to.toISOString()

    ;(async () => {
      // Pedidos del rango: de aquí salen la gráfica por día y la suma de ventas
      const { data: orderRows, error: ordersError } = await supabase
        .from('orders')
        .select('created_at, total_amount')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', fromISO)
        .lt('created_at', toISO)

      if (ordersError) {
        setError(ordersError.message)
        setPerDay([])
        setTopDishes([])
        setSalesTotal(0)
        setOrderCount(0)
        setLoading(false)
        return
      }

      const buckets = dayBuckets(from, new Date(to.getTime() - 1))
      const byDay = Object.fromEntries(buckets.map((b) => [b.key, b]))
      let total = 0
      for (const row of orderRows ?? []) {
        const key = toISODate(new Date(row.created_at))
        const bucket = byDay[key]
        if (bucket) {
          bucket.count += 1
          bucket.total += Number(row.total_amount)
        }
        total += Number(row.total_amount)
      }
      setPerDay(buckets)
      setSalesTotal(total)
      setOrderCount(orderRows?.length ?? 0)

      // Top 10 de platos más pedidos en el rango (join !inner para filtrar por el pedido)
      const { data: itemRows, error: itemsError } = await supabase
        .from('order_items')
        .select('quantity, menu_item:menu_items(name), order:orders!inner(restaurant_id, created_at)')
        .eq('order.restaurant_id', restaurantId)
        .gte('order.created_at', fromISO)
        .lt('order.created_at', toISO)

      if (itemsError) {
        setError(itemsError.message)
        setTopDishes([])
        setLoading(false)
        return
      }

      const quantities = {}
      for (const row of itemRows ?? []) {
        const name = row.menu_item?.name ?? 'Plato'
        quantities[name] = (quantities[name] ?? 0) + row.quantity
      }
      setTopDishes(
        Object.entries(quantities)
          .map(([name, quantity]) => ({ name, quantity }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 10)
      )
      setLoading(false)
    })()
  }, [restaurantId, range, startDate, reload])

  /* ---------- Render ---------- */

  if (!restaurantId && !isSuperadmin) {
    return (
      <section>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Tu cuenta no tiene un restaurante asignado. Contacta al superadmin.
        </p>
      </section>
    )
  }

  const maxCount = Math.max(1, ...perDay.map((b) => b.count))
  const maxQty = Math.max(1, ...topDishes.map((t) => t.quantity))

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>

        <div className="flex rounded-lg p-0.5" role="group" aria-label="Rango de fechas">
          {RANGE_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={`px-4 py-1.5 text-sm font-semibold transition first:rounded-l-lg last:rounded-r-lg ${
                range === key ? RANGE_ACTIVE : RANGE_IDLE
              }`}
            >
              {RANGE_LABEL[key]}
            </button>
          ))}
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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label htmlFor="start-date" className="text-sm font-medium text-gray-600">
          Desde:
        </label>
        <Input
          id="start-date"
          type="date"
          value={startDate}
          max={todayISO}
          onChange={(e) => setStartDate(e.target.value || startDate)}
        />
        <span className="text-sm text-gray-400">
          ({RANGE_DAYS[range]} {RANGE_DAYS[range] === 1 ? 'día' : 'días'})
        </span>
      </div>

      <ErrorMessage
        className="mt-4"
        message={error}
        onRetry={() => setReload((r) => r + 1)}
      />

      {loading ? (
        <LoadingMessage label="Cargando métricas…" />
      ) : (
        <div className="mt-6 space-y-6">
          {/* Total de ventas y pedidos en el rango */}
          <div className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Ventas del rango</p>
              <p className="mt-1 text-3xl font-extrabold text-indigo-600">{money(salesTotal)}</p>
            </article>
            <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Pedidos en el rango</p>
              <p className="mt-1 text-3xl font-extrabold text-gray-900">{orderCount}</p>
            </article>
          </div>

          {/* Gráfica de barras: pedidos por día */}
          <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700">Pedidos por día</h2>
            {perDay.every((b) => b.count === 0) ? (
              <p className="mt-6 py-8 text-center text-sm text-gray-400">
                Sin pedidos en este rango.
              </p>
            ) : (
              <div className="mt-4">
                <div className="flex h-48 items-end gap-1 border-b border-gray-200">
                  {perDay.map((b) => (
                    <div
                      key={b.key}
                      title={`${b.label}: ${b.count} pedido(s) · ${money(b.total)}`}
                      className={`flex-1 rounded-t transition-all ${
                        b.count > 0 ? 'bg-indigo-500 hover:bg-indigo-400' : 'bg-gray-100'
                      }`}
                      style={{ height: `${Math.max(b.count > 0 ? 6 : 2, (b.count / maxCount) * 100)}%` }}
                    />
                  ))}
                </div>
                <div className="mt-1 flex gap-1">
                  {perDay.map((b) => (
                    <span
                      key={b.key}
                      className="flex-1 text-center text-[10px] leading-tight text-gray-400"
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </article>

          {/* Top 10 platos más pedidos */}
          <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700">
              Top platos más pedidos
            </h2>
            {topDishes.length === 0 ? (
              <p className="mt-6 py-8 text-center text-sm text-gray-400">
                Sin ventas en este rango.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {topDishes.map((dish, idx) => (
                  <li key={dish.name} className="flex items-center gap-3">
                    <span
                      className={`w-6 flex-shrink-0 text-center text-sm font-bold ${
                        idx < 3 ? 'text-indigo-600' : 'text-gray-400'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium text-gray-800">{dish.name}</p>
                        <span className="flex-shrink-0 text-sm font-bold text-gray-900">
                          {dish.quantity}×
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${(dish.quantity / maxQty) * 100}%` }}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      )}
    </section>
  )
}
