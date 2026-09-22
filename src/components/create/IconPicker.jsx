import { useCallback, useEffect, useRef, useState } from 'react'
import { Globe, ImagePlus, Sparkles, Trash2, Upload, AlertTriangle } from 'lucide-react'

export const ICON_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6']
export const MAX_ICON_FILE_SIZE = 5 * 1024 * 1024
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']

const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This image could not be read. Try another PNG or JPG.'))
    }
    img.src = url
  })
}

/**
 * Prepares an uploaded logo: 512x512 PNG (keeps transparency) + the same
 * background decision the Android build makes (opaque corners -> use edge colour).
 */
export async function prepareIcon(file) {
  const { img, url } = await loadImage(file)
  try {
    // corner probe on a small stretched copy
    const probe = document.createElement('canvas')
    probe.width = probe.height = 32
    const pctx = probe.getContext('2d', { willReadFrequently: true })
    pctx.drawImage(img, 0, 0, 32, 32)
    const corners = [[0, 0], [31, 0], [0, 31], [31, 31]].map(([x, y]) => pctx.getImageData(x, y, 1, 1).data)
    const opaque = corners.every((c) => c[3] >= 250)
    const bg = opaque
      ? hex(...[0, 1, 2].map((i) => corners.reduce((sum, c) => sum + c[i], 0) / 4))
      : null

    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const scale = Math.min(size / img.width, size / img.height)
    const w = img.width * scale
    const h = img.height * scale
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)

    return {
      dataUrl: canvas.toDataURL('image/png'),
      bg,
      opaque,
      lowRes: Math.min(img.width, img.height) < 192,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Approximation of how Android shows the adaptive icon (logo in the safe zone on the background). */
export function LauncherIcon({ src, color, size = 64, shape = 'squircle', fallback }) {
  const radius = shape === 'circle' ? '50%' : shape === 'square' ? '18%' : '30%'
  return (
    <div
      className="flex items-center justify-center overflow-hidden shadow-lg shadow-black/40 flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color, borderRadius: radius }}
    >
      {src ? (
        <img src={src} alt="" className="object-contain" style={{ width: '66%', height: '66%' }} />
      ) : (
        fallback || <Sparkles size={size * 0.4} className="text-white/90" />
      )}
    </div>
  )
}

export default function IconPicker({
  mode,
  onModeChange,
  iconFile,
  onFileChange,
  prepared,
  onPrepared,
  color,
  onColorChange,
  websiteUrl,
  error,
}) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState('')
  const [preview, setPreview] = useState('')
  const [favicon, setFavicon] = useState('')

  useEffect(() => {
    if (!iconFile) {
      setPreview('')
      return undefined
    }
    const url = URL.createObjectURL(iconFile)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [iconFile])

  useEffect(() => {
    try {
      const host = new URL(websiteUrl).hostname
      setFavicon(`https://www.google.com/s2/favicons?sz=128&domain=${host}`)
    } catch {
      setFavicon('')
    }
  }, [websiteUrl])

  const handleFile = useCallback(
    async (file) => {
      setLocalError('')
      if (!file) return
      if (!ACCEPTED.includes(file.type)) return setLocalError('Please choose a PNG, JPG or WebP image.')
      if (file.size > MAX_ICON_FILE_SIZE) return setLocalError('Logo must be smaller than 5 MB.')
      try {
        const result = await prepareIcon(file)
        onPrepared(result)
        onFileChange(file)
      } catch (err) {
        setLocalError(err.message)
      }
    },
    [onFileChange, onPrepared]
  )

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const remove = () => {
    onFileChange(null)
    onPrepared(null)
    setLocalError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const shownColor = mode === 'upload' && prepared?.opaque ? prepared.bg : color
  const shownSrc = mode === 'upload' ? preview : favicon
  const message = localError || error

  return (
    <div className="space-y-5">
      {/* Mode switch */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-dark-900 border border-white/10">
        {[
          { id: 'upload', label: 'Upload logo', icon: <ImagePlus size={15} /> },
          { id: 'favicon', label: 'Website favicon', icon: <Globe size={15} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onModeChange(tab.id)}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === tab.id ? 'bg-brand-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'upload' ? (
        <div>
          {!iconFile ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-2 text-center rounded-2xl border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${
                dragging ? 'border-brand-400 bg-brand-500/10' : 'border-white/15 hover:border-brand-500/50 hover:bg-white/[0.03]'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-brand-500/15 flex items-center justify-center">
                <Upload size={22} className="text-brand-300" />
              </div>
              <p className="text-sm text-white font-medium">Drop your logo here, or click to browse</p>
              <p className="text-xs text-gray-500">PNG, JPG or WebP · square, at least 512×512 looks best · max 5 MB</p>
            </div>
          ) : (
            <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-dark-900 p-4">
              <img src={preview} alt="Selected logo" className="w-14 h-14 rounded-xl object-contain bg-white/5 border border-white/10" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{iconFile.name}</p>
                <p className="text-xs text-gray-500">
                  {(iconFile.size / 1024).toFixed(0)} KB ·{' '}
                  {prepared?.opaque ? 'has its own background' : 'transparent background'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
              >
                Change
              </button>
              <button
                type="button"
                onClick={remove}
                title="Remove logo"
                className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {prepared?.lowRes && (
            <p className="flex items-center gap-1.5 text-xs text-yellow-400 mt-3">
              <AlertTriangle size={13} /> Low resolution logo - it may look blurry on the home screen.
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-dark-900 p-4">
          <Sparkles size={18} className="text-brand-300 flex-shrink-0" />
          <p className="text-xs text-gray-400">
            We'll grab your site's favicon automatically. Tiny favicons can look blurry - for a sharp icon,
            upload your own logo instead.
          </p>
        </div>
      )}

      {/* Colour */}
      <div>
        <p className="text-sm font-medium text-gray-300 mb-2">Brand colour</p>
        <div className="flex flex-wrap items-center gap-2.5">
          {ICON_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onColorChange(c)}
              aria-label={`Use colour ${c}`}
              className={`w-8 h-8 rounded-lg transition-all ${
                color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-dark-800 scale-110' : 'hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
            aria-label="Custom colour"
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {mode === 'upload' && prepared?.opaque
            ? 'Your logo has its own background, so the icon uses its edge colour. The brand colour still tints the app UI.'
            : 'Used behind the logo on the icon and as the app accent colour.'}
        </p>
      </div>

      {/* Preview */}
      <div className="rounded-2xl bg-dark-900 border border-white/10 p-4">
        <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">How it looks on Android</p>
        <div className="flex items-end gap-5">
          {[
            { shape: 'circle', label: 'Round' },
            { shape: 'squircle', label: 'Squircle' },
            { shape: 'square', label: 'Rounded' },
          ].map((s) => (
            <div key={s.shape} className="flex flex-col items-center gap-1.5">
              <LauncherIcon src={shownSrc} color={shownColor} shape={s.shape} size={56} />
              <span className="text-[10px] text-gray-500">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {message && <p className="text-xs text-red-400">{message}</p>}
    </div>
  )
}
