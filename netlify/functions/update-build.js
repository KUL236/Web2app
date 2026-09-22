const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const internalSecret = process.env.INTERNAL_SECRET

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    // Verify internal secret
    const secret = event.headers['x-callback-secret'] || event.headers['X-Callback-Secret']
    if (!internalSecret || secret !== internalSecret) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) }
    }

    let body
    try {
      body = JSON.parse(event.body)
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }
    }

    const { build_id, status, download_url, github_run_id, apk_size, error_message } = body

    if (!build_id || !status) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing build_id or status' }) }
    }

    const validStatuses = ['queued', 'building', 'signing', 'complete', 'failed']
    if (!validStatuses.includes(status)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid status' }) }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Never move a finished build back to an earlier state (late / duplicate callbacks)
    const { data: current } = await supabase.from('builds').select('status').eq('id', build_id).maybeSingle()
    const isUpgrade = current?.status === 'failed' && status === 'complete'
    if (current && ['complete', 'failed'].includes(current.status) && !isUpgrade) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, build_id, status, duplicate: true }) }
    }

    // Update build record
    const updateData = {
      status,
      ...(github_run_id && { github_run_id: String(github_run_id) }),
      ...(download_url && { download_url }),
      ...(apk_size && { apk_size: parseInt(apk_size) }),
      ...(error_message && { error_message }),
      ...(['complete', 'failed'].includes(status) && { completed_at: new Date().toISOString() }),
    }

    const { data: build, error: updateError } = await supabase
      .from('builds')
      .update(updateData)
      .eq('id', build_id)
      .select('*, apps(app_name, user_id)')
      .single()

    if (updateError) {
      console.error('Build update error:', updateError)
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to update build' }) }
    }

    // Create notification
    if (build?.apps) {
      const notifMap = {
        complete: {
          title: 'Build Complete! 🎉',
          message: `Your app "${build.apps.app_name}" APK is ready to download.`,
          type: 'success',
        },
        failed: {
          title: 'Build Failed',
          message: `Build for "${build.apps.app_name}" failed. ${error_message || 'Check build logs.'}`,
          type: 'error',
        },
        building: {
          title: 'Build In Progress',
          message: `"${build.apps.app_name}" is being compiled...`,
          type: 'info',
        },
      }

      if (notifMap[status]) {
        await supabase.from('notifications').insert({
          user_id: build.apps.user_id,
          ...notifMap[status],
        })
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, build_id, status }),
    }
  } catch (err) {
    console.error('update-build error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}
