import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { money } from '../../lib/format.js'
import Button from '../../components/ui/Button.jsx'
import Field from '../../components/ui/Field.jsx'
import Input from '../../components/ui/Input.jsx'
import Textarea from '../../components/ui/Textarea.jsx'
import Select from '../../components/ui/Select.jsx'
import ErrorMessage from '../../components/ui/ErrorMessage.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import { LoadingMessage } from '../../components/ui/Spinner.jsx'

const BUCKET = 'menu-photos'

const emptyForm = {
  name: '',
  description: '',
  price: '',
  category: '',
  is_available: true,
}

// Extrae la ruta del archivo dentro del bucket a partir de la URL pública
function pathFromUrl(url) {
  if (!url) return null
  const marker = `/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length))
}

export default function MenuAdmin() {
  const { profile } = useAuth()
  const isSuperadmin = profile?.role === 'superadmin'
  const myRestaurantId = profile?.restaurant_id

  // Superadmin: elige restaurante; restaurant_admin: siempre el suyo
  const [restaurants, setRestaurants] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const restaurantId = isSuperadmin ? selectedId : myRestaurantId
  // Acceso transversal del superadmin: /admin?r=<restaurant_id> (Hito 8)
  const [searchParams] = useSearchParams()
  const restaurantFromUrl = searchParams.get('r')

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0) // incrementar para reintentar la carga

  // Formulario (crear / editar)
  const [editing, setEditing] = useState(null) // null | 'new' | menu_item
  const [form, setForm] = useState(emptyForm)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(),
    [items]
  )

  /* ---------- Carga de datos ---------- */

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

  useEffect(() => {
    if (!restaurantId) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    supabase
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('category')
      .order('name')
      .then(({ data, error: queryError }) => {
        setItems(data ?? [])
        setError(queryError?.message ?? null)
        setLoading(false)
      })
  }, [restaurantId, reload])

  /* ---------- Storage ---------- */

  async function uploadPhoto(file) {
    const ext = file.name.split('.').pop().toLowerCase()
    const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false })
    if (uploadError) throw new Error(`No se pudo subir la foto: ${uploadError.message}`)
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  async function removePhoto(url) {
    const path = pathFromUrl(url)
    if (path) await supabase.storage.from(BUCKET).remove([path])
  }

  /* ---------- Acciones ---------- */

  function openNew() {
    setEditing('new')
    setForm(emptyForm)
    setPhotoFile(null)
    setPhotoPreview(null)
    setError(null)
  }

  function openEdit(item) {
    setEditing(item)
    setForm({
      name: item.name,
      description: item.description ?? '',
      price: String(item.price),
      category: item.category ?? '',
      is_available: item.is_available,
    })
    setPhotoFile(null)
    setPhotoPreview(item.photo_url)
    setError(null)
  }

  function closeForm() {
    setEditing(null)
    setPhotoFile(null)
    setPhotoPreview(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const price = parseFloat(form.price)
      if (Number.isNaN(price) || price < 0) throw new Error('Precio inválido.')

      let photo_url = editing === 'new' ? null : editing.photo_url
      if (photoFile) photo_url = await uploadPhoto(photoFile)

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price,
        category: form.category.trim() || null,
        is_available: form.is_available,
        photo_url,
      }

      if (editing === 'new') {
        const { error: insertError } = await supabase
          .from('menu_items')
          .insert({ ...payload, restaurant_id: restaurantId })
        if (insertError) throw insertError
      } else {
        const { error: updateError } = await supabase
          .from('menu_items')
          .update(payload)
          .eq('id', editing.id)
        if (updateError) throw updateError
        // Limpiar la foto anterior si fue reemplazada
        if (photoFile && editing.photo_url && editing.photo_url !== photo_url) {
          removePhoto(editing.photo_url)
        }
      }

      closeForm()
      refreshItems()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleAvailable(item) {
    const { error: updateError } = await supabase
      .from('menu_items')
      .update({ is_available: !item.is_available })
      .eq('id', item.id)
    if (updateError) {
      setError(updateError.message)
    } else {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_available: !item.is_available } : i))
      )
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`¿Eliminar el plato "${item.name}"? Esta acción no se puede deshacer.`)) {
      return
    }
    const { error: deleteError } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', item.id)
    if (deleteError) {
      setError(deleteError.message)
    } else {
      if (item.photo_url) removePhoto(item.photo_url)
      refreshItems()
    }
  }

  async function refreshItems() {
    if (!restaurantId) return
    const { data, error: queryError } = await supabase
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('category')
      .order('name')
    if (queryError) {
      setError(queryError.message)
    } else {
      setItems(data ?? [])
    }
  }

  /* ---------- Render ---------- */

  if (!restaurantId && !isSuperadmin) {
    return (
      <section>
        <h1 className="text-2xl font-bold">Menú</h1>
        <p className="mt-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Tu cuenta no tiene un restaurante asignado. Contacta al superadmin.
        </p>
      </section>
    )
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Menú</h1>
        <Button onClick={openNew} disabled={!restaurantId}>
          + Nuevo plato
        </Button>
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
        <LoadingMessage label="Cargando menú…" />
      ) : items.length === 0 ? (
        <EmptyState
          className="mt-8"
          message={'Este restaurante aún no tiene platos. Crea el primero con "+ Nuevo plato".'}
        />
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex flex-wrap gap-4 rounded-xl border bg-white p-4 shadow-sm sm:flex-nowrap ${
                item.is_available ? 'border-gray-200' : 'border-gray-200 opacity-60'
              }`}
            >
              {item.photo_url ? (
                <img
                  src={item.photo_url}
                  alt={item.name}
                  className="h-20 w-20 flex-shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-2xl">
                  🍽️
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{item.name}</h2>
                  {item.category && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {item.category}
                    </span>
                  )}
                  {!item.is_available && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                      No disponible
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-gray-600">{item.description}</p>
                )}
                <p className="mt-1 text-sm font-semibold text-indigo-600">
                  {money(item.price)}
                </p>
              </div>

              <div className="flex flex-row items-center justify-between gap-2 sm:ml-auto sm:flex-col sm:items-end">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                    Editar
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(item)}>
                    Eliminar
                  </Button>
                </div>
                <button
                  onClick={() => toggleAvailable(item)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    item.is_available
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  {item.is_available ? 'Disponible ✓' : 'Activar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ---- Modal crear / editar ---- */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleSubmit}
            className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-xl font-bold">
              {editing === 'new' ? 'Nuevo plato' : 'Editar plato'}
            </h2>

            <Field label="Nombre *">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <Field label="Descripción">
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Precio *">
                <Input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </Field>
              <Field label="Categoría">
                <Input
                  list="categories"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
                <datalist id="categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
            </div>

            <Field label="Foto">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  setPhotoFile(file)
                  setPhotoPreview(file ? URL.createObjectURL(file) : photoPreview)
                }}
                className="w-full text-sm text-gray-600"
              />
              {photoPreview && (
                <img
                  src={photoPreview}
                  alt="Vista previa"
                  className="mt-2 h-28 w-28 rounded-lg object-cover"
                />
              )}
            </Field>

            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.is_available}
                onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Disponible para la venta
            </label>

            <ErrorMessage message={error} />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
