import { Outlet } from 'react-router-dom'

// Layout raíz: envuelve todas las rutas públicas.
export default function RootLayout() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Outlet />
    </div>
  )
}
