const {
  accessDetails, hmac, jsonHeaders, reply, requireConfig, signaturesEqual, supabase,
} = require('./lib/payment')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' })
  try {
    requireConfig()
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) return reply(500, { error: 'RAZORPAY_WEBHOOK_SECRET is not configured' })
    const signature = event.headers['x-razorpay-signature'] || event.headers['X-Razorpay-Signature']
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '')
    if (!signature || !signaturesEqual(hmac(raw, process.env.RAZORPAY_WEBHOOK_SECRET), signature)) return reply(401, { error: 'Invalid webhook signature' })
    let payload
    try { payload = JSON.parse(raw) } catch { return reply(400, { error: 'Invalid JSON body' }) }
    const eventName = payload.event
    const entity = payload.payload?.payment?.entity || payload.payload?.subscription?.entity || payload.payload?.order?.entity
    if (!entity) return reply(400, { error: 'Webhook payload has no supported entity' })
    const orderId = entity.order_id || null
    const subscriptionId = entity.subscription_id || (entity.id && entity.entity === 'subscription' ? entity.id : null)
    const client = supabase()
    let lookup = client.from('payment_records').select('*').limit(1)
    lookup = orderId ? lookup.eq('razorpay_order_id', orderId) : subscriptionId ? lookup.eq('razorpay_subscription_id', subscriptionId) : null
    if (!lookup) return reply(200, { received: true, ignored: true })
    const { data: record } = await lookup.maybeSingle()
    if (!record) return reply(200, { received: true, ignored: true })
    const successful = ['payment.captured', 'order.paid', 'subscription.activated', 'subscription.charged'].includes(eventName)
    const status = successful ? 'captured' : ['payment.failed', 'subscription.cancelled'].includes(eventName) ? 'failed' : record.status
    const patch = { status, raw_payload: payload }
    if (entity.id && entity.entity === 'payment') patch.razorpay_payment_id = entity.id
    await client.from('payment_records').update(patch).eq('id', record.id)
    if (successful) await client.from('profiles').update(accessDetails(record.mode)).eq('id', record.user_id)
    return reply(200, { received: true })
  } catch (error) {
    console.error('razorpay-webhook error:', error)
    return reply(500, { error: error.message || 'Webhook processing failed' })
  }
}
