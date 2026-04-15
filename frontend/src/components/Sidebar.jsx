import { X, Plus, MessageSquare, Hexagon } from 'lucide-react'

const QUICK = [
  { icon:'🌤', label:'Weather',  q:"What's the weather in Dhaka today?" },
  { icon:'₿',  label:'Crypto',   q:'Current Bitcoin and Ethereum prices?' },
  { icon:'🐍', label:'Code',     q:'Write a Python async web scraper with retry logic' },
  { icon:'🔬', label:'Research', q:'Find recent arXiv papers on transformer models' },
  { icon:'💱', label:'Rates',    q:'USD to BDT, EUR, GBP exchange rates today' },
  { icon:'⚡', label:'Help',     q:'What can you do? Show me your features.' },
]

function timeAgo(ts) {
  const d = Date.now() - ts
  if (d < 60000)    return 'just now'
  if (d < 3600000)  return `${Math.floor(d/60000)}m ago`
  if (d < 86400000) return `${Math.floor(d/3600000)}h ago`
  return `${Math.floor(d/86400000)}d ago`
}

function Inner({ sessions, currentId, onNew, onLoad }) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-[52px] border-b border-white/[.07] flex-shrink-0">
        <Hexagon size={16} className="text-rose-500" />
        <span className="font-semibold text-sm tracking-wide">RUBRA</span>
      </div>

      {/* New chat */}
      <div className="p-3 flex-shrink-0">
        <button onClick={onNew}
          className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm
            bg-white/[.05] hover:bg-white/[.09] border border-white/[.07]
            text-white/70 hover:text-white transition-all">
          <Plus size={14} /> New conversation
        </button>
      </div>

      {/* Quick asks */}
      <div className="px-3 pb-3 flex-shrink-0">
        <p className="text-[10px] text-white/25 uppercase tracking-[2px] mb-2 px-1">Quick ask</p>
        <div className="grid grid-cols-2 gap-1.5">
          {QUICK.map(q => (
            <button key={q.label} onClick={() => { onNew(); setTimeout(() => onLoad && null, 50) }}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[11.5px]
                bg-white/[.03] hover:bg-white/[.07] border border-white/[.05]
                text-white/45 hover:text-white/80 transition-all truncate"
              title={q.q}>
              <span>{q.icon}</span><span className="truncate">{q.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-white/[.05] mx-3 flex-shrink-0" />

      {/* History */}
      <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
        {sessions.length === 0 ? (
          <p className="text-[11px] text-white/25 px-3 py-2">No conversations yet</p>
        ) : (
          <>
            <p className="text-[10px] text-white/25 uppercase tracking-[2px] mb-1.5 px-2">Recent</p>
            {sessions.map(s => (
              <button key={s.id} onClick={() => onLoad(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left mb-0.5
                  text-[12px] transition-all border
                  ${s.id === currentId
                    ? 'bg-rose-500/10 border-rose-500/20 text-white/80'
                    : 'border-transparent text-white/50 hover:bg-white/[.05] hover:text-white/75'}`}>
                <MessageSquare size={12} className={s.id===currentId?'text-rose-400':'text-white/25'} />
                <div className="flex-1 min-w-0">
                  <p className="truncate">{s.title || 'Conversation'}</p>
                  {s.ts && <p className="text-[10px] text-white/20 mt-0.5">{timeAgo(s.ts)}</p>}
                </div>
              </button>
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/[.05] flex-shrink-0 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] text-white/25">RUBRA v5 · All features active</span>
      </div>
    </div>
  )
}

export default function Sidebar({ open, onClose, sessions, currentId, onNew, onLoad }) {
  const props = { sessions, currentId, onNew, onLoad }
  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:flex flex-col w-[240px] flex-shrink-0 h-full border-r border-white/[.07] bg-[#111]">
        <Inner {...props} />
      </aside>
      {/* Mobile drawer */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[250px] flex flex-col
        bg-[#111] border-r border-white/[.07] transition-transform duration-300 lg:hidden
        ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="absolute top-3 right-3">
          <button onClick={onClose} className="p-1.5 text-white/40 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
        <Inner {...props} onNew={() => { onNew(); onClose() }} onLoad={(id) => { onLoad(id); onClose() }} />
      </aside>
    </>
  )
}