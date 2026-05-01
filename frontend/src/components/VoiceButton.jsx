// frontend/src/components/VoiceButton.jsx — REPLACE ENTIRE FILE

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Volume2, VolumeX, Square } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:7860'

// ══════════════════════════════════════════════════════
//  RUBRA VOICE ENGINE
//  Voice profile cloned from uploaded sample:
//    Pitch:   228 Hz (Soprano Female)
//    Timbre:  2287 Hz (Bright/Clear)
//    Pace:    2.9 syl/s (Calm, measured)
//    Style:   Expressive (StdDev 56.8 Hz)
//  Primary:  Edge TTS → en-US-AriaNeural
//  Fallback: Web Speech API (tuned params)
// ══════════════════════════════════════════════════════
class RubraVoiceEngine {
  constructor() {
    this.audioCtx   = null
    this.currentSrc = null
    this.queue      = []
    this.playing    = false
    this.enabled    = true
    this.onStart    = null
    this.onEnd      = null
  }

  _init() {
    if (!this.audioCtx)
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume()
  }

  _clean(text) {
    return text
      .replace(/```[\s\S]*?```/g, 'code block.')
      .replace(/`[^`]*`/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/#+\s+(.*)/g, '$1.')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/[<>]/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim()
  }

  _chunk(text, max = 480) {
    const sentences = text.match(/[^.!?؟।]+[.!?؟।]+/g) || [text]
    const out = []; let cur = ''
    for (const s of sentences) {
      if ((cur + s).length > max) { if (cur) out.push(cur.trim()); cur = s }
      else cur += ' ' + s
    }
    if (cur.trim()) out.push(cur.trim())
    return out.length ? out : [text.slice(0, max)]
  }

  speak(text, lang = 'en') {
    if (!this.enabled || !text?.trim()) return
    this._init()
    const clean = this._clean(text)
    if (!clean) return
    for (const chunk of this._chunk(clean)) this.queue.push({ text: chunk, lang })
    if (!this.playing) this._next()
  }

  async _next() {
    if (!this.queue.length) { this.playing = false; this.onEnd?.(); return }
    this.playing = true
    const { text, lang } = this.queue.shift()
    try {
      const res = await fetch(`${API_BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang }),
        signal: AbortSignal.timeout(14000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { audio_b64, error } = await res.json()
      if (error) throw new Error(error)

      const raw = atob(audio_b64)
      const buf = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i)

      const audioBuf = await this.audioCtx.decodeAudioData(buf.buffer)
      this.currentSrc = this.audioCtx.createBufferSource()
      this.currentSrc.buffer = audioBuf
      // playbackRate 1.04 adds ~10Hz pitch → matches 228Hz target from ~220Hz default
      this.currentSrc.playbackRate.value = 1.04
      this.currentSrc.connect(this.audioCtx.destination)
      this.onStart?.()
      this.currentSrc.start(0)
      this.currentSrc.onended = () => { this.currentSrc = null; this._next() }
    } catch (e) {
      console.warn('Edge TTS → fallback:', e.message)
      this._fallback(text, lang)
    }
  }

  _fallback(text, lang) {
    const synth = window.speechSynthesis
    if (!synth) { this._next(); return }
    synth.cancel()
    const ready = (cb) => {
      const v = synth.getVoices()
      if (v.length) cb(v)
      else synth.onvoiceschanged = () => cb(synth.getVoices())
    }
    ready((voices) => {
      const utt = new SpeechSynthesisUtterance(text)
      // Priority voices matching soprano/bright/clear profile
      const WANT = [
        'Microsoft Aria Online (Natural)', 'Microsoft Aria',
        'Microsoft Jenny Online (Natural)', 'Microsoft Jenny',
        'Google UK English Female',
        'Samantha', 'Karen', 'Tessa', 'Moira',
        'Aria', 'Jenny', 'Zira',
      ]
      let voice = null
      for (const n of WANT) {
        voice = voices.find(v => v.name.includes(n))
        if (voice) break
      }
      if (!voice)
        voice = voices.find(v => v.lang?.startsWith(lang === 'bn' ? 'bn' : 'en'))
      if (voice) utt.voice = voice
      utt.lang   = lang === 'bn' ? 'bn-BD' : 'en-US'
      utt.pitch  = 1.15  // → 228Hz soprano
      utt.rate   = 0.92  // → 2.9 syl/s calm pace
      utt.volume = 1.0
      utt.onend = utt.onerror = () => this._next()
      this.onStart?.()
      synth.speak(utt)
    })
  }

  stop() {
    this.queue = []; this.playing = false
    try { this.currentSrc?.stop() } catch {}
    this.currentSrc = null
    window.speechSynthesis?.cancel()
    this.onEnd?.()
  }

  setEnabled(v) { this.enabled = v; if (!v) this.stop() }
}

// ══════════════════════════════════════════════════════
//  RUBRA EAR — Speech Recognition
// ══════════════════════════════════════════════════════
class RubraEar {
  constructor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    this.supported = !!SR
    if (this.supported) {
      this.rec = new SR()
      this.rec.continuous = false
      this.rec.interimResults = true
    }
  }

  listen(lang, onInterim, onFinal, onDone) {
    if (!this.supported) { onDone?.('unsupported'); return null }
    this.rec.lang = lang === 'bn' ? 'bn-BD' : 'en-US'
    this.rec.onresult = (e) => {
      const r = e.results[e.results.length - 1]
      const t = r[0].transcript
      if (r.isFinal) { onFinal?.(t); onDone?.() }
      else onInterim?.(t)
    }
    this.rec.onerror = (e) => onDone?.(e.error)
    this.rec.onend   = () => onDone?.()
    try { this.rec.start() } catch {}
    return () => { try { this.rec.abort() } catch {} }
  }
}

// ── Singletons ─────────────────────────────────────────
export const rubraVoice = new RubraVoiceEngine()
export const rubraEar   = new RubraEar()

// ══════════════════════════════════════════════════════
//  VoiceButton Component — Mic input
// ══════════════════════════════════════════════════════
export default function VoiceButton({ onTranscript, lang = 'en', disabled = false }) {
  const [listening, setListening] = useState(false)
  const [interim,   setInterim]   = useState('')
  const stopRef = useRef(null)

  const start = useCallback(() => {
    if (listening || disabled) return
    rubraVoice.stop()
    setListening(true); setInterim('')
    stopRef.current = rubraEar.listen(lang,
      (t) => setInterim(t),
      (t) => onTranscript?.(t),
      ()  => { setListening(false); setInterim('') }
    )
  }, [listening, disabled, lang, onTranscript])

  const stop = useCallback(() => {
    stopRef.current?.(); setListening(false); setInterim('')
  }, [])

  if (!rubraEar.supported) return null

  return (
    <div className="relative">
      <AnimatePresence>
        {interim && (
          <motion.div
            initial={{ opacity:0, y:6, scale:0.9 }}
            animate={{ opacity:1, y:0, scale:1 }}
            exit={{ opacity:0, y:6, scale:0.9 }}
            className="absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-xl
              text-[11.5px] max-w-[220px] text-right"
            style={{
              background: 'rgba(225,29,72,0.12)',
              border:     '1px solid rgba(225,29,72,0.25)',
              color:      'rgba(255,255,255,0.75)',
              whiteSpace: 'nowrap', overflow:'hidden', textOverflow:'ellipsis'
            }}
          >{interim}</motion.div>
        )}
      </AnimatePresence>
      <motion.button
        onClick={listening ? stop : start}
        whileHover={{ scale:1.08 }} whileTap={{ scale:0.93 }}
        disabled={disabled}
        title={listening ? 'Stop' : 'Voice input'}
        className="w-8 h-8 rounded-lg flex items-center justify-center relative transition-all"
        style={{
          background: listening ? 'rgba(225,29,72,0.15)' : 'transparent',
          color:      listening ? '#fb7185' : 'rgba(255,255,255,0.3)',
          border:     listening ? '1px solid rgba(225,29,72,0.3)' : '1px solid transparent',
          opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {listening ? <MicOff size={14}/> : <Mic size={14}/>}
        {listening && (
          <motion.span className="absolute inset-0 rounded-lg pointer-events-none"
            style={{ border:'2px solid rgba(225,29,72,0.5)' }}
            animate={{ scale:[1,1.5,1], opacity:[0.6,0,0.6] }}
            transition={{ repeat:Infinity, duration:1.4 }}
          />
        )}
      </motion.button>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  SpeakerButton Component — TTS toggle
// ══════════════════════════════════════════════════════
export function SpeakerButton({ className = '' }) {
  const [enabled,  setEnabled]  = useState(true)
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    rubraVoice.onStart = () => setSpeaking(true)
    rubraVoice.onEnd   = () => setSpeaking(false)
    return () => { rubraVoice.onStart = null; rubraVoice.onEnd = null }
  }, [])

  const handle = () => {
    if (speaking) { rubraVoice.stop(); setSpeaking(false) }
    else { const n = !enabled; setEnabled(n); rubraVoice.setEnabled(n) }
  }

  return (
    <motion.button onClick={handle}
      whileHover={{ scale:1.08 }} whileTap={{ scale:0.93 }}
      className={`w-8 h-8 rounded-lg flex items-center justify-center relative transition-all ${className}`}
      style={{
        background: speaking ? 'rgba(56,189,248,0.12)' : 'transparent',
        color:      !enabled  ? 'rgba(255,255,255,0.15)' : speaking ? '#38bdf8' : 'rgba(255,255,255,0.3)',
        border:     speaking  ? '1px solid rgba(56,189,248,0.25)' : '1px solid transparent',
      }}
      title={speaking ? 'Stop speaking' : enabled ? 'Voice on' : 'Voice off'}
    >
      {!enabled ? <VolumeX size={14}/> : speaking ? <Square size={12}/> : <Volume2 size={14}/>}
      {speaking && (
        <div className="absolute -right-1 -top-1 flex gap-[1.5px] items-end h-3 pointer-events-none">
          {[0,1,2].map(i => (
            <motion.div key={i} className="w-[2px] rounded-full bg-sky-400"
              animate={{ height:['2px','7px','2px'] }}
              transition={{ repeat:Infinity, duration:0.55, delay:i*0.13 }}
            />
          ))}
        </div>
      )}
    </motion.button>
  )
}
