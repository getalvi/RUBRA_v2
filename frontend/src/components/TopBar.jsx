import { Menu, Plus, Loader2 } from 'lucide-react'

const AGENT_INFO = {
  HermesCodeAgent: { label:'⚙ Hermes Code', dot:'#38bdf8' },
  code:             { label:'⚙ Hermes Code', dot:'#38bdf8' },
  GeneralAgent:     { label:'🧠 Think',      dot:'#e11d48' },
  general:          { label:'🧠 Think',      dot:'#e11d48' },
  SearchAgent:      { label:'🔍 Search',     dot:'#fbbf24' },
  search:           { label:'🔍 Live Search',dot:'#fbbf24' },
  FileAgent:        { label:'📄 File',       dot:'#a78bfa' },
  file:             { label:'📄 File',       dot:'#a78bfa' },
  VisionAgent:      { label:'👁 Vision',     dot:'#34d399' },
  vision:           { label:'👁 Vision',     dot:'#34d399' },
  SmartTutor:       { label:'📚 Smart Tutor',dot:'#c084fc' },
  tutor:            { label:'📚 Smart Tutor',dot:'#c084fc' },
  ExamAgent:        { label:'🎓 Exam',       dot:'#fb7185' },
  exam:             { label:'🎓 Exam',       dot:'#fb7185' },
  fast:             { label:'💬 Chat',       dot:'#4ade80' },
  FastChatAgent:    { label:'💬 Chat',       dot:'#4ade80' },
}

const MODE_LABELS = {
  code:   '⚙ Code Mode',
  search: '🔍 Search Mode',
  tutor:  '📚 Tutor Mode',
  exam:   '🎓 Exam Mode',
}

export default function TopBar({ onMenu, agent, intent, streaming, online, onNew, appMode }) {
  const info   = AGENT_INFO[agent] || AGENT_INFO[intent] || null
  const modeLabel = MODE_LABELS[appMode]

  return (
    <header className="flex items-center justify-between h-[52px] px-4 flex-shrink-0
      border-b border-white/[.07] bg-[#0f0f0f]/80 backdrop-blur-md z-10">
      <div className="flex items-center gap-3">
        <button onClick={onMenu} className="p-1.5 text-white/40 hover:text-white transition-colors lg:hidden">
          <Menu size={18}/>
        </button>
        <div className="flex items-center gap-2 select-none">
          <span className="text-rose-500 text-lg">⬡</span>
          <span className="font-semibold text-[15px]">RUBRA</span>
          {modeLabel && !streaming && (
            <span className="text-[10.5px] text-white/30 border border-white/[.08] px-2 py-0.5 rounded-full hidden sm:block">
              {modeLabel}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center">
        {streaming && info ? (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[.04] text-xs">
            <Loader2 size={11} className="animate-spin" style={{color:info.dot}}/>
            <span className="text-white/50">{info.label}</span>
          </div>
        ) : info && !streaming ? (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[.04] text-xs">
            <span className="w-1.5 h-1.5 rounded-full" style={{background:info.dot}}/>
            <span className="text-white/40">{info.label}</span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {online === false && (
          <span className="text-xs text-rose-400 px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/20 hidden sm:block">
            Backend offline
          </span>
        )}
        {online === true && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse hidden sm:block"/>
        )}
        <button onClick={onNew} className="p-1.5 text-white/40 hover:text-white transition-colors" title="New chat">
          <Plus size={17}/>
        </button>
      </div>
    </header>
  )
}