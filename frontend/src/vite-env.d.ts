/// <reference types="vite/client" />

// Garby environment variables — all must be prefixed VITE_ to be exposed to the client
interface ImportMetaEnv {
  readonly VITE_API_URL:             string   // Backend API URL (Railway)
  readonly VITE_SUPABASE_URL:        string   // Supabase project URL
  readonly VITE_SUPABASE_ANON_KEY:   string   // Supabase anon/public key
  readonly VITE_SIGHTENGINE_USER?:   string   // Optional: if calling SE from frontend
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
