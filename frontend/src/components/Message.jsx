// ═══════════════════════════════════════════════════════
// PATCH 5 — frontend/src/components/Message.jsx
// ACTION: Replace ENTIRE file with this
// ═══════════════════════════════════════════════════════

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, Check, X, Copy, CheckCheck, Hexagon, Cpu, Brain, Search, FileText, GraduationCap, MessageCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ── Code block with copy ─────────────────────────────────
function CodeBlock({ children, className }) {
  const [copied, setCopied] = useState(false)
  const lang = (className || '').replace('language-', '') || 'code'
  const code = String(children).replace(/\n$/, '')
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 rounded-xl overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center justify-between px-4 py-2"
        style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <span className="font-mono text-[11px] tracking-widest uppercase"
          style={{ color: 'rgba(255,255,255,0.3)' }}>{lang}</span>
        <button onClick={copy}
          className="flex items-center gap-1.5 text-[11px] transition-all hover:opacity-100"
          style={{ color: 'rgba(255,255,255,0.3)' }}>
          {copied
            ? <><CheckCheck size={11} style={{ color: '#4ade80' }} /> Copied</>
            : <><Copy size={11} /> Copy</>}
        </button>
      </div>
      <pre className="px-4 py-3.5 overflow-x-auto text-[13px] leading-relaxed font-mono m-0 border-0"
        style={{ color: '#e2e8f0', background: 'transparent' }}>
        <code>{code}</code>
      </pre>
    </motion.div>
  )
}

// ── Markdown ─────────────────────────────────────────────
function Markdown({ text }) {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<action>[\s\S]*?<\/action>/gi, '')
    .replace(/<observation>[\s\S]*?<\/observation>/gi, '')
    .trim()

  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children }) {
            if (inline) return <code style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '2px 6px', fontFamily: 'JetBrains Mono,monospace', fontSize: '.86em', color: '#fb7185' }}>{children}</code>
            return <CodeBlock className={className}>{children}</CodeBlock>
          },
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener" style={{ color: '#fb7185', textDecoration: 'underline', textUnderlineOffset: 2 }}>{children}</a>,
        }}
      >{clean}</ReactMarkdown>
    </div>
  )
}

// ── Agent badges ─────────────────────────────────────────
const BADGE = {
  GeneralAgent:    { label: 'Think',   icon: Brain,         color: '#e11d48', bg: 'rgba(225,29,72,0.1)',   border: 'rgba(225,29,72,0.25)' },
  CodingAgent:     { label: 'Code',    icon: Cpu,           color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',  border: 'rgba(56,189,248,0.25)' },
  SearchAgent:     { label: 'Search',  icon: Search,        color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)' },
  FileAgent:       { label: 'File',    icon: FileText,      color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)' },
  SmartTutorAgent: { label: 'Tutor',   icon: GraduationCap, color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)' },
  VisionAgent:     { label: 'Vision',  icon: Hexagon,       color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.25)' },
  FastChatAgent:   { label: 'Chat',    icon: MessageCircle, color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.25)' },
}

// ── User message with inline edit ───────────────────────
function UserMsg({ msg, onEdit }) {
  const [editing, setEditing]  = useState(false)
  const [draft,   setDraft]    = useState(msg.content)
  const [hovered, setHovered]  = useState(false)
  const ta = useRef()

  useEffect(() => {
    if (editing && ta.current) {
      ta.current.focus()
      ta.current.style.height = 'auto'
      ta.current.style.height = ta.current.scrollHeight + 'px'
    }
  }, [editing])

  const save = () => {
    const t = draft.trim()
    if (!t || t === msg.content) { setEditing(false); return }
    onEdit(msg.id, t)
    setEditing(false)
  }
  const cancel = () => { setDraft(msg.content); setEditing(false) }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="flex justify-end px-4 sm:px-6 py-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="max-w-[82%] sm:max-w-[70%] flex flex-col items-end gap-1.5">
        <AnimatePresence>
          {hovered && !editing && onEdit && (
            <motion.button
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md transition-all"
              style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)' }}
            >
              <Pencil size={10} /> Edit
            </motion.button>
          )}
        </AnimatePresence>

        {editing ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full flex flex-col gap-2">
            <textarea ref={ta} value={draft}
              onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() } if (e.key === 'Escape') cancel() }}
              className="w-full px-4 py-2.5 rounded-xl text-[14px] leading-relaxed min-h-[52px] outline-none"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(225,29,72,0.4)', color: 'rgba(255,255,255,0.9)', fontFamily: 'inherit', resize: 'none' }}
              rows={1}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={cancel}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <X size={11} /> Cancel
              </button>
              <button onClick={save}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: '#e11d48', color: 'white', border: 'none' }}>
                <Check size={11} /> Resend
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            whileHover={{ scale: 1.005 }}
            className="px-4 py-2.5 rounded-2xl rounded-br-md text-[14.5px] leading-[1.68] whitespace-pre-wrap"
            style={{
              background: 'rgba(255,255,255,0.07)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: 'rgba(255,255,255,0.9)',
            }}
          >
            {msg.content}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

// ── Assistant message ─────────────────────────────────────
function AssistantMsg({ msg, isStreaming }) {
  const [copied, setCopied] = useState(false)
  const badge = BADGE[msg.agent]
  const Icon  = badge?.icon || Hexagon

  const copyAll = () => {
    const text = msg.content.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/gi, '').trim()
    navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="px-4 sm:px-6 py-2 group"
    >
      <div className="max-w-[90%] sm:max-w-[84%] lg:max-w-[76%]">

        {/* Avatar + badge row */}
        <div className="flex items-center gap-2.5 mb-2.5">
          <motion.div
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: 'spring', stiffness: 400 }}
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{
              background: badge ? badge.bg : 'rgba(225,29,72,0.12)',
              border: `1px solid ${badge ? badge.border : 'rgba(225,29,72,0.22)'}`,
            }}
          >
            <Icon size={12} style={{ color: badge?.color || '#fb7185' }} />
          </motion.div>
          <span className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>RUBRA</span>
          {badge && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-[10px] px-2 py-0.5 rounded-full border font-medium"
              style={{ color: badge.color, background: badge.bg, borderColor: badge.border }}
            >
              {badge.label}
            </motion.span>
          )}
          {isStreaming && (
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="flex gap-1"
            >
              {[0, 1, 2].map(i => (
                <motion.div key={i} className="w-1 h-1 rounded-full"
                  style={{ background: badge?.color || '#e11d48' }}
                  animate={{ scale: [1, 1.4, 1] }}
                  transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                />
              ))}
            </motion.div>
          )}
        </div>

        {/* Content */}
        <div className="pl-[34px]">
          {msg.isError ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-sm px-4 py-3 rounded-xl"
              style={{ color: '#fb7185', background: 'rgba(248,113,133,0.08)', border: '1px solid rgba(248,113,133,0.2)' }}>
              {msg.content}
            </motion.div>
          ) : (
            <>
              <Markdown text={msg.content} />
              {isStreaming && (
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ repeat: Infinity, duration: 0.9, ease: 'steps(2)' }}
                  className="inline-block w-0.5 h-[15px] ml-0.5 rounded-sm align-middle"
                  style={{ background: '#e11d48' }}
                />
              )}
            </>
          )}

          {/* Copy */}
          {!isStreaming && msg.content && !msg.isError && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              className="mt-2 group-hover:opacity-100 transition-opacity"
              style={{ opacity: 0 }}
            >
              <button onClick={copyAll}
                className="flex items-center gap-1.5 text-[11px] transition-colors"
                style={{ color: 'rgba(255,255,255,0.25)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.55)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
              >
                {copied ? <><CheckCheck size={11} style={{ color: '#4ade80' }} /> Copied</> : <><Copy size={11} /> Copy</>}
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function Message({ msg, isStreaming, onEdit }) {
  if (msg.role === 'user') return <UserMsg msg={msg} onEdit={onEdit} />
  return <AssistantMsg msg={msg} isStreaming={isStreaming} />
}
