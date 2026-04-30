// frontend/src/components/ArtifactPanel.jsx
// NEW FILE — paste into frontend/src/components/

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Copy, CheckCheck, Download, Code2, Eye, ChevronLeft,
  ChevronRight, Monitor, Smartphone, ExternalLink, RefreshCw,
  Maximize2, Minimize2
} from 'lucide-react'

// ── Detect if code is renderable as HTML preview ─────────
function isRenderable(lang, code) {
  if (!code) return false
  if (lang === 'html') return true
  if (lang === 'svg') return true
  // React/JSX with enough HTML-like content
  if ((lang === 'jsx' || lang === 'tsx') && code.includes('return') && code.includes('<')) return true
  // Plain JS that builds DOM
  if (lang === 'javascript' && code.includes('document.')) return true
  return false
}

// ── Wrap JSX/JS into runnable HTML for iframe ────────────
function wrapForPreview(lang, code) {
  if (lang === 'html') return code
  if (lang === 'svg') return `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f0f0f;">${code}</body></html>`
  if (lang === 'javascript') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#0f0f0f;color:#fff;font-family:sans-serif;padding:16px;}</style></head><body><script>${code}<\/script></body></html>`
  }
  // JSX — use babel standalone
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { margin:0; background:#0f0f0f; color:#fff; font-family:'Segoe UI',sans-serif; }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${code}
    // Try to find and render the default export or last defined component
    const root = ReactDOM.createRoot(document.getElementById('root'));
    const toRender = typeof App !== 'undefined' ? App :
                     typeof Component !== 'undefined' ? Component :
                     typeof Dashboard !== 'undefined' ? Dashboard :
                     typeof Page !== 'undefined' ? Page :
                     (() => <div style={{padding:16,color:'#fb7185'}}>No renderable component found. Export as App or Component.</div>);
    root.render(React.createElement(toRender));
  <\/script>
</body>
</html>`
}

// ── Single artifact entry ─────────────────────────────────
// An artifact = { id, lang, code, title, timestamp }

// ── Main Panel ───────────────────────────────────────────
export default function ArtifactPanel({ artifacts, activeId, onClose, onSelectArtifact }) {
  const [tab, setTab]           = useState('code')   // 'code' | 'preview'
  const [copied, setCopied]     = useState(false)
  const [viewport, setViewport] = useState('desktop') // 'desktop' | 'mobile'
  const [fullscreen, setFullscreen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const iframeRef = useRef()

  const artifact = artifacts.find(a => a.id === activeId) || artifacts[artifacts.length - 1]

  // Auto-switch to preview tab if renderable
  useEffect(() => {
    if (artifact && isRenderable(artifact.lang, artifact.code)) {
      setTab('preview')
    } else {
      setTab('code')
    }
    setRefreshKey(k => k + 1)
  }, [activeId, artifact?.id])

  if (!artifact) return null

  const renderable = isRenderable(artifact.lang, artifact.code)
  const previewHtml = renderable ? wrapForPreview(artifact.lang, artifact.code) : ''

  const copyCode = () => {
    navigator.clipboard.writeText(artifact.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadCode = () => {
    const exts = { html:'html', css:'css', javascript:'js', typescript:'ts', jsx:'jsx', tsx:'tsx',
      python:'py', rust:'rs', go:'go', java:'java', cpp:'cpp', c:'c', bash:'sh', sql:'sql', json:'json', svg:'svg' }
    const ext = exts[artifact.lang] || 'txt'
    const blob = new Blob([artifact.code], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `rubra-${artifact.title?.toLowerCase().replace(/\s+/g,'-') || 'code'}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const openExternal = () => {
    const blob = new Blob([previewHtml], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      className={`flex flex-col h-full border-l overflow-hidden ${fullscreen ? 'fixed inset-0 z-50' : ''}`}
      style={{
        background: '#111214',
        borderColor: 'rgba(255,255,255,0.07)',
        width: fullscreen ? '100vw' : undefined,
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.3)' }}>

        {/* Artifact selector — show count if multiple */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {artifacts.length > 1 && (
            <>
              <button
                onClick={() => {
                  const idx = artifacts.findIndex(a => a.id === activeId)
                  if (idx > 0) onSelectArtifact(artifacts[idx - 1].id)
                }}
                disabled={artifacts.findIndex(a => a.id === activeId) === 0}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-20 transition-colors"
              >
                <ChevronLeft size={13} style={{ color: 'rgba(255,255,255,0.5)' }} />
              </button>
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {artifacts.findIndex(a => a.id === activeId) + 1}/{artifacts.length}
              </span>
              <button
                onClick={() => {
                  const idx = artifacts.findIndex(a => a.id === activeId)
                  if (idx < artifacts.length - 1) onSelectArtifact(artifacts[idx + 1].id)
                }}
                disabled={artifacts.findIndex(a => a.id === activeId) === artifacts.length - 1}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-20 transition-colors"
              >
                <ChevronRight size={13} style={{ color: 'rgba(255,255,255,0.5)' }} />
              </button>
              <div className="w-px h-3.5 mx-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
            </>
          )}
          <Code2 size={13} style={{ color: '#38bdf8', flexShrink: 0 }} />
          <span className="text-[12.5px] font-medium truncate" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {artifact.title || 'Code'}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono ml-1 flex-shrink-0"
            style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.2)' }}>
            {artifact.lang || 'code'}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setFullscreen(f => !f)}
            className="p-1.5 rounded-lg transition-all hover:bg-white/10"
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            {fullscreen ? <Minimize2 size={13}/> : <Maximize2 size={13}/>}
          </button>
          <button onClick={copyCode}
            className="p-1.5 rounded-lg transition-all hover:bg-white/10"
            title="Copy code"
            style={{ color: copied ? '#4ade80' : 'rgba(255,255,255,0.4)' }}>
            {copied ? <CheckCheck size={13}/> : <Copy size={13}/>}
          </button>
          <button onClick={downloadCode}
            className="p-1.5 rounded-lg transition-all hover:bg-white/10"
            title="Download"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <Download size={13}/>
          </button>
          <button onClick={onClose}
            className="p-1.5 rounded-lg transition-all hover:bg-white/10"
            title="Close panel"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <X size={13}/>
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
        <button
          onClick={() => setTab('code')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
            tab === 'code'
              ? 'text-white bg-white/10'
              : 'hover:bg-white/06'
          }`}
          style={{ color: tab === 'code' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)' }}
        >
          <Code2 size={11}/> Code
        </button>
        {renderable && (
          <button
            onClick={() => setTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
              tab === 'preview'
                ? 'text-white bg-white/10'
                : 'hover:bg-white/06'
            }`}
            style={{ color: tab === 'preview' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)' }}
          >
            <Eye size={11}/> Preview
          </button>
        )}

        {/* Preview toolbar */}
        {tab === 'preview' && renderable && (
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setViewport('desktop')}
              className={`p-1.5 rounded-lg transition-all ${viewport==='desktop' ? 'bg-white/10' : 'hover:bg-white/06'}`}
              title="Desktop view"
              style={{ color: viewport==='desktop' ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)' }}>
              <Monitor size={12}/>
            </button>
            <button onClick={() => setViewport('mobile')}
              className={`p-1.5 rounded-lg transition-all ${viewport==='mobile' ? 'bg-white/10' : 'hover:bg-white/06'}`}
              title="Mobile view"
              style={{ color: viewport==='mobile' ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)' }}>
              <Smartphone size={12}/>
            </button>
            <button onClick={() => setRefreshKey(k => k+1)}
              className="p-1.5 rounded-lg transition-all hover:bg-white/06"
              title="Refresh preview"
              style={{ color: 'rgba(255,255,255,0.3)' }}>
              <RefreshCw size={12}/>
            </button>
            <button onClick={openExternal}
              className="p-1.5 rounded-lg transition-all hover:bg-white/06"
              title="Open in new tab"
              style={{ color: 'rgba(255,255,255,0.3)' }}>
              <ExternalLink size={12}/>
            </button>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {tab === 'code' ? (
            <motion.div
              key="code"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full overflow-auto"
              style={{ background: 'rgba(0,0,0,0.4)' }}
            >
              <pre className="px-5 py-4 text-[12.5px] leading-relaxed font-mono m-0 min-h-full"
                style={{ color: '#e2e8f0', background: 'transparent', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                <code>{artifact.code}</code>
              </pre>
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full flex items-start justify-center overflow-auto py-4"
              style={{ background: '#0a0a0a' }}
            >
              <div
                className="transition-all duration-300 h-full"
                style={{
                  width: viewport === 'mobile' ? '375px' : '100%',
                  maxWidth: viewport === 'mobile' ? '375px' : 'none',
                  border: viewport === 'mobile' ? '1px solid rgba(255,255,255,0.1)' : 'none',
                  borderRadius: viewport === 'mobile' ? '12px' : 0,
                  overflow: 'hidden',
                  boxShadow: viewport === 'mobile' ? '0 0 40px rgba(0,0,0,0.5)' : 'none',
                  minHeight: '100%',
                }}
              >
                <iframe
                  key={refreshKey}
                  ref={iframeRef}
                  srcDoc={previewHtml}
                  title="Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  style={{ width: '100%', height: '100%', minHeight: '500px', border: 'none', display: 'block' }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-2 border-t flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)' }}>
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
          {artifact.code.split('\n').length} lines · {(artifact.code.length / 1024).toFixed(1)} KB
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg transition-all hover:bg-white/10"
            style={{ color: copied ? '#4ade80' : 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {copied ? <><CheckCheck size={11}/> Copied!</> : <><Copy size={11}/> Copy code</>}
          </button>
          <button
            onClick={downloadCode}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg transition-all hover:bg-white/10"
            style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <Download size={11}/> Download
          </button>
        </div>
      </div>
    </motion.div>
  )
}
