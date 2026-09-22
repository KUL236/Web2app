import { supabase } from './supabase'

const BASE = import.meta.env.VITE_NETLIFY_URL || ''

async function authedFetch(path, init = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Session expired. Please sign in again.')

  const response = await fetch(`${BASE}/.netlify/functions/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      Authorization: `Bearer ${session.access_token}`,
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`)
  return body
}

/** Build state. The server also syncs it with GitHub Actions, so it can't get stuck on "queued". */
export const fetchBuildStatus = (buildId) =>
  authedFetch(`build-status?build_id=${encodeURIComponent(buildId)}`)

/** Asks the server for a fresh download link and starts the APK download. */
export async function downloadApk(buildId) {
  const info = await authedFetch(`download-link?build_id=${encodeURIComponent(buildId)}`)
  const link = document.createElement('a')
  link.href = info.download_url
  link.download = info.file_name || 'app.apk'
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  return info
}
