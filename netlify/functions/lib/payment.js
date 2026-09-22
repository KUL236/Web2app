const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const jsonHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
}

function reply(statusCode, body, headers = jsonHeaders) {
  return { statusCode, headers, body: JSON.stringify(body) }
}

function requireConfig() {
  const names = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']
  const missing = names.filter((name) => !process.env[name])
  if (missing.length) throw new Error(`Missing server configuration: ${missing.join(', ')}`)
}

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

async function razorpay(path, options = {}) {
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`Razorpay API error (${response.status}): ${data.error?.description || 'request failed'}`)
  }
  return data
}

function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(value, 'utf8').digest('hex')
}

function signaturesEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right))
}

function amount() {
  const value = Number(process.env.RAZORPAY_PRO_AMOUNT || 9900)
  if (!Number.isInteger(value) || value <= 0) throw new Error('RAZORPAY_PRO_AMOUNT must be a positive integer in paise')
  return value
}

function accessDetails(mode) {
  const days = Number(process.env.RAZORPAY_PRO_ACCESS_DAYS || 30)
  const credits = Number(process.env.RAZORPAY_PRO_CREDITS || 100)
  if (!Number.isInteger(days) || days <= 0 || !Number.isInteger(credits) || credits < 0) {
    throw new Error('RAZORPAY_PRO_ACCESS_DAYS and RAZORPAY_PRO_CREDITS must be valid integers')
  }
  const expiry = new Date(Date.now() + days * 86400000).toISOString()
  return { plan: 'pro', plan_expires_at: expiry, credits }
}

async function authenticatedUser(event) {
  const header = event.headers.authorization || event.headers.Authorization
  if (!header || !header.startsWith('Bearer ')) throw Object.assign(new Error('Authorization bearer token is required'), { statusCode: 401 })
  const { data, error } = await supabase().auth.getUser(header.slice(7))
  if (error || !data.user) throw Object.assign(new Error('Invalid authentication token'), { statusCode: 401 })
  return data.user
}

module.exports = {
  accessDetails,
  amount,
  authenticatedUser,
  hmac,
  jsonHeaders,
  razorpay,
  reply,
  requireConfig,
  signaturesEqual,
  supabase,
}
