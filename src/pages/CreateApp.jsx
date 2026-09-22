import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Globe, Smartphone, Package, ArrowRight, Info, ImagePlus, Wifi, Battery, Signal } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import IconPicker, { LauncherIcon } from '../components/create/IconPicker'
import { isValidUrl, generatePackageName } from '../lib/utils'
import toast from 'react-hot-toast'
import DashboardLayout from './DashboardLayout'

const NETLIFY_BASE = import.meta.env.VITE_NETLIFY_URL || ''
const PACKAGE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/

function PhonePreview({ appName, websiteUrl, packageName, iconSrc, iconColor }) {
  let host = ''
  try {
    host = new URL(websiteUrl).hostname.replace(/^www\./, '')
  } catch {
    host = ''
  }
  const label = appName || 'My App'

  return (
    <div className="mx-auto w-[260px] rounded-[2.2rem] bg-dark-800 border border-white/10 p-2.5 shadow-2xl shadow-black/50">
      <div className="rounded-[1.8rem] overflow-hidden bg-gradient-to-b from-dark-600 to-dark-900 h-[430px] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-3 text-[10px] text-white/70">
          <span>9:41</span>
          <span className="flex items-center gap-1"><Signal size={10} /><Wifi size={10} /><Battery size={11} /></span>
        </div>

        {/* home screen */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <motion.div key={`${iconSrc}-${iconColor}`} initial={{ scale: 0.85, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }}>
            <LauncherIcon src={iconSrc} color={iconColor} size={76} shape="squircle" fallback={<Smartphone size={30} className="text-white/90" />} />
          </motion.div>
          <p className="text-sm font-medium text-white max-w-[200px] truncate">{label}</p>
          <p className="text-[10px] text-gray-500 font-mono max-w-[200px] truncate">{packageName || 'com.example.app'}</p>
        </div>

        {/* what the WebView shows */}
        <div className="m-3 rounded-2xl bg-dark-900/80 border border-white/10 p-3">
          <div className="flex items-center gap-2">
            <Globe size={13} className="text-brand-300" />
            <p className="text-[11px] text-gray-300 truncate">{host || 'your-website.com'}</p>
          </div>
          <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full w-2/3 rounded-full" style={{ backgroundColor: iconColor }} />
          </div>
          <p className="text-[10px] text-gray-500 mt-2">Your website opens full-screen inside the app.</p>
        </div>
      </div>
    </div>
  )
}

export default function CreateApp() {
  const navigate = useNavigate()
  const { getSession } = useAuth()

  const [form, setForm] = useState({ appName: '', websiteUrl: '', packageName: '', iconColor: '#6366f1' })
  const [packageTouched, setPackageTouched] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [iconMode, setIconMode] = useState('upload')
  const [iconFile, setIconFile] = useState(null)
  const [prepared, setPrepared] = useState(null)
  const [iconPreview, setIconPreview] = useState('')

  useEffect(() => {
    if (!iconFile) {
      setIconPreview('')
      return undefined
    }
    const url = URL.createObjectURL(iconFile)
    setIconPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [iconFile])

  // Auto-generate the package name until the user edits it by hand
  useEffect(() => {
    if (!packageTouched && form.appName && form.websiteUrl) {
      setForm((f) => ({ ...f, packageName: generatePackageName(form.appName, form.websiteUrl) }))
    }
  }, [form.appName, form.websiteUrl, packageTouched])

  const updateField = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: '' }))
  }

  const validate = () => {
    const errs = {}
    const name = form.appName.trim()
    if (!name) errs.appName = 'App name is required'
    else if (name.length < 2) errs.appName = 'Must be at least 2 characters'
    else if (name.length > 50) errs.appName = 'Max 50 characters'

    if (!form.websiteUrl) errs.websiteUrl = 'Website URL is required'
    else if (!isValidUrl(form.websiteUrl)) errs.websiteUrl = 'Must be a valid URL (https://...)'

    if (!form.packageName) errs.packageName = 'Package name is required'
    else if (!PACKAGE_RE.test(form.packageName)) errs.packageName = 'Use a format like com.example.app (lowercase letters, digits, _)'

    if (iconMode === 'upload' && !prepared) errs.iconFile = 'Upload your logo, or switch to "Website favicon".'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) return setErrors(errs)

    setLoading(true)
    setErrors({})
    try {
      const session = await getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch(`${NETLIFY_BASE}/.netlify/functions/create-app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          app_name: form.appName.trim(),
          website_url: form.websiteUrl.trim(),
          package_name: form.packageName.trim(),
          icon_color: form.iconColor,
          icon_source: iconMode,
          icon_data_url: iconMode === 'upload' ? prepared.dataUrl : '',
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.status === 402 && data.code === 'MONTHLY_LIMIT_REACHED') {
        toast.error(data.error)
        navigate('/pricing')
        return
      }
      if (!response.ok) throw new Error(data.error || 'Failed to create app')

      toast.success('App created! Build started...')
      navigate(`/builds/${data.build_id}`)
    } catch (err) {
      toast.error(err.message)
      setErrors({ form: err.message })
    } finally {
      setLoading(false)
    }
  }

  const previewIcon = iconMode === 'upload' ? iconPreview : ''
  const previewColor = iconMode === 'upload' && prepared?.opaque ? prepared.bg : form.iconColor

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">Create New App</h1>
          <p className="text-gray-400 text-sm">Add your website and logo - we'll build a signed Android APK for you.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-5" noValidate>
            <div className="card">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Smartphone size={16} className="text-brand-400" /> App details
              </h2>
              <div className="space-y-4">
                <Input
                  label="App name"
                  placeholder="My Awesome App"
                  value={form.appName}
                  onChange={(e) => updateField('appName', e.target.value)}
                  error={errors.appName}
                  hint="Shown under the icon on the phone"
                  icon={<Smartphone size={16} />}
                />
                <Input
                  label="Website URL"
                  type="url"
                  placeholder="https://your-website.com"
                  value={form.websiteUrl}
                  onChange={(e) => updateField('websiteUrl', e.target.value)}
                  error={errors.websiteUrl}
                  hint="The website that opens inside the app"
                  icon={<Globe size={16} />}
                />
              </div>
            </div>

            <div className="card">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <ImagePlus size={16} className="text-brand-400" /> App logo
              </h2>
              <IconPicker
                mode={iconMode}
                onModeChange={(m) => { setIconMode(m); setErrors((er) => ({ ...er, iconFile: '' })) }}
                iconFile={iconFile}
                onFileChange={(f) => { setIconFile(f); setErrors((er) => ({ ...er, iconFile: '' })) }}
                prepared={prepared}
                onPrepared={setPrepared}
                color={form.iconColor}
                onColorChange={(c) => updateField('iconColor', c)}
                websiteUrl={form.websiteUrl}
                error={errors.iconFile}
              />
            </div>

            <div className="card">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Package size={16} className="text-brand-400" /> Android package
              </h2>
              <Input
                label="Package name"
                placeholder="com.example.myapp"
                value={form.packageName}
                onChange={(e) => { setPackageTouched(true); updateField('packageName', e.target.value.trim().toLowerCase()) }}
                error={errors.packageName}
                hint="Unique app id on the phone. Generated for you - change only if you need to."
                icon={<Package size={16} />}
              />
            </div>

            <div className="flex items-start gap-3 p-4 bg-brand-500/5 border border-brand-500/20 rounded-xl">
              <Info size={16} className="text-brand-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-brand-300 font-medium">Build time: about 3-5 minutes</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Every app is a WebView wrapper, so APKs are small (~2 MB) - your website itself loads live.
                  Each APK still gets its own package name, app name, website and icon.
                </p>
              </div>
            </div>

            {errors.form && (
              <p className="text-sm text-red-400 p-3 bg-red-500/10 rounded-xl border border-red-500/20">{errors.form}</p>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center"
              loading={loading}
              size="lg"
              iconRight={!loading && <ArrowRight size={16} />}
            >
              {loading ? 'Creating app & starting build...' : 'Create app & build APK'}
            </Button>
          </form>

          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-24">
              <h3 className="text-sm font-semibold text-gray-400 mb-4 text-center">Live preview</h3>
              <PhonePreview
                appName={form.appName}
                websiteUrl={form.websiteUrl}
                packageName={form.packageName}
                iconSrc={previewIcon}
                iconColor={previewColor}
              />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
