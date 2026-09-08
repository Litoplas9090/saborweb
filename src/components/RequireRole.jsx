import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import AccessDenied from '../pages/AccessDenied.jsx'
import { PageLoading } from './ui/Spinner.jsx'

// Protege rutas por rol: exige sesión y que el profile tenga alguno de los
// roles indicados (string o array).
export default function RequireRole({ role, children }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()
  const allowed = Array.isArray(role) ? role : [role]

  if (loading) {
    return <PageLoading label="Verificando acceso…" />
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!profile || !allowed.includes(profile.role)) {
    return <AccessDenied />
  }

  return children
}
