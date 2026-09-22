import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CheckCircle, XCircle, Clock, Loader2, ExternalLink, RefreshCw, ArrowLeft, Smartphone,
  Hammer, KeyRound, PackageCheck, Download, ShieldCheck,
} from 'lucide-react'
import { useBuild } from '../hooks/useBuilds'
import { Badge, ProgressBar } from '../components/ui/Card'
import { DownloadButton } from '../components/ui/DownloadButton'
import { LauncherIcon } from '../components/create/IconPicker'
import { getBuildStatusColor, getBuildStatusLabel, formatDate, formatBytes } from '../lib/utils'
import Button from '../components/ui/Button'
import DashboardLayout from './DashboardLayout'

const STAGES = [
  { key: 'queued', label: 'Queued', text: 'Waiting for a build server', icon: Clock },
  { key: 'building', label: 'Building', text: 'Compiling your app', icon: Hammer },
  { key: 'signing', label: 'Signing', text: 'Signing & verifying the APK', icon: KeyRound },
  { key: 'complete', label: 'Ready', text: 'APK is ready to install', icon: PackageCheck },
]
const ORDER = STAGES.map((s) => s.key)
const PROGRESS = { queued: 8, building: 45, signing: 80, complete: 100, failed: 0 }

const INSTALL_STEPS = [
  'Download the APK on your Android phone (or transfer it from your computer).',
  'Open it. If Android asks, allow "Install unknown apps" for your browser or file manager.',
  'Tap Install, then Open. Your website now runs as a real app.',
]

function Stage({ stage, index, current, failed }) {
  const currentIndex = ORDER.indexOf(current)
  const done = index < currentIndex || current === 'complete'
  const active = index === currentIndex && current !== 'complete' && !failed
  const Icon = stage.icon

  return (
    <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 flex-1 min-w-0">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border transition-colors ${
          done ? 'bg-green-500/15 border-green-500/30 text-green-400'
            : active ? 'bg-brand-500/15 border-brand-500/40 text-brand-300'
            : failed && index === currentIndex ? 'bg-red-500/15 border-red-500/30 text-red-400'
            : 'bg-dark-700 border-white/5 text-gray-600'
        }`}
      >
        {done ? <CheckCircle size={18} /> : active ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-medium ${done ? 'text-green-400' : active ? 'text-white' : 'text-gray-500'}`}>{stage.label}</p>
        <p className="text-xs text-gray-500 hidden sm:block">{stage.text}</p>
      </div>
    </div>
  )
}

export default function BuildStatus() {
  const { buildId } = useParams()
  const navigate = useNavigate()
  const { build, loading, error, hint, refetch } = useBuild(buildId)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!build?.started_at || ['complete', 'failed'].includes(build?.status)) return undefined
    const start = new Date(build.started_at).getTime()
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [build?.started_at, build?.status])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-64">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="text-brand-400 animate-spin" />
            <p className="text-gray-400">Loading build status...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error || !build) {
    return (
      <DashboardLayout>
        <div className="text-center py-16">
          <XCircle size={40} className="text-red-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">Build not found</h2>
          <p className="text-gray-400 mb-6">{error || 'This build does not exist or belongs to another user.'}</p>
          <Button variant="secondary" onClick={() => navigate('/builds')} icon={<ArrowLeft size={16} />}>Back to builds</Button>
        </div>
      </DashboardLayout>
    )
  }

  const app = build.apps || {}
  const failed = build.status === 'failed'
  const complete = build.status === 'complete'
  const running = !failed && !complete
  const color = app.icon_color || '#6366f1'
  const mins = Math.floor(elapsed / 60)
  const secs = String(elapsed % 60).padStart(2, '0')

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate('/builds')} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft size={16} /> All builds
        </button>

        {/* Header */}
        <div className="card mb-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <LauncherIcon
                src={app.icon_url}
                color={color}
                size={56}
                fallback={<Smartphone size={24} className="text-white/90" />}
              />
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-white truncate">{app.app_name}</h1>
                <p className="text-xs text-gray-500 font-mono truncate">{app.package_name}</p>
              </div>
            </div>
            <Badge variant={getBuildStatusColor(build.status)}>{getBuildStatusLabel(build.status)}</Badge>
          </div>

          {/* Stages */}
          <div className="mt-6 flex flex-col sm:flex-row gap-4 sm:gap-2">
            {STAGES.map((stage, i) => (
              <Stage key={stage.key} stage={stage} index={i} current={failed ? 'queued' : build.status} failed={failed} />
            ))}
          </div>

          {running && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                <span>{hint || 'Build in progress - you can leave this page, we keep building.'}</span>
                <span className="font-mono">{mins}:{secs}</span>
              </div>
              <ProgressBar value={PROGRESS[build.status] || 5} />
              <p className="text-[11px] text-gray-500 mt-2">Usually takes 3-5 minutes. This page updates by itself.</p>
            </div>
          )}
        </div>

        {/* Success */}
        {complete && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-green-500/25 bg-gradient-to-br from-green-500/10 to-transparent p-6 mb-5"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center">
                <ShieldCheck size={20} className="text-green-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-white">Your APK is ready</p>
                <p className="text-xs text-gray-400">
                  Signed &amp; verified{build.apk_size ? ` · ${formatBytes(build.apk_size)}` : ''}
                </p>
              </div>
            </div>

            <DownloadButton buildId={build.id} size="lg" className="w-full justify-center">
              Download APK
            </DownloadButton>

            <div className="mt-5 pt-5 border-t border-white/10">
              <p className="text-xs font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <Download size={13} /> How to install
              </p>
              <ol className="space-y-2">
                {INSTALL_STEPS.map((step, i) => (
                  <li key={step} className="flex items-start gap-2.5 text-xs text-gray-400">
                    <span className="w-5 h-5 rounded-full bg-dark-700 flex items-center justify-center text-[10px] text-gray-400 font-mono flex-shrink-0">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </motion.div>
        )}

        {/* Failure */}
        {failed && (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/5 p-6 mb-5">
            <div className="flex items-center gap-3 mb-3">
              <XCircle size={20} className="text-red-400" />
              <p className="text-base font-semibold text-red-300">Build failed</p>
            </div>
            <p className="text-sm text-gray-300 bg-dark-900 rounded-xl p-3 font-mono break-words">
              {build.error_message || 'The build did not finish. Please try again.'}
            </p>
            <div className="flex gap-3 mt-4">
              <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => navigate('/create-app')}>Try again</Button>
            </div>
          </div>
        )}

        {/* Details */}
        <div className="card mb-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Build ID', value: build.id?.slice(0, 8) },
              { label: 'Started', value: build.started_at ? formatDate(build.started_at) : 'Pending' },
              { label: 'Finished', value: build.completed_at ? formatDate(build.completed_at) : '—' },
              { label: 'Website', value: (app.website_url || '').replace(/^https?:\/\//, '') || '—' },
              { label: 'APK size', value: build.apk_size ? formatBytes(build.apk_size) : '—' },
              { label: 'Run', value: build.github_run_id || '—' },
            ].map((item) => (
              <div key={item.label} className="bg-dark-900 rounded-xl p-3 min-w-0">
                <p className="text-[11px] text-gray-500 mb-1">{item.label}</p>
                <p className="text-xs text-white font-mono truncate">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {running && <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={refetch}>Refresh</Button>}
          {app.website_url && (
            <a href={app.website_url} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" icon={<ExternalLink size={16} />}>Visit website</Button>
            </a>
          )}
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>Dashboard</Button>
        </div>
      </div>
    </DashboardLayout>
  )
}
