import { useState, useRef, useEffect } from 'react'
import { Pencil, Check, X, Copy, CheckCheck, Hexagon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Code block with copy button
function CodeBlock({ children, className }) {
  const [copied, setCopied] = useState(false)
  const lang = (className || '').replace('language-', '') || 'code'
  const code = String(children).replace(/\n$/, '')
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-lang">{lang}</span>
        <button onClick={copy} className="copy-btn">
          {copied ? <><CheckCheck size={11} style={{display:'inline',color:'#4ade80'}}/> Copied</> : <><Copy size={11} style={{display:'inline'}}/> Copy</>}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  )
}

// Markdown renderer
function Markdown({ text }) {
  // Remove DeepSeek think tags
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }) {
            if (inline) return <code {...props}>{children}</code>
            return <CodeBlock className={className}>{children}</CodeBlock>
          },
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener">{children}</a>,
        }}
      >
        {clean}
      </ReactMarkdown>
    </div>
  )
}

// Agent badge
const BADGE = {
  GeneralAgent:     { label:'🧠 Think',  cls:'text-rose-400 border-rose-500/20 bg-rose-500/08' },
  CodingAgent:      { label:'⚙ Code',   cls:'text-sky-400 border-sky-500/20 bg-sky-500/08' },
  SearchAgent:      { label:'🔍 Search', cls:'text-amber-400 border-amber-500/20 bg-amber-500/08' },
  FileAgent:        { label:'📄 File',   cls:'text-violet-400 border-violet-500/20 bg-violet-500/08' },
  SmartTutorAgent:  { label:'🎓 Tutor',  cls:'text-violet-400 border-violet-500/20 bg-violet-500/08' },
  FastChatAgent:    { label:'💬 Chat',   cls:'text-emerald-400 border-emerald-500/20 bg-emerald-500/08' },
}

// User message with inline edit
function UserMsg({ msg, onEdit }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(msg.content)
  const [show,    setShow]    = useState(false)
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
    <div className="flex justify-end px-4 sm:px-6 py-2 slide-up"
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <div className="max-w-[82%] sm:max-w-[72%] flex flex-col items-end gap-1.5">
        {/* Edit button */}
        {show && !editing && onEdit && (
          <button onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60
              px-2 py-0.5 rounded hover:bg-white/[.06] transition-all fade-in">
            <Pencil size={10}/> Edit
          </button>
        )}

        {editing ? (
          <div className="w-full flex flex-col gap-2">
            <textarea ref={ta} value={draft}
              onChange={e => { setDraft(e.target.value); e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px' }}
              onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();save()} if(e.key==='Escape')cancel() }}
              className="w-full bg-white/[.07] border border-rose-500/35 rounded-xl px-4 py-2.5
                text-[14px] text-white leading-relaxed min-h-[52px]" rows={1}/>
            <div className="flex gap-2 justify-end">
              <button onClick={cancel} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs
                text-white/50 hover:text-white bg-white/[.05] hover:bg-white/[.10] transition-all">
                <X size={11}/> Cancel
              </button>
              <button onClick={save} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs
                font-medium text-white bg-rose-500 hover:bg-rose-600 transition-all">
                <Check size={11}/> Resend
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white/[.07] hover:bg-white/[.09] border border-white/[.08]
            rounded-2xl rounded-br-md px-4 py-2.5 text-[14.5px] leading-[1.68]
            text-white/90 whitespace-pre-wrap transition-colors">
            {msg.content}
          </div>
        )}
      </div>
    </div>
  )
}

// Assistant message
function AssistantMsg({ msg, isStreaming }) {
  const [copied, setCopied] = useState(false)
  const badge = BADGE[msg.agent]

  const copyAll = () => {
    navigator.clipboard.writeText(msg.content.replace(/<think>[\s\S]*?<\/think>/g,'').trim())
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="px-4 sm:px-6 py-2 slide-up group">
      <div className="max-w-[88%] sm:max-w-[82%] lg:max-w-[75%]">
        {/* Avatar + badge row */}
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-6 h-6 rounded-md bg-rose-500/12 border border-rose-500/22 flex items-center justify-center flex-shrink-0">
            <Hexagon size={12} className="text-rose-400"/>
          </div>
          <span className="text-[12px] font-medium text-white/55">RUBRA</span>
          {badge && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
          )}
        </div>

        {/* Content */}
        <div className="pl-[34px]">
          {msg.isError ? (
            <div className="text-rose-400 text-sm bg-rose-500/08 border border-rose-500/18 rounded-xl px-4 py-3">
              {msg.content}
            </div>
          ) : (
            <>
              <Markdown text={msg.content}/>
              {isStreaming && <span className="cursor"/>}
            </>
          )}

          {/* Copy */}
          {!isStreaming && msg.content && !msg.isError && (
            <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={copyAll}
                className="flex items-center gap-1.5 text-[11px] text-white/25 hover:text-white/55 transition-colors">
                {copied ? <><CheckCheck size={11} className="text-emerald-400"/> Copied</> : <><Copy size={11}/> Copy</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Message({ msg, isStreaming, onEdit }) {
  if (msg.role === 'user') return <UserMsg msg={msg} onEdit={onEdit}/>
  return <AssistantMsg msg={msg} isStreaming={isStreaming}/>
}