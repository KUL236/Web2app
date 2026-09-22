const {
  amount, authenticatedUser, jsonHeaders, razorpay, reply, requireConfig, supabase,
} = require('./lib/payment')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: jsonHeaders, body: '' }
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' })
  try {
    requireConfig()
    const user = await authenticatedUser(event)
    let input
    try { input = JSON.parse(event.body || '{}') } catch { return reply(400, { error: 'Invalid JSON body' }) }
    const mode = input.mode === 'one_time' ? 'one_time' : input.mode === 'subscription' ? 'subscription' : null
    if (!mode) return reply(400, { error: 'mode must be subscription or one_time' })
    if (input.plan !== 'pro') return reply(400, { error: 'Only the pro plan is available' })

    const value = amount()
    const notes = { user_id: user.id, plan: 'pro', mode }
    let payment
    if (mode === 'subscription') {
      if (!process.env.RAZORPAY_PRO_PLAN_ID) return reply(500, { error: 'RAZORPAY_PRO_PLAN_ID is not configured' })
      payment = await razorpay('subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          plan_id: process.env.RAZORPAY_PRO_PLAN_ID,
          total_count: Number(process.env.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT || 12),
          customer_notify: 1,
          notes,
        }),
      })
    } else {
      payment = await razorpay('orders', {
        method: 'POST',
        body: JSON.stringify({ amount: value, currency: 'INR', receipt: `pro_${user.id}_${Date.now()}`, notes }),
      })
    }

    const { error } = await supabase().from('payment_records').insert({
      user_id: user.id,
      provider: 'razorpay',
      mode,
      plan: 'pro',
      amount: value,
      currency: 'INR',
      razorpay_order_id: payment.id && mode === 'one_time' ? payment.id : null,
      razorpay_subscription_id: mode === 'subscription' ? payment.id : null,
      status: 'created',
      raw_payload: payment,
    })
    if (error) throw new Error(`Could not save payment record: ${error.message}`)
    return reply(200, {
      key_id: process.env.RAZORPAY_KEY_ID,
      amount: value,
      currency: 'INR',
      order_id: mode === 'one_time' ? payment.id : undefined,
      subscription_id: mode === 'subscription' ? payment.id : undefined,
    })
  } catch (error) {
    console.error('create-payment error:', error)
    return reply(error.statusCode || 500, { error: error.message || 'Unable to create payment' })
  }
}
