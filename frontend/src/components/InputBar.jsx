// InputBar.jsx — Voice integration patch
import VoiceButton from './VoiceButton'
import { useState, useRef, useCallback } from 'react'
import { Send, Square, Paperclip, Code2, Search, FileText, Zap, GraduationCap, X, Image } from 'lucide-react'

const TASK_BTNS = [
  { id: null,      icon: Zap,           label: 'Auto',   desc: 'RUBRA picks best agent',        cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' },
  { id: 'code',    icon: Code2,          label: 'Code',   desc: 'Hermes Coding Engine',           cls: 'text-sky-400 bg-sky-500/10 border-sky-500/25' },
  { id: 'search', icon: Search,         label: 'Search', desc: 'Live data: weather, crypto, ...',cls: 'text-amber-400 bg-amber-500/10 border-amber-500/25' },
  { id: 'tutor',   icon: GraduationCap,  label: 'Tutor',  desc: 'Smart Tutor — Bangladesh curriculum', cls: 'text-violet-400 bg-violet-500/10 border-violet-500/25' },
  { id: 'file',    icon: FileText,       label: 'File',   desc: 'PDF, Excel, CSV, DOCX, Image',   cls: 'text-rose-400 bg-rose-500/10 border-rose-500/25' },
]

const ACCEPT_ALL = ".pdf,.xlsx,.xls,.csv,.docx,.doc,.txt,.md,.py,.js,.ts,.jsx,.tsx,.java,.go,.rs,.json,.yaml,.sh,.cpp,.c,.html,.css,.jpg,.jpeg,.png,.gif,.webp,.bmp"

// STEP 2: Add lang prop to the function arguments
export default function InputBar({ onSend, onFile, onStop, streaming, disabled, lang = 'en' }) {
  const [text, setText]   = useState('')
  const [task, setTask]   = useState(null)
  const [file, setFile]   = useState(null)
  const [fileQ, setFileQ] = useState('')
  const [drag, setDrag]   = useState(false)
  const taRef    = useRef()
  const fileRef = useRef()

  const grow = () => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }

  // STEP 3: Add onTranscript handler
  const handleVoiceTranscript = useCallback((transcript) => {
    setText(prev => prev ? prev + ' ' + transcript : transcript)
    if (taRef.current) {
      taRef.current.style.height = 'auto'
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 180) + 'px'
      taRef.current.focus()
    }
  }, [])

  const submit = useCallback(() => {
    if (disabled || streaming) return
    if (file) {
      onFile(file, fileQ || text.trim(), task === 'tutor' ? 'tutor' : '')
      setFile(null); setFileQ(''); setText('')
      if (taRef.current) taRef.current.style.height = 'auto'
      return
    }
    const msg = text.trim()
    if (!msg) return
    onSend(msg, task)
    setText('')
    if (taRef.current) taRef.current.style.height = 'auto'
  }, [disabled, streaming, file, fileQ, text, onSend, onFile, task])

  const handleFile = (f) => {
    if (!f) return
    if (f.size > 25 * 1024 * 1024) { alert('Max 25MB'); return }
    setFile(f); setDrag(false)
  }

  const isImage = file && /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.name)
  const activeTask = TASK_BTNS.find(t => t.id === task) || TASK_BTNS[0]

  return (
    <div className="flex-shrink-0 bg-[#0f0f0f] border-t border-white/[.06] px-3 sm:px-6 pb-4 pt-2">
      <div className="max-w-3xl mx-auto">

        {/* Task buttons */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {TASK_BTNS.map(btn => {
            const Icon = btn.icon
            const isActive = btn.id === task
            return (
              <button key={btn.label}
                onClick={() => setTask(isActive && btn.id !== null ? null : btn.id)}
                title={btn.desc}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all
                  ${isActive ? btn.cls : 'border-white/[.07] text-white/30 hover:text-white/60 hover:border-white/[.12]'}`}>
                <Icon size={11} />
                {btn.label}
              </button>
            )
          })}
        </div>

        {/* File preview */}
        {file && (
          <div className="mb-2 flex items-center gap-3 px-3.5 py-2.5 rounded-xl
            bg-violet-500/08 border border-violet-500/20 fade-in">
            {isImage ? <Image size={14} className="text-violet-400 flex-shrink-0"/> : <FileText size={14} className="text-violet-400 flex-shrink-0"/>}
            <div className="min-w-0">
              <p className="text-xs text-violet-300 font-medium truncate">{file.name}</p>
              <p className="text-[10px] text-white/30">{(file.size/1024).toFixed(1)} KB · {isImage ? 'Image' : 'Document'}</p>
            </div>
            <input value={fileQ} onChange={e => setFileQ(e.target.value)}
              placeholder={task === 'tutor' ? "কী জানতে চাও? (optional)" : "Question about this file... (optional)"}
              className="flex-1 min-w-0 bg-transparent text-[13px] text-white/70 placeholder-white/25 outline-none" />
            <button onClick={() => setFile(null)} className="text-white/30 hover:text-white/60 transition-colors ml-1 flex-shrink-0">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Input box */}
        <div
          className={`flex flex-col rounded-2xl border transition-all
            ${drag ? 'border-rose-500/40 bg-rose-500/04' : 'border-white/[.09] bg-white/[.04]'}
            ${disabled ? 'opacity-40' : ''}
            focus-within:border-white/[.15] focus-within:shadow-[0_0_0_1px_rgba(225,29,72,.10)]`}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]) }}>

          <textarea ref={taRef} value={text}
            onChange={e => { setText(e.target.value); grow() }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder={
              file      ? 'Ask about this file... (or press Send)' :
              drag      ? 'Drop file here...' :
              disabled ? 'Start backend: python app.py' :
              task==='tutor' ? 'তোমার question লেখো বাংলায় বা English এ...' :
              task==='code'  ? 'Describe what to build or paste code to debug...' :
                               'Ask RUBRA anything — weather, code, study help, research...'
            }
            disabled={disabled}
            rows={1}
            className="w-full bg-transparent px-4 pt-3.5 pb-2 text-[14.5px] text-white/90
              placeholder-white/25 outline-none leading-relaxed max-h-[180px] overflow-y-auto"/>

          <div className="flex items-center justify-between px-3 pb-2.5">
            <div className="flex items-center gap-1">
              <button onClick={() => fileRef.current?.click()} disabled={disabled}
                title="Attach file or image (PDF, Excel, CSV, DOCX, JPG, PNG)"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/28
                  hover:text-white/60 hover:bg-white/[.06] transition-all disabled:opacity-30">
                <Paperclip size={15}/>
              </button>
              
              {/* STEP 4: Added VoiceButton right after the Paperclip button */}
              <VoiceButton 
                onTranscript={handleVoiceTranscript}
                lang={lang}
                disabled={disabled}
              />

              <input ref={fileRef} type="file" className="hidden" accept={ACCEPT_ALL}
                onChange={e => handleFile(e.target.files?.[0])}/>
            </div>

            {streaming ? (
              <button onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium
                  bg-white/[.07] hover:bg-white/[.12] text-white/55 hover:text-white border border-white/[.07] transition-all">
                <Square size={11}/> Stop
              </button>
            ) : (
              <button onClick={submit}
                disabled={disabled || (!text.trim() && !file)}
                className="w-8 h-8 rounded-xl flex items-center justify-center bg-rose-500
                  hover:bg-rose-600 text-white disabled:opacity-25 disabled:cursor-not-allowed
                  transition-all hover:scale-105 active:scale-95 shadow-[0_0_12px_rgba(225,29,72,.2)]">
                <Send size={14}/>
              </button>
            )}
          </div>
        </div>

        <p className="text-[11px] text-white/18 text-center mt-2">
          {activeTask.desc} · Bangla/English/Banglish সব ভাষায় কথা বলো · Drag & drop files & images
        </p>
      </div>
    </div>
  )
}
