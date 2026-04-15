import { useEffect, useRef } from 'react'
import Message from './Message'
import { Hexagon } from 'lucide-react'

const STARTERS = [
  { icon:'🌤', title:'Live weather',       desc:'Real-time any city',           q:"What's the weather in Dhaka right now?" },
  { icon:'🧑‍💻', title:'Write Python code', desc:'Hermes Coding Engine',          q:'Write a complete async Python web scraper with retry logic and JSON output' },
  { icon:'📚', title:'Smart Tutor',        desc:'SSC/HSC/JSC help',             q:'SSC Physics er first chapter ta explain koro bangla te' },
  { icon:'🧮', title:'Math solve koro',    desc:'Step by step',                  q:'Class 10 math: solve x² + 5x + 6 = 0 step by step explanation diyao' },
  { icon:'₿',  title:'Crypto prices',     desc:'Live BTC, ETH & more',         q:'Current Bitcoin, Ethereum, and Solana prices?' },
  { icon:'🖼', title:'Image/PDF reading', desc:'Upload question paper',          q:null, isUpload:true },
  { icon:'📝', title:'Question paper',    desc:'SSC/HSC exam generate',         q:'HSC physics chapter 1 er upor 10 MCQ question paper banao' },
  { icon:'💱', title:'Exchange rates',    desc:'USD, BDT, EUR live',            q:'USD to BDT, EUR, GBP exchange rate today?' },
]

function Welcome({ onSuggest }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-8 text-center fade-in">

      <div className="relative w-20 h-20 mb-5">
        <div className="absolute inset-0 rounded-full border border-rose-500/20 animate-spin" style={{animationDuration:'12s'}}/>
        <div className="absolute inset-3 rounded-full border border-rose-500/30 animate-spin" style={{animationDuration:'8s',animationDirection:'reverse'}}/>
        <div className="absolute inset-6 rounded-full bg-rose-500/10 border border-rose-500/40 flex items-center justify-center">
          <Hexagon size={18} className="text-rose-400"/>
        </div>
      </div>

      <h1 className="text-3xl font-semibold mb-2">Hi, I'm RUBRA</h1>
      <p className="text-[15px] text-white/40 max-w-[440px] mb-2 leading-relaxed">
        Bangla, Banglish, English — যেকোনো ভাষায় কথা বলো।<br/>
        <span className="text-white/30 text-[13px]">Smart Tutor · Vision · Coding · Live Data · Exam Generator</span>
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full max-w-[680px] mb-4">
        {STARTERS.map(s => (
          <button key={s.title}
            onClick={() => s.q && onSuggest(s.q)}
            disabled={s.isUpload}
            className={`flex flex-col gap-2 p-3 rounded-xl text-left border border-white/[.07] bg-white/[.03] transition-all
              ${!s.isUpload ? 'hover:bg-white/[.07] hover:border-white/[.13] hover:-translate-y-0.5 cursor-pointer' : 'opacity-40 cursor-default'}`}>
            <span className="text-xl">{s.icon}</span>
            <div>
              <p className="text-[12.5px] font-medium text-white/80">{s.title}</p>
              <p className="text-[11px] text-white/30 mt-0.5">{s.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 justify-center text-[11px] text-white/20">
        <span>📎 Image/PDF upload</span>
        <span>·</span>
        <span>🎓 Tutor mode বাংলায়</span>
        <span>·</span>
        <span>⚙ Hermes coding engine</span>
        <span>·</span>
        <span>📝 Exam generator</span>
      </div>
    </div>
  )
}

export function ToolBadge({ tool }) {
  if (!tool) return null
  const icons = { weather:'🌤', crypto:'₿', currency:'💱', wikipedia:'📖', arxiv:'🔬', books:'📚', file:'📄', image:'🖼' }
  return (
    <div className="mx-4 sm:mx-6 my-1 inline-flex items-center gap-2 px-3 py-1.5
      rounded-lg bg-amber-500/06 border border-amber-500/12 text-xs text-amber-400/70 fade-in">
      <span>{icons[tool.tool] || '🔧'}</span>
      <span>Retrieved {tool.tool} data</span>
      {tool.title && <span className="text-white/20">— {tool.title.slice(0,30)}</span>}
    </div>
  )
}

export default function ChatArea({ messages, streaming, toolResult, onEdit, onSuggest }) {
  const bottomRef = useRef()
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.length === 0 ? (
        <div className="flex flex-col h-full"><Welcome onSuggest={onSuggest}/></div>
      ) : (
        <div className="py-4 max-w-4xl mx-auto w-full">
          {messages.map((msg, i) => {
            const isLast = i === messages.length-1 && msg.role==='assistant'
            return (
              <div key={msg.id}>
                {isLast && toolResult && <ToolBadge tool={toolResult}/>}
                <Message msg={msg} isStreaming={isLast && streaming} onEdit={msg.role==='user' ? onEdit : null}/>
              </div>
            )
          })}
          <div ref={bottomRef} className="h-4"/>
        </div>
      )}
    </div>
  )
}