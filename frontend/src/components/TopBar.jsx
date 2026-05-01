// TopBar.jsx — Add SpeakerButton
import { Menu, Plus, Hexagon, Loader2 } from 'lucide-react'
import { SpeakerButton } from './VoiceButton' // STEP 1: Add import

const AGENT_INFO = {
  GeneralAgent:    { label: '🧠 Think',  dot: '#e11d48' },
  CodingAgent:      { label: '⚙ Code',   dot: '#38bdf8' },
  SearchAgent:      { label: '🔍 Search', dot: '#fbbf24' },
  FileAgent:        { label: '📄 File',   dot: '#a78bfa' },
  SmartTutorAgent: { label: '🎓 Tutor',  dot: '#a78bfa' },
  FastChatAgent:    { label: '💬 Chat',   dot: '#4ade80' },
}

// STEP 2: Added panelOpen and onTogglePanel to props
export default function TopBar({ onMenu, agent, intent, streaming, online, onNew, panelOpen, onTogglePanel }) {
  const info = AGENT_INFO[agent] || null

  return (
    <header className="flex items-center justify-between h-[52px] px-4 flex-shrink-0
      border-b border-white/[.07] bg-[#0f0f0f]/80 backdrop-blur-md z-10">

      <div className="flex items-center gap-3">
        <button onClick={onMenu} className="p-1.5 text-white/40 hover:text-white transition-colors lg:hidden">
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2 select-none">
          <Hexagon size={17} className="text-rose-500" />
          <span className="font-semibold text-[15px]">RUBRA</span>
        </div>
      </div>

      {/* Center — mode badge */}
      <div className="flex items-center">
        {streaming && info ? (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[.04] text-xs">
            <Loader2 size={11} className="animate-spin" style={{color: info.dot}} />
            <span className="text-white/50">{info.label}</span>
          </div>
        ) : info && !streaming ? (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[.04] text-xs">
            <span className="w-1.5 h-1.5 rounded-full" style={{background: info.dot}} />
            <span className="text-white/40">{info.label}</span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {/* Backend status */}
        {online === false && (
          <a
            href="https://huggingface.co/spaces"
            target="_blank"
            rel="noopener noreferrer"
            title="Backend offline — Click to check HuggingFace Space, or set VITE_API_URL in Vercel"
            className="flex items-center gap-1.5 text-xs text-rose-400 px-2.5 py-1 rounded-md
              bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/15 transition-colors cursor-pointer">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <span className="hidden sm:inline">Backend offline</span>
          </a>
        )}
        {online === true && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="hidden sm:inline">Connected</span>
          </div>
        )}
        {online === null && (
          <div className="flex items-center gap-1.5 text-xs text-white/30">
            <Loader2 size={11} className="animate-spin" />
            <span className="hidden sm:inline">Connecting...</span>
          </div>
        )}

        {/* STEP 3: Place SpeakerButton in action area */}
        <div className="flex items-center gap-1">
          <SpeakerButton />
          
          <button onClick={onNew} className="p-1.5 text-white/40 hover:text-white transition-colors" title="New chat">
            <Plus size={17} />
          </button>
        </div>
      </div>
    </header>
  )
}
