import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { money, shortOrderId } from '../lib/format.js'
import Button from '../components/ui/Button.jsx'
import Field from '../components/ui/Field.jsx'
import Input from '../components/ui/Input.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { PageLoading } from '../components/ui/Spinner.jsx'
import Backdrop from '../components/ui/Backdrop.jsx'

export default function MenuPage() {
  const { slug } = useParams()

  const [restaurant, setRestaurant] = useState(null)
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading') // loading | ok | notfound | error
  const [reload, setReload] = useState(0) // incrementar para reintentar la carga

  // Carrito: [{ menu_item_id, name, price, qty }]
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)

  // Checkout: 'cart' | 'form' | 'success'
  const [step, setStep] = useState('cart')
  const [customerName, setCustomerName] = useState('')
  const [orderId, setOrderId] = useState(null)
  const [total, setTotal] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  /* ---------- Carga del restaurante y su menú público ---------- */

  useEffect(() => {
    setStatus('loading')
    setCart([])
    ;(async () => {
      const { data: r, error: rError } = await supabase
        .from('restaurants')
        .select('id, name, slug, logo_url, description, address')
        .eq('slug', slug)
        .eq('is_active', true)
        .single()

      if (rError) {
        // PGRST116 = sin filas (slug inválido); cualquier otro código es un fallo real
        setStatus(rError.code === 'PGRST116' ? 'notfound' : 'error')
        return
      }

      setRestaurant(r)
      // Para que el seguimiento pueda ofrecer "Volver al menú" (Hito 6)
      localStorage.setItem('saborweb_last_slug', slug)

      const { data: m, error: mError } = await supabase
        .from('menu_items')
        .select('id, name, description, price, photo_url, category')
        .eq('restaurant_id', r.id)
        .eq('is_available', true)
        .order('category')
        .order('name')

      if (mError) {
        setStatus('error')
      } else {
        setItems(m ?? [])
        setStatus('ok')
      }
    })()
  }, [slug, reload])

  /* ---------- Carrito (localStorage, una clave por restaurante) ---------- */

  const cartKey = restaurant ? `saborweb_cart_${restaurant.id}` : null

  useEffect(() => {
    if (!cartKey) return
    try {
      setCart(JSON.parse(localStorage.getItem(cartKey)) ?? [])
    } catch {
      setCart([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey])

  useEffect(() => {
    if (cartKey) localStorage.setItem(cartKey, JSON.stringify(cart))
  }, [cart, cartKey])

  const cartCount = cart.reduce((acc, i) => acc + i.qty, 0)
  const cartTotal = cart.reduce((acc, i) => acc + i.price * i.qty, 0)

  function addToCart(item) {
    setCart((prev) => {
      const found = prev.find((i) => i.menu_item_id === item.id)
      if (found) {
        return prev.map((i) =>
          i.menu_item_id === item.id ? { ...i, qty: i.qty + 1 } : i
        )
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, qty: 1 }]
    })
  }

  function changeQty(menuItemId, delta) {
    setCart((prev) =>
      prev
        .map((i) => (i.menu_item_id === menuItemId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    )
  }

  /* ---------- Checkout (solo nombre → RPC create_order) ---------- */

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { data: newOrderId, error: rpcError } = await supabase.rpc('create_order', {
      p_restaurant_id: restaurant.id,
      p_customer_name: customerName.trim(),
      p_items: cart.map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.qty })),
    })

    setSubmitting(false)

    if (rpcError) {
      setError('No se pudo registrar el pedido. Intenta de nuevo.')
      return
    }

    setOrderId(newOrderId)
    setTotal(cartTotal)
    setCart([])
    if (cartKey) localStorage.removeItem(cartKey)
    // El número corto es la llave de seguimiento: guardarlo y mostrarlo
    localStorage.setItem('saborweb_order', shortOrderId(newOrderId))
    setStep('success')
  }

  function resetFlow() {
    setCartOpen(false)
    setStep('cart')
    setOrderId(null)
    setCustomerName('')
  }

  /* ---------- Agrupar por categoría ---------- */

  const grouped = useMemo(() => {
    const map = new Map()
    for (const item of items) {
      const cat = item.category || 'Otros'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat).push(item)
    }
    return [...map.entries()]
  }, [items])

  /* ---------- Estados de carga ---------- */

  if (status === 'loading') {
    return <PageLoading label="Cargando menú…" />
  }

  if (status === 'notfound') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 p-6 text-center">
        <h1 className="text-2xl font-bold">Restaurante no encontrado</h1>
        <p className="text-gray-600">
          El enlace no corresponde a un restaurante activo de SaborWeb.
        </p>
      </main>
    )
  }

  if (status === 'error') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center">
        <h1 className="text-2xl font-bold">Algo salió mal</h1>
        <p className="text-gray-600">No pudimos cargar el menú.</p>
        <Button variant="brand" onClick={() => setReload((r) => r + 1)}>
          Reintentar
        </Button>
      </main>
    )
  }

  /* ---------- Render ---------- */

  return (
    <main className="relative isolate min-h-screen overflow-x-clip pb-28">
      <Backdrop />
      {/* Encabezado del restaurante */}
      <header className="bg-amber-600 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-8">
          {restaurant.logo_url ? (
            <img
              src={restaurant.logo_url}
              alt={restaurant.name}
              className="h-16 w-16 rounded-2xl bg-white object-contain p-1"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-3xl">
              🍽️
            </div>
          )}
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{restaurant.name}</h1>
            {restaurant.description && (
              <p className="mt-0.5 text-sm text-amber-100">{restaurant.description}</p>
            )}
            {restaurant.address && (
              <p className="mt-0.5 text-xs text-amber-200">📍 {restaurant.address}</p>
            )}
            <Link
              to="/seguimiento"
              className="mt-2 inline-block rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/30"
            >
              📦 ¿Ya pediste? Sigue tu pedido aquí
            </Link>
          </div>
        </div>
      </header>

      {/* Menú agrupado por categoría */}
      <div className="mx-auto max-w-3xl px-4">
        {items.length === 0 ? (
          <EmptyState
            className="mt-10 py-12"
            message="Este restaurante no tiene platos disponibles por ahora."
          />
        ) : (
          grouped.map(([category, catItems]) => (
            <section key={category} className="mt-8">
              <h2 className="mb-3 text-lg font-bold text-gray-900">
                {category}
                <span className="ml-2 text-sm font-normal text-gray-400">
                  {catItems.length} {catItems.length === 1 ? 'plato' : 'platos'}
                </span>
              </h2>
              <ul className="space-y-3">
                {catItems.map((item) => {
                  const inCart = cart.find((i) => i.menu_item_id === item.id)
                  return (
                    <li
                      key={item.id}
                      className="flex gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
                    >
                      {item.photo_url ? (
                        <img
                          src={item.photo_url}
                          alt={item.name}
                          className="h-20 w-20 flex-shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg bg-amber-50 text-2xl">
                          🍽️
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold">{item.name}</h3>
                        {item.description && (
                          <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">
                            {item.description}
                          </p>
                        )}
                        <p className="mt-1 font-semibold text-amber-700">
                          {money(item.price)}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 items-center">
                        {inCart ? (
                          <div className="flex items-center gap-2 rounded-lg bg-amber-100 px-1 py-1">
                            <button
                              onClick={() => changeQty(item.id, -1)}
                              className="h-7 w-7 rounded-md bg-white text-amber-700 shadow-sm"
                              aria-label="Quitar uno"
                            >
                              −
                            </button>
                            <span className="w-5 text-center text-sm font-bold text-amber-800">
                              {inCart.qty}
                            </span>
                            <button
                              onClick={() => changeQty(item.id, 1)}
                              className="h-7 w-7 rounded-md bg-white text-amber-700 shadow-sm"
                              aria-label="Agregar uno"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <Button variant="brand" size="md" onClick={() => addToCart(item)}>
                            Agregar
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      {/* Barra flotante del carrito */}
      {cartCount > 0 && !cartOpen && (
        <button
          onClick={() => {
            setStep('cart')
            setCartOpen(true)
          }}
          className="fixed inset-x-4 bottom-4 z-40 flex items-center justify-between rounded-2xl bg-amber-600 px-5 py-4 text-white shadow-lg transition hover:bg-amber-700"
        >
          <span className="text-sm font-semibold">
            🛒 {cartCount} {cartCount === 1 ? 'producto' : 'productos'}
          </span>
          <span className="font-bold">{money(cartTotal)}</span>
        </button>
      )}

      {/* Drawer del carrito / checkout */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
            {step === 'success' ? (
              /* ---- Confirmación ---- */
              <div className="py-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
                  ✅
                </div>
                <h2 className="mt-4 text-2xl font-bold">¡Pedido registrado!</h2>
                <p className="mt-2 text-gray-600">Tu número de pedido es:</p>
                <p className="mt-1 text-4xl font-extrabold tracking-wider text-amber-700">
                  {shortOrderId(orderId)}
                </p>
                <p className="mx-auto mt-3 max-w-xs rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  📌 Guarda este número: es la llave para consultar el estado de tu
                  pedido cuando quieras.
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Total: <span className="font-semibold">{money(total)}</span> —{' '}
                  {restaurant.name} te atenderá enseguida.
                </p>
                <div className="mt-6 flex flex-col items-center gap-2">
                  <Link to={`/seguimiento?p=${encodeURIComponent(shortOrderId(orderId))}`}>
                    <Button variant="brand" size="lg">
                      🔍 Seguir mi pedido
                    </Button>
                  </Link>
                  <Button variant="ghost" onClick={resetFlow}>
                    Volver al menú
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">
                    {step === 'cart' ? 'Tu pedido' : 'Finalizar pedido'}
                  </h2>
                  <Button variant="ghost" className="!px-3 !py-1" onClick={resetFlow} aria-label="Cerrar">
                    ✕
                  </Button>
                </div>

                {step === 'cart' ? (
                  /* ---- Lista del carrito ---- */
                  <>
                    <ul className="mt-4 space-y-3">
                      {cart.map((i) => (
                        <li
                          key={i.menu_item_id}
                          className="flex items-center gap-3 rounded-lg border border-gray-200 p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{i.name}</p>
                            <p className="text-xs text-gray-500">{money(i.price)} c/u</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => changeQty(i.menu_item_id, -1)}
                              className="h-7 w-7 rounded-md border border-gray-300 text-gray-700"
                            >
                              −
                            </button>
                            <span className="w-5 text-center text-sm font-bold">{i.qty}</span>
                            <button
                              onClick={() => changeQty(i.menu_item_id, 1)}
                              className="h-7 w-7 rounded-md border border-gray-300 text-gray-700"
                            >
                              +
                            </button>
                          </div>
                          <span className="w-20 text-right text-sm font-semibold">
                            {money(i.price * i.qty)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
                      <span className="text-gray-600">Total</span>
                      <span className="text-xl font-extrabold">{money(cartTotal)}</span>
                    </div>

                    <Button variant="brand" fullWidth className="mt-4 !py-3" onClick={() => setStep('form')}>
                      Continuar
                    </Button>
                  </>
                ) : (
                  /* ---- Datos del cliente (solo nombre) ---- */
                  <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Solo necesitamos tu nombre. El pago se realiza en el restaurante.
                    </p>
                    <Field label="Tu nombre *" htmlFor="cust-name">
                      <Input
                        id="cust-name"
                        accent="amber"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Ej: Ana Pérez"
                      />
                    </Field>

                    <ErrorMessage message={error} />

                    <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                      <span className="text-gray-600">Total a pagar</span>
                      <span className="text-lg font-extrabold">{money(cartTotal)}</span>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" fullWidth className="!py-3" onClick={() => setStep('cart')}>
                        Volver
                      </Button>
                      <Button
                        variant="brand"
                        fullWidth
                        className="flex-[2] !py-3"
                        type="submit"
                        disabled={submitting || cartCount === 0}
                      >
                        {submitting ? 'Enviando…' : 'Confirmar pedido'}
                      </Button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
