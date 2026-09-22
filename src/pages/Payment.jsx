import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2, Smartphone, ShieldCheck, Zap } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import Button from '../components/ui/Button'

const PLAN_PRICE_INR = 99

export default function Payment() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, getSession } = useAuth()
  const [mode, setMode] = useState(searchParams.get('mode') === 'one_time' ? 'one_time' : 'subscription')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!user) return
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)
    return () => script.remove()
  }, [user])

  const plan = 'Pro'
  const amountLabel = mode === 'subscription' ? '₹99 / month' : '₹99 one-time'

  const startPayment = async () => {
    setLoading(true)
    setMessage('')
    try {
      if (!user) {
        navigate('/login?redirect=/payment?plan=pro')
        return
      }
      const session = await getSession()
      const response = await fetch('/.netlify/functions/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan: 'pro', mode }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to start payment')
      if (!window.Razorpay) throw new Error('Payment checkout is still loading. Please try again.')

      const checkout = new window.Razorpay({
        key: data.key_id,
        amount: data.amount,
        currency: 'INR',
        name: 'Web2App AI',
        description: mode === 'subscription' ? 'Pro monthly plan' : 'Pro one-time access',
        order_id: data.order_id,
        subscription_id: data.subscription_id,
        prefill: { email: user.email },
        handler: async (payment) => {
          const verifyResponse = await fetch('/.netlify/functions/verify-payment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ ...payment, mode, plan: 'pro' }),
          })
          const verifyData = await verifyResponse.json().catch(() => ({}))
          if (!verifyResponse.ok) throw new Error(verifyData.error || 'Payment verification failed')
          setMessage('Payment successful. Your Pro plan is active.')
          window.setTimeout(() => navigate('/dashboard'), 1200)
        },
        modal: { ondismiss: () => setLoading(false) },
      })
      checkout.on('payment.failed', (failure) => {
        setMessage(failure.error?.description || 'Payment failed. Please try again.')
        setLoading(false)
      })
      checkout.open()
    } catch (error) {
      setMessage(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-20 relative overflow-hidden">
        <div className="pointer-events-none absolute top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-600/15 blur-3xl" />
        <div className="card w-full max-w-md text-center relative">
          <Link to="/pricing" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6">
            <ArrowLeft size={16} /> Back to pricing
          </Link>
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-brand-500/25 to-purple-500/20 text-brand-400 flex items-center justify-center mb-4 border border-brand-500/20 shadow-glow-sm">
            <Smartphone size={26} />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-green-500/10 border border-green-500/20 px-3 py-1 text-xs font-medium text-green-400 mb-3">
            <ShieldCheck size={13} /> Secure Razorpay checkout
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Pay for {plan} plan</h1>
          <p className="text-gray-400 text-sm mb-6">
            Choose how you want to activate Pro. Payments are recorded against your account.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              ['subscription', 'Monthly', '₹99 / month'],
              ['one_time', 'One-time', '₹99'],
            ].map(([value, title, price]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  mode === value ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 bg-dark-800'
                }`}
              >
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs text-gray-400 mt-1">{price}</p>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 to-transparent p-5 mb-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Amount</span>
              <span className="font-bold text-white">{amountLabel}</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">UPI, cards and netbanking supported by Razorpay.</p>
          </div>

          <Button variant="primary" className="w-full justify-center" icon={loading ? <Loader2 size={16} className="animate-spin" /> : <Smartphone size={16} />} onClick={startPayment} loading={loading}>
            {user ? 'Pay securely with Razorpay' : 'Sign in to continue'}
          </Button>
          {message && <p className="text-sm text-gray-300 mt-4">{message}</p>}

          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-gray-500">
            <Zap size={13} className="text-yellow-400" />
            Payment opens directly in your UPI app
          </div>
          <p className="text-[11px] text-gray-500 mt-3">Payment status is verified server-side and stored securely.</p>
        </div>
      </main>
      <Footer />
    </div>
  )
}
