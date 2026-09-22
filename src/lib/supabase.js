import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rvfhqaynokcxideepuqh.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2ZmhxYXlub2tjeGlkZWVwdXFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNjU2ODgsImV4cCI6MjEwNTY0MTY4OH0.ZX2oXj3QyOQzfRB4UNxLEf5p98QRNzWoH62szpjQdxY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

export default supabase
