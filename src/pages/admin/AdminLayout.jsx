import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import Button from '../../components/ui/Button.jsx'

const navItems = [
  { to: '/admin', label: 'Menú', end: true },
  { to: '/admin/pedidos', label: 'Pedidos', end: false },
  { to: '/admin/dashboard', label: 'Dashboard', end: false },
]

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const linkClass = ({ isActive }) =>
    `rounded-lg px-4 py-2 text-sm font-semibold transition ${
      isActive
        ? 'bg-indigo-600 text-white'
        : 'text-gray-600 hover:bg-gray-100'
    }`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <span className="text-lg font-extrabold tracking-tight">SaborWeb</span>
            <span className="ml-2 text-sm text-gray-500">
              Panel de restaurante
            </span>
          </div>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={linkClass}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-gray-500 sm:inline">
              {profile?.full_name ?? 'Admin'}
            </span>
            <Button variant="outline" onClick={handleLogout}>
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
