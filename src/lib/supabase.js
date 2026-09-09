import { createClient } from '@supabase/supabase-js'

// trim(): las keys pegadas con salto de línea al final rompen el WebSocket
// de Realtime (%0A en la URL), aunque el REST las tolere.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan las variables de entorno VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. ' +
      'Revisa el archivo .env (ver .env.example).'
  )
}

// Cliente único de Supabase para toda la aplicación
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
