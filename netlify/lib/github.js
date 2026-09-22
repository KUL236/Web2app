// Small GitHub REST helper shared by the Netlify functions.
const owner = process.env.GITHUB_OWNER
const repo = process.env.GITHUB_REPO
const token = process.env.GITHUB_TOKEN

const WORKFLOW_FILE = 'build-apk.yml'

function configured() {
  return Boolean(owner && repo && token)
}

function baseHeaders(accept = 'application/vnd.github+json') {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'web2app-ai',
  }
}

async function ghJson(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers: baseHeaders() })
  if (!res.ok) {
    const err = new Error(`GitHub ${res.status} for ${path}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// The workflow sets `run-name: build-<buildId>`, so a run can be found without any callback.
async function findRunForBuild(buildId) {
  const data = await ghJson(
    `/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?event=repository_dispatch&per_page=40`
  )
  return (data.workflow_runs || []).find((run) => (run.display_title || run.name || '').includes(`build-${buildId}`)) || null
}

async function getRun(runId) {
  return ghJson(`/repos/${owner}/${repo}/actions/runs/${runId}`)
}

async function getFailedStep(runId) {
  try {
    const data = await ghJson(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`)
    for (const job of data.jobs || []) {
      const step = (job.steps || []).find((s) => s.conclusion === 'failure')
      if (step) return step.name
    }
  } catch (err) {
    console.error('getFailedStep failed', err.message)
  }
  return null
}

// Release created by the workflow: tag = build-<buildId>
async function getReleaseAsset(buildId) {
  try {
    const release = await ghJson(`/repos/${owner}/${repo}/releases/tags/build-${buildId}`)
    const asset = (release.assets || []).find((a) => a.name.endsWith('.apk'))
    return asset
      ? { id: asset.id, name: asset.name, size: asset.size, browser_download_url: asset.browser_download_url }
      : null
  } catch (err) {
    if (err.status !== 404) console.error('getReleaseAsset failed', err.message)
    return null
  }
}

// Works for private repos too: GitHub answers with a short-lived pre-signed URL.
async function getSignedAssetUrl(assetId) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${assetId}`, {
    headers: baseHeaders('application/octet-stream'),
    redirect: 'manual',
  })
  if (res.status >= 300 && res.status < 400) return res.headers.get('location')
  return null
}

module.exports = { configured, findRunForBuild, getRun, getFailedStep, getReleaseAsset, getSignedAssetUrl }
