import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, pathForRole } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import Button from '../components/ui/Button.jsx'
import Backdrop from '../components/ui/Backdrop.jsx'
import Field from '../components/ui/Field.jsx'
import Input from '../components/ui/Input.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import { PageLoading } from '../components/ui/Spinner.jsx'

export default function Login() {
  const { session, profile, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Si ya hay sesión con perfil cargado, ir al panel correspondiente
  useEffect(() => {
    if (!loading && session && profile) {
      navigate(pathForRole(profile.role) ?? '/acceso-denegado', { replace: true })
    }
  }, [loading, session, profile, navigate])

  // Esperando la sesión/profile para redirigir (evita parpadeo del formulario)
  if (loading || (session && profile)) {
    return <PageLoading label="Verificando sesión…" />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const { data, error: authError } = await signIn(email, password)
    if (authError) {
      setError('Credenciales incorrectas. Verifica tu email y contraseña.')
      setSubmitting(false)
      return
    }

    // Consultar el rol del profile para decidir a dónde redirigir
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', data.user.id)
      .single()

    navigate(pathForRole(profileData?.role) ?? '/acceso-denegado', { replace: true })
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <Backdrop />
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-md"
      >
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">SaborWeb</h1>
          <p className="mt-1 text-sm text-gray-500">
            Ingreso para administradores
          </p>
        </div>

        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Contraseña" htmlFor="password">
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <ErrorMessage message={error} />

        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
    </main>
  )
}
