import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Button from '../components/ui/Button.jsx'

// Usuario autenticado pero sin rol asignado en profiles
export default function AccessDenied() {
  const { signOut } = useAuth()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center">
      <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
        Acceso denegado
      </h1>
      <p className="max-w-md text-gray-600">
        Tu cuenta no tiene un rol asignado en la plataforma. Contacta al
        administrador de SaborWeb para que te habilite el acceso.
      </p>
      <Button variant="outline" onClick={signOut}>
        Cerrar sesión
      </Button>
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        Volver al inicio
      </Link>
    </main>
  )
}
