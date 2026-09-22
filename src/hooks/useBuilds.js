import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fetchBuildStatus } from '../lib/api'

export function useBuilds() {
  const { user } = useAuth()
  const [builds, setBuilds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchBuilds = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('builds')
        .select(`
          *,
          apps (id, app_name, website_url, package_name, icon_color, icon_url, icon_source)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      setBuilds(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchBuilds()
  }, [fetchBuilds])

  return { builds, loading, error, refetch: fetchBuilds }
}

export function useBuild(buildId) {
  const { user } = useAuth()
  const [build, setBuild] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hint, setHint] = useState(null)

  const refetch = useCallback(async () => {
    if (!user || !buildId) return
    try {
      // The server function also syncs with GitHub Actions, so a lost callback can't leave us on "queued".
      const result = await fetchBuildStatus(buildId)
      setBuild(result.build)
      setHint(result.hint || null)
      setError(null)
    } catch (err) {
      const { data, error: dbError } = await supabase
        .from('builds')
        .select(`*, apps (id, app_name, website_url, package_name, icon_color, icon_url, icon_source)`)
        .eq('id', buildId)
        .eq('user_id', user.id)
        .single()
      if (dbError) setError(dbError.message || err.message)
      else setBuild(data)
    } finally {
      setLoading(false)
    }
  }, [user, buildId])

  useEffect(() => {
    refetch()
  }, [refetch])

  const status = build?.status
  useEffect(() => {
    if (!status || ['complete', 'failed'].includes(status)) return undefined
    const timer = setInterval(refetch, 4000)
    return () => clearInterval(timer)
  }, [status, refetch])

  return { build, loading, error, hint, refetch }
}

export function useRecentBuilds(limit = 5) {
  const { user } = useAuth()
  const [builds, setBuilds] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const fetch = async () => {
      const { data } = await supabase
        .from('builds')
        .select(`*, apps (app_name, icon_color, icon_url, icon_source)`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)
      setBuilds(data || [])
      setLoading(false)
    }
    fetch()
  }, [user, limit])

  return { builds, loading }
}
