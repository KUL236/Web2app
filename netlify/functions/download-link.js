const { createClient } = require('@supabase/supabase-js')
const github = require('../lib/github')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
}

const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'GET') return reply(405, { error: 'Method not allowed' })

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization
    if (!authHeader?.startsWith('Bearer ')) return reply(401, { error: 'Unauthorized' })

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7))
    if (authError || !user) return reply(401, { error: 'Invalid token' })

    const buildId = event.queryStringParameters?.build_id
    if (!buildId) return reply(400, { error: 'Missing build_id' })

    const { data: build, error } = await supabase
      .from('builds')
      .select('id, status, download_url, apk_size, user_id, apps(app_name, package_name)')
      .eq('id', buildId)
      .eq('user_id', user.id)
      .single()

    if (error || !build) return reply(404, { error: 'Build not found' })
    if (build.status !== 'complete') return reply(400, { error: 'Build is not complete yet' })

    // Prefer a fresh pre-signed URL: it also works when the GitHub repo is private,
    // where the plain release URL would answer 404 for normal users.
    let downloadUrl = null
    let fileName = `${build.apps?.package_name || 'app'}.apk`
    let size = build.apk_size

    if (github.configured()) {
      const asset = await github.getReleaseAsset(build.id)
      if (asset) {
        fileName = asset.name
        size = asset.size
        try {
          downloadUrl = await github.getSignedAssetUrl(asset.id)
        } catch (err) {
          console.error('signed url failed', err.message)
        }
        downloadUrl = downloadUrl || asset.browser_download_url
      }
    }
    downloadUrl = downloadUrl || build.download_url
    if (!downloadUrl) return reply(404, { error: 'The APK file is no longer available. Please rebuild the app.' })

    await supabase.from('downloads').insert({
      build_id: buildId,
      user_id: user.id,
      ip_address: (event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown').split(',')[0].trim(),
    })

    return reply(200, {
      download_url: downloadUrl,
      file_name: fileName,
      size,
      app_name: build.apps?.app_name,
      build_id: buildId,
    })
  } catch (err) {
    console.error('download-link error:', err)
    return reply(500, { error: 'Internal server error' })
  }
}
