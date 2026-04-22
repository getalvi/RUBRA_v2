// frontend/src/components/ChatArea.jsx — REPLACE ENTIRE FILE

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Message from './Message'
import { Hexagon } from 'lucide-react'

const STARTERS = [
  { icon: '🌤', title: 'Live weather',   desc: 'Real-time any city',          q: "What's the weather in Dhaka right now?" },
  { icon: '⚙',  title: 'Write code',     desc: 'Hermes Ultra Engine',          q: 'Build a glassmorphic React dashboard with live charts and dark mode' },
  { icon: '🎓', title: 'Smart Tutor',    desc: 'SSC/HSC/JSC help',             q: 'SSC Physics er first chapter ta explain koro step by step' },
  { icon: '🧮', title: 'Math solve',     desc: 'Step by step working',         q: 'Solve: x² + 5x + 6 = 0 and explain the quadratic formula' },
  { icon: '₿',  title: 'Crypto prices', desc: 'Live BTC, ETH & more',         q: 'Current Bitcoin, Ethereum, Solana prices with 24h change?' },
  { icon: '🖼',  title: 'Vision / PDF',  desc: 'Upload question paper',        q: null, isUpload: true },
  { icon: '📝', title: 'Exam paper',    desc: 'SSC/HSC generate',             q: 'HSC Physics chapter 1 theke 15ta MCQ question paper banao' },
  { icon: '🌐', title: 'Latest news',   desc: 'Live internet knowledge',      q: 'What are the biggest tech news stories happening right now?' },
]

function Welcome({ onSuggest }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center flex-1 px-4 py-8 text-center"
    >
      {/* Logo */}
      <motion.div
        className="relative w-24 h-24 mb-7"
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(225,29,72,0.15) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ border: '1px solid rgba(225,29,72,0.2)' }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
        />
        <motion.div
          className="absolute inset-3 rounded-full"
          style={{ border: '1px solid rgba(225,29,72,0.3)' }}
          animate={{ rotate: -360 }}
          transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
        />
        <div
          className="absolute inset-6 rounded-full flex items-center justify-center"
          style={{
            background: 'rgba(225,29,72,0.1)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(225,29,72,0.4)',
          }}
        >
          <Hexagon size={20} style={{ color: '#fb7185', filter: 'drop-shadow(0 0 8px rgba(225,29,72,0.6))' }} />
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="text-3xl font-semibold mb-2"
        style={{ color: 'rgba(255,255,255,0.92)' }}
      >
        Hi, I'm RUBRA
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.4 }}
        className="text-[15px] max-w-[440px] mb-2 leading-relaxed"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        Bangla, Banglish, English — যেকোনো ভাষায় কথা বলো।
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-[12.5px] mb-8"
        style={{ color: 'rgba(255,255,255,0.22)' }}
      >
        Vision · Smart Tutor · Hermes Coding · Live Data · Exam Generator
      </motion.p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full max-w-[700px]">
        {STARTERS.map((s, i) => (
          <motion.button
            key={s.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i + 0.3, duration: 0.35 }}
            whileHover={!s.isUpload ? { y: -3, scale: 1.02 } : {}}
            whileTap={!s.isUpload ? { scale: 0.97 } : {}}
            onClick={() => s.q && onSuggest(s.q)}
            disabled={s.isUpload}
            className="flex flex-col gap-2 p-3.5 rounded-xl text-left transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.08)',
              cursor: s.isUpload ? 'default' : 'pointer',
              opacity: s.isUpload ? 0.45 : 1,
            }}
            onMouseEnter={e => {
              if (!s.isUpload) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
            }}
          >
            <span className="text-xl leading-none">{s.icon}</span>
            <div>
              <p className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.82)' }}>{s.title}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.desc}</p>
            </div>
          </motion.button>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-6 text-[11.5px] flex flex-wrap gap-x-3 gap-y-1 justify-center"
        style={{ color: 'rgba(255,255,255,0.18)' }}
      >
        <span>📎 Image/PDF upload</span>
        <span>·</span>
        <span>🎓 Tutor বাংলায়</span>
        <span>·</span>
        <span>⚙ Hermes Ultra coding</span>
        <span>·</span>
        <span>🧠 XML reasoning</span>
        <span>·</span>
        <span>📚 NCTB 2026</span>
      </motion.p>
    </motion.div>
  )
}

export function ToolBadge({ tool }) {
  if (!tool) return null
  const icons = {
    weather: '🌤', crypto: '₿', currency: '💱',
    wikipedia: '📖', arxiv: '🔬', books: '📚', file: '📄', image: '🖼',
  }
  return (
    <div className="mx-4 sm:mx-6 my-1 inline-flex items-center gap-2 px-3 py-1.5
      rounded-lg bg-amber-500/06 border border-amber-500/12 text-xs text-amber-400/70 fade-in">
      <span>{icons[tool.tool] || '🔧'}</span>
      <span>Retrieved {tool.tool} data</span>
      {tool.title && <span className="text-white/20">— {tool.title.slice(0, 30)}</span>}
    </div>
  )
}

function OfflineBanner() {
  return (
    <div className="mx-4 mt-4 p-4 rounded-xl bg-rose-500/08 border border-rose-500/20 text-sm fade-in">
      <p className="font-semibold text-rose-400 mb-2">⚠️ Backend offline — 2 steps to fix:</p>
      <ol className="list-decimal list-inside space-y-1.5 text-white/60 text-[13px]">
        <li>
          Go to your <strong className="text-white/80">HuggingFace Space</strong> →
          make sure it shows <span className="text-emerald-400">Running</span>
        </li>
        <li>
          In <strong className="text-white/80">Vercel</strong> → Settings → Environment Variables → add:
          <div className="mt-1.5 bg-black/40 rounded-lg px-3 py-2 font-mono text-[12px] text-amber-300">
            VITE_API_URL = https://YOUR-HF-USERNAME-rubra-backend.hf.space
          </div>
          Then click <strong>Redeploy</strong>
        </li>
      </ol>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────
export default function ChatArea({
  messages, streaming, toolResult,
  onEdit, onSuggest, online,
  artifacts, activeArtifactId, onOpenArtifact,
}) {
  const bottomRef = useRef()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto">
      {online === false && <OfflineBanner />}
      {messages.length === 0 ? (
        <div className="flex flex-col h-full">
          <Welcome onSuggest={onSuggest} />
        </div>
      ) : (
        <div className="py-4 max-w-4xl mx-auto w-full">
          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1 && msg.role === 'assistant'
            return (
              <div key={msg.id}>
                {isLast && toolResult && <ToolBadge tool={toolResult} />}
                <Message
                  msg={msg}
                  isStreaming={isLast && streaming}
                  onEdit={msg.role === 'user' ? onEdit : null}
                  artifacts={artifacts}
                  onOpenPanel={onOpenArtifact}
                />
              </div>
            )
          })}
          <div ref={bottomRef} className="h-4" />
        </div>
      )}
    </div>
  )
}
