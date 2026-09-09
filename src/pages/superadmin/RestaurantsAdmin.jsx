import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import Button from '../../components/ui/Button.jsx'
import Backdrop from '../../components/ui/Backdrop.jsx'
import Field from '../../components/ui/Field.jsx'
import Input from '../../components/ui/Input.jsx'
import Textarea from '../../components/ui/Textarea.jsx'
import ErrorMessage from '../../components/ui/ErrorMessage.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import { LoadingMessage } from '../../components/ui/Spinner.jsx'

// Los logos se guardan en el mismo bucket público de las fotos del menú,
// bajo el prefijo "logos/" (no hace falta crear un bucket nuevo)
const BUCKET = 'menu-photos'

const EMPTY_FORM = {
  name: '',
  slug: '',
  description: '',
  address: '',
  is_active: true,
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function pathFromUrl(url) {
  if (!url) return null
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = url.indexOf(marker)
  return idx === -1 ? null : url.slice(idx + marker.length)
}

export default function RestaurantsAdmin() {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editing, setEditing] = useState(null) // 'new' | restaurant | null
  const [form, setForm] = useState(EMPTY_FORM)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  /* ---------- Carga ---------- */

  async function refresh() {
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('restaurants')
      .select('id, name, slug, logo_url, description, address, is_active, created_at')
      .order('name')
    if (loadError) {
      setError(loadError.message)
    } else {
      setError(null)
      setRestaurants(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  /* ---------- Storage ---------- */

  async function uploadLogo(file) {
    const ext = file.name.split('.').pop().toLowerCase()
    const path = `logos/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false })
    if (uploadError) throw new Error(`No se pudo subir el logo: ${uploadError.message}`)
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  async function removeLogo(url) {
    const path = pathFromUrl(url)
    if (path) await supabase.storage.from(BUCKET).remove([path])
  }

  /* ---------- Acciones ---------- */

  function openNew() {
    setEditing('new')
    setForm(EMPTY_FORM)
    setLogoFile(null)
    setLogoPreview(null)
    setError(null)
  }

  function openEdit(restaurant) {
    setEditing(restaurant)
    setForm({
      name: restaurant.name,
      slug: restaurant.slug,
      description: restaurant.description ?? '',
      address: restaurant.address ?? '',
      is_active: restaurant.is_active,
    })
    setLogoFile(null)
    setLogoPreview(restaurant.logo_url)
    setError(null)
  }

  function closeForm() {
    setEditing(null)
    setLogoFile(null)
    setLogoPreview(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const name = form.name.trim()
      const slug = slugify(form.slug || form.name)
      if (!name) throw new Error('El nombre es obligatorio.')
      if (!slug) throw new Error('El slug no puede quedar vacío.')

      let logo_url = editing === 'new' ? null : editing.logo_url
      if (logoFile) logo_url = await uploadLogo(logoFile)

      const payload = {
        name,
        slug,
        description: form.description.trim() || null,
        address: form.address.trim() || null,
        is_active: form.is_active,
        logo_url,
      }

      if (editing === 'new') {
        const { error: insertError } = await supabase.from('restaurants').insert(payload)
        if (insertError) throw insertError
      } else {
        const { error: updateError } = await supabase
          .from('restaurants')
          .update(payload)
          .eq('id', editing.id)
        if (updateError) throw updateError
        // Limpiar el logo anterior si fue reemplazado
        if (logoFile && editing.logo_url && editing.logo_url !== logo_url) {
          removeLogo(editing.logo_url)
        }
      }

      closeForm()
      refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(restaurant) {
    const { error: updateError } = await supabase
      .from('restaurants')
      .update({ is_active: !restaurant.is_active })
      .eq('id', restaurant.id)
    if (updateError) {
      setError(updateError.message)
    } else {
      setRestaurants((prev) =>
        prev.map((r) => (r.id === restaurant.id ? { ...r, is_active: !r.is_active } : r))
      )
    }
  }

  async function handleDelete(restaurant) {
    const warning = `¿Eliminar el restaurante "${restaurant.name}"? Se eliminarán también su menú y sus pedidos (ON DELETE CASCADE). Esta acción no se puede deshacer.`
    if (!window.confirm(warning)) return

    const { error: deleteError } = await supabase
      .from('restaurants')
      .delete()
      .eq('id', restaurant.id)
    if (deleteError) {
      setError(deleteError.message)
    } else {
      if (restaurant.logo_url) removeLogo(restaurant.logo_url)
      refresh()
    }
  }

  async function handleLogout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const setField = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  /* ---------- Render ---------- */

  return (
    <main className="relative mx-auto max-w-5xl overflow-x-clip px-4 py-8">
      <Backdrop variant="admin" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Superadmin</h1>
          <p className="mt-1 text-sm text-gray-600">
            Administración de restaurantes de la plataforma.
          </p>
        </div>
        <Button variant="outline" onClick={handleLogout}>
          Salir
        </Button>
      </div>

      <ErrorMessage className="mt-4" message={error} onRetry={refresh} />

      {editing === null && (
        <div className="mt-6">
          <Button onClick={openNew}>+ Nuevo restaurante</Button>

          {loading ? (
            <LoadingMessage label="Cargando restaurantes…" />
          ) : restaurants.length === 0 ? (
            <EmptyState
              className="mt-8"
              message={'Aún no hay restaurantes registrados. Crea el primero con "+ Nuevo restaurante".'}
            />
          ) : (
            <ul className="mt-4 space-y-3">
              {restaurants.map((r) => (
                <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start gap-4">
                    {/* Logo */}
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
                      {r.logo_url ? (
                        <img
                          src={r.logo_url}
                          alt={`Logo de ${r.name}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-xl font-extrabold text-gray-300">
                          {r.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Datos */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold text-gray-900">{r.name}</h2>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            r.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-200 text-gray-500'
                          }`}
                        >
                          {r.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">/{r.slug}</p>
                      {r.description && <p className="mt-1 text-sm text-gray-600">{r.description}</p>}
                      {r.address && <p className="mt-0.5 text-xs text-gray-500">📍 {r.address}</p>}
                    </div>

                    {/* Acciones: acceso transversal + CRUD */}
                    <div className="flex w-full flex-col items-start gap-2 sm:ml-auto sm:w-auto sm:items-end">
                      <div className="flex flex-wrap gap-1">
                        {[
                          { label: 'Menú', to: `/admin?r=${r.id}` },
                          { label: 'Pedidos', to: `/admin/pedidos?r=${r.id}` },
                          { label: 'Dashboard', to: `/admin/dashboard?r=${r.id}` },
                        ].map((link) => (
                          <Button
                            key={link.label}
                            size="sm"
                            className="!border-0 !bg-indigo-50 !text-indigo-700 hover:!bg-indigo-100"
                            onClick={() => navigate(link.to)}
                          >
                            {link.label}
                          </Button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          className={
                            r.is_active
                              ? 'border border-amber-300 bg-white text-amber-700 hover:bg-amber-50'
                              : 'border border-green-300 bg-white text-green-700 hover:bg-green-50'
                          }
                          onClick={() => toggleActive(r)}
                        >
                          {r.is_active ? 'Desactivar' : 'Activar'}
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleDelete(r)}>
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ---------- Formulario crear / editar ---------- */}
      {editing !== null && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-bold text-gray-900">
            {editing === 'new' ? 'Nuevo restaurante' : `Editar: ${editing.name}`}
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Nombre *">
              <Input
                type="text"
                required
                value={form.name}
                onChange={(e) => {
                  // El slug se autogenera del nombre mientras el usuario no lo edite a mano
                  const autoSlug = editing === 'new' || form.slug === slugify(form.name)
                  setForm((prev) => ({
                    ...prev,
                    name: e.target.value,
                    slug: autoSlug ? slugify(e.target.value) : prev.slug,
                  }))
                }}
              />
            </Field>

            <Field label="Slug (URL pública) *">
              <Input type="text" required value={form.slug} onChange={setField('slug')} />
            </Field>

            <Field label="Descripción" className="sm:col-span-2">
              <Textarea rows={2} value={form.description} onChange={setField('description')} />
            </Field>

            <Field label="Dirección" className="sm:col-span-2">
              <Input type="text" value={form.address} onChange={setField('address')} />
            </Field>
          </div>

          {/* Logo */}
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Vista previa del logo"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs text-gray-400">Sin logo</span>
              )}
            </div>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Logo</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  setLogoFile(file)
                  setLogoPreview(file ? URL.createObjectURL(file) : logoPreview)
                }}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </label>
          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Restaurante activo (visible en la plataforma)
          </label>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : editing === 'new' ? 'Crear restaurante' : 'Guardar cambios'}
            </Button>
            <Button variant="outline" onClick={closeForm}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </main>
  )
}
