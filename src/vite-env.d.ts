/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_DEMO_SPEED: string
  readonly VITE_TWILIO_ENABLED: string
  readonly VITE_AUTH_MODE?: 'mock' | 'sms'
  readonly VITE_MAPTILER_KEY?: string
  readonly VITE_PUBLIC_APP_URL?: string
  readonly VITE_DEMO_SAFE_911?: string
  readonly VITE_DEMO_911_NUMBER?: string
  readonly VITE_SAFERIDE_PHONE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
