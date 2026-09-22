const { createClient } = require('@supabase/supabase-js')
const github = require('../lib/github')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const TERMINAL = ['complete', 'failed']
// If GitHub never starts a run for this build, give up instead of showing "queued" forever.
const RUN_START_TIMEOUT_MS = 8 * 60 * 1000
const HARD_TIMEOUT_MS = 40 * 60 * 1000

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

    const load = () =>
      supabase.from('builds').select('*, apps(*)').eq('id', buildId).eq('user_id', user.id).single()

    let { data: build, error: buildError } = await load()
    if (buildError || !build) return reply(404, { error: 'Build not found' })
    if (TERMINAL.includes(build.status)) return reply(200, { build })

    const update = async (patch) => {
      await supabase.from('builds').update(patch).eq('id', buildId)
      build = { ...build, ...patch }
    }
    const fail = (message) =>
      update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() })

    const ageMs = Date.now() - new Date(build.started_at || build.created_at).getTime()
    let hint = null

    if (!github.configured()) {
      return reply(200, { build, hint: 'GitHub is not configured on the server (GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO).' })
    }

    try {
      // 1. Find the workflow run (the callback normally does this, but it can fail silently).
      let run = null
      if (build.github_run_id) {
        run = await github.getRun(build.github_run_id)
      } else {
        run = await github.findRunForBuild(build.id)
        if (run) await update({ github_run_id: String(run.id) })
      }

      if (!run) {
        if (ageMs > RUN_START_TIMEOUT_MS) {
          await fail(
            'The build workflow never started. Check that .github/workflows/build-apk.yml is on the default branch and that GITHUB_TOKEN has repo + workflow access.'
          )
        } else {
          hint = 'Waiting for GitHub Actions to pick up the build...'
        }
        return reply(200, { build, hint })
      }

      // 2. Map the run state to our build state.
      if (run.status !== 'completed') {
        if (run.status === 'in_progress' && build.status === 'queued') await update({ status: 'building' })
        if (run.status !== 'in_progress') hint = 'Waiting for a free GitHub runner...'
        if (ageMs > HARD_TIMEOUT_MS) await fail('Build timed out.')
        return reply(200, { build, github: { status: run.status }, hint })
      }

      if (run.conclusion === 'success') {
        const asset = await github.getReleaseAsset(build.id)
        if (asset) {
          await update({
            status: 'complete',
            download_url: asset.browser_download_url,
            apk_size: asset.size,
            completed_at: new Date().toISOString(),
          })
        } else {
          await fail('Build finished but the APK release was not found.')
        }
      } else {
        const step = await github.getFailedStep(run.id)
        await fail(step ? `Build failed at step: ${step}` : `Build ${run.conclusion || 'failed'} in GitHub Actions.`)
      }
      return reply(200, { build, github: { status: run.status, conclusion: run.conclusion } })
    } catch (ghErr) {
      console.error('GitHub sync error:', ghErr.message)
      return reply(200, { build, hint: 'Could not reach GitHub right now, retrying...' })
    }
  } catch (err) {
    console.error('build-status error:', err)
    return reply(500, { error: 'Internal server error' })
  }
}
