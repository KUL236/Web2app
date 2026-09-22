const {
  accessDetails, authenticatedUser, hmac, jsonHeaders, reply, requireConfig, signaturesEqual, supabase,
} = require('./lib/payment')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: jsonHeaders, body: '' }
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' })
  try {
    requireConfig()
    const user = await authenticatedUser(event)
    let input
    try { input = JSON.parse(event.body || '{}') } catch { return reply(400, { error: 'Invalid JSON body' }) }
    const { razorpay_order_id: orderId, razorpay_subscription_id: subscriptionId, razorpay_payment_id: paymentId, razorpay_signature: signature } = input
    if (!paymentId || !signature || (!orderId && !subscriptionId)) return reply(400, { error: 'Missing checkout payment fields' })
    const signedValue = orderId ? `${orderId}|${paymentId}` : `${paymentId}|${subscriptionId}`
    if (!signaturesEqual(hmac(signedValue, process.env.RAZORPAY_KEY_SECRET), signature)) {
      return reply(400, { error: 'Invalid checkout signature' })
    }
    const client = supabase()
    const query = client.from('payment_records').select('*').eq('user_id', user.id)
    const { data: record, error: lookupError } = await (orderId ? query.eq('razorpay_order_id', orderId) : query.eq('razorpay_subscription_id', subscriptionId)).maybeSingle()
    if (lookupError || !record) return reply(404, { error: 'Payment record not found' })
    const details = accessDetails(record.mode)
    const { error: paymentError } = await client.from('payment_records').update({
      razorpay_payment_id: paymentId, razorpay_signature: signature, status: 'captured', raw_payload: input,
    }).eq('id', record.id)
    if (paymentError) throw new Error(`Could not update payment record: ${paymentError.message}`)
    const { error: profileError } = await client.from('profiles').update(details).eq('id', user.id)
    if (profileError) throw new Error(`Could not activate profile: ${profileError.message}`)
    return reply(200, { success: true, plan: details.plan, plan_expires_at: details.plan_expires_at, credits: details.credits })
  } catch (error) {
    console.error('verify-payment error:', error)
    return reply(error.statusCode || 500, { error: error.message || 'Unable to verify payment' })
  }
}
