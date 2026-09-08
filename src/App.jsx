import { Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import RootLayout from './components/RootLayout.jsx'
import RequireRole from './components/RequireRole.jsx'
import Button from './components/ui/Button.jsx'
import Login from './pages/Login.jsx'
import AccessDenied from './pages/AccessDenied.jsx'
import AdminLayout from './pages/admin/AdminLayout.jsx'
import MenuAdmin from './pages/admin/MenuAdmin.jsx'
import OrdersBoard from './pages/admin/OrdersBoard.jsx'
import Dashboard from './pages/admin/Dashboard.jsx'
import RestaurantsAdmin from './pages/superadmin/RestaurantsAdmin.jsx'
import MenuPage from './pages/MenuPage.jsx'
import OrderTracking from './pages/OrderTracking.jsx'

// Ruta temporal de arranque (Hito 4: landing pública del restaurante /:slug)
function TempHome() {
  const navigate = useNavigate()
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight">SaborWeb</h1>
      <p className="max-w-md text-gray-600">
        Plataforma de pedidos para restaurantes. El proyecto está en construcción —
        aquí irá la landing pública del restaurante.
      </p>
      <Button variant="primary" onClick={() => navigate('/login')}>
        Ingreso administradores
      </Button>
    </main>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<TempHome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/acceso-denegado" element={<AccessDenied />} />

          {/* Seguimiento de pedidos por teléfono del cliente (Hito 6) */}
          <Route path="/seguimiento" element={<OrderTracking />} />

          {/* Menú público del restaurante (Hito 4) */}
          <Route path="/:slug" element={<MenuPage />} />

          {/* Panel de restaurante (restaurant_admin de SU restaurante, o superadmin con selector) */}
          <Route
            path="/admin"
            element={
              <RequireRole role={['restaurant_admin', 'superadmin']}>
                <AdminLayout />
              </RequireRole>
            }
          >
            <Route index element={<MenuAdmin />} />
            <Route path="pedidos" element={<OrdersBoard />} />
            <Route path="dashboard" element={<Dashboard />} />
          </Route>

          {/* Panel del superusuario de plataforma (solo superadmin) */}
          <Route
            path="/superadmin"
            element={
              <RequireRole role="superadmin">
                <RestaurantsAdmin />
              </RequireRole>
            }
          />

        </Route>
      </Routes>
    </AuthProvider>
  )
}
