import { useState } from 'react'
import { Download } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from './Button'
import { downloadApk } from '../../lib/api'

async function run(buildId, setBusy) {
  setBusy(true)
  try {
    await downloadApk(buildId)
    toast.success('Download started - check your Downloads folder')
  } catch (err) {
    toast.error(err.message || 'Download failed')
  } finally {
    setBusy(false)
  }
}

export function DownloadButton({ buildId, children = 'Download APK', ...props }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button variant="success" icon={<Download size={16} />} loading={busy} onClick={() => run(buildId, setBusy)} {...props}>
      {children}
    </Button>
  )
}

export function DownloadIconButton({ buildId, className = '' }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      title="Download APK"
      disabled={busy}
      onClick={(e) => { e.stopPropagation(); run(buildId, setBusy) }}
      className={`p-2 rounded-lg bg-brand-600/20 text-brand-400 hover:bg-brand-600/30 transition-colors disabled:opacity-50 ${className}`}
    >
      <Download size={14} className={busy ? 'animate-bounce' : ''} />
    </button>
  )
}
