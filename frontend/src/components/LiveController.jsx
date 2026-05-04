// frontend/src/components/LiveController.jsx — REPLACE ENTIRE FILE

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, X, Volume2, VolumeX } from 'lucide-react'

// ── WebSocket URL builder ───────────────────────────────
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:7860'
const WS_BASE = API_URL.startsWith('https')
  ? API_URL.replace('https://', 'wss://')
  : API_URL.replace('http://', 'ws://')

// ══════════════════════════════════════════════════════
//  AUDIO PROCESSOR with VAD
//  Gemini pattern: mic always on, silence triggers send
// ══════════════════════════════════════════════════════
class AudioProcessor {
  constructor(onChunk, onSilence) {
    this.onChunk   = onChunk
    this.onSilence = onSilence
    this.mediaRec  = null
    this.stream    = null
    this.active    = false
    this.audioCtx  = null
    this.analyser  = null
    this.vadTimer  = null
    this.silenceMs = 0
    this.hasSpeech = false        // track if any speech happened
    this.SILENCE_MS   = 1500      // 1.5s silence → send
    this.ENERGY_MIN   = 6         // RMS threshold
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000, channelCount: 1,
        echoCancellation: true, noiseSuppression: true, autoGainControl: true
      }
    })

    // VAD setup
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
    const source  = this.audioCtx.createMediaStreamSource(this.stream)
    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 512
    source.connect(this.analyser)

    // Recorder
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm'
    this.mediaRec = new MediaRecorder(this.stream, { mimeType: mime })
    this.active = true

    this.mediaRec.ondataavailable = async (e) => {
      if (!this.active || e.data.size < 50) return
      const buf = await e.data.arrayBuffer()
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
      this.onChunk(b64)
    }
    this.mediaRec.start(300) // chunk every 300ms

    // VAD loop
    const freqData = new Uint8Array(this.analyser.frequencyBinCount)
    this.vadTimer  = setInterval(() => {
      if (!this.active) return
      this.analyser.getByteFrequencyData(freqData)
      const rms = Math.sqrt(freqData.reduce((s, v) => s + v * v, 0) / freqData.length)

      if (rms >= this.ENERGY_MIN) {
        this.silenceMs = 0
        this.hasSpeech = true   // speech detected
      } else {
        this.silenceMs += 100
        // Only trigger if speech was actually detected
        if (this.hasSpeech && this.silenceMs >= this.SILENCE_MS) {
          this.hasSpeech = false
          this.silenceMs = 0
          this.onSilence()
        }
      }
    }, 100)
  }

  stop() {
    this.active = false
    clearInterval(this.vadTimer)
    if (this.mediaRec?.state === 'recording') this.mediaRec.stop()
    this.stream?.getTracks().forEach(t => t.stop())
    try { this.audioCtx?.close() } catch {}
  }
}

// ══════════════════════════════════════════════════════
//  VISION PROCESSOR
// ══════════════════════════════════════════════════════
class VisionProcessor {
  constructor(onFrame) {
    this.onFrame = onFrame
    this.stream  = null
    this.timer   = null
    this.canvas  = document.createElement('canvas')
    this.ctx2d   = this.canvas.getContext('2d')
    this.video   = document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true
  }
  async startCamera() {
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
    this._capture()
  }
  async startScreen() {
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
    this._capture()
    this.stream.getVideoTracks()[0].onended = () => this.stop()
  }
  _capture() {
    this.video.srcObject = this.stream
    this.video.play()
    this.timer = setInterval(() => {
      if (!this.video.videoWidth) return
      this.canvas.width  = 480
      this.canvas.height = Math.round(480 * this.video.videoHeight / this.video.videoWidth)
      this.ctx2d.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
      this.onFrame(this.canvas.toDataURL('image/jpeg', 0.55))
    }, 1500)
  }
  getStream() { return this.stream }
  stop() {
    clearInterval(this.timer)
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
  }
}

// ══════════════════════════════════════════════════════
//  STREAMING AUDIO PLAYER
// ══════════════════════════════════════════════════════
class StreamingPlayer {
  constructor() {
    this.ctx     = null
    this.queue   = []
    this.playing = false
    this.enabled = true
  }

  _init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (this.ctx.state === 'suspended') this.ctx.resume()
  }

  async play(b64) {
    if (!this.enabled || !b64) return
    this._init()
    try {
      const bin  = atob(b64)
      const buf  = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
      const ab   = buf.buffer.slice(0)         // clone before passing
      const abuf = await this.ctx.decodeAudioData(ab)
      this.queue.push(abuf)
      if (!this.playing) this._next()
    } catch (e) {
      console.warn('TTS audio decode:', e.message)
    }
  }

  _next() {
    if (!this.queue.length || !this.enabled) { this.playing = false; return }
    this.playing = true
    const src = this.ctx.createBufferSource()
    src.buffer = this.queue.shift()
    src.connect(this.ctx.destination)
    src.start(0)
    src.onended = () => this._next()
  }

  // Fallback: Web Speech API
  speakFallback(text) {
    if (!this.enabled || !text) return
    const synth = window.speechSynthesis
    synth.cancel()
    const utt   = new SpeechSynthesisUtterance(text)
    const waitV = (cb) => {
      const v = synth.getVoices()
      if (v.length) cb(v)
      else synth.onvoiceschanged = () => cb(synth.getVoices())
    }
    waitV((voices) => {
      const want = ['Microsoft Aria Online', 'Microsoft Jenny Online',
                    'Google UK English Female', 'Samantha', 'Karen', 'Aria', 'Jenny']
      let voice = null
      for (const n of want) {
        voice = voices.find(v => v.name.includes(n))
        if (voice) break
      }
      if (voice) utt.voice = voice
      utt.pitch = 1.15; utt.rate = 0.92; utt.volume = 1
      synth.speak(utt)
    })
  }

  stop() {
    this.queue   = []
    this.playing = false
    window.speechSynthesis?.cancel()
  }

  setEnabled(v) { this.enabled = v; if (!v) this.stop() }
}

// ══════════════════════════════════════════════════════
//  useRubraLive HOOK
// ══════════════════════════════════════════════════════
function useRubraLive(sessionId, { onTranscript, onToken, onStatus, onAddMessage }) {
  const ws         = useRef(null)
  const audioProc  = useRef(null)
  const visionProc = useRef(null)
  const player     = useRef(new StreamingPlayer())
  const reconnT    = useRef(null)
  const retries    = useRef(0)
  const fullResp   = useRef('')   // accumulate full response

  const [connected,   setConnected]   = useState(false)
  const [listening,   setListening]   = useState(false)
  const [speaking,    setSpeaking]    = useState(false)
  const [visionMode,  setVisionMode]  = useState(null)
  const [videoStream, setVideoStream] = useState(null)

  const send = useCallback((data) => {
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify(data))
  }, [])

  // ── Connect ─────────────────────────────────────────
  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return
    const url  = `${WS_BASE}/ws/live/${sessionId}`
    const sock = new WebSocket(url)
    ws.current = sock

    sock.onopen = () => {
      setConnected(true)
      onStatus('ready')
      retries.current = 0
      clearTimeout(reconnT.current)
    }

    sock.onclose = (e) => {
      setConnected(false); setListening(false); setSpeaking(false)
      onStatus('disconnected')
      if (e.code !== 1000 && retries.current < 3) {
        retries.current++
        reconnT.current = setTimeout(connect, 2000 * retries.current)
      }
    }

    sock.onerror = () => { onStatus('error') }

    sock.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        switch (msg.type) {
          case 'ready':
            onStatus('ready')
            break

          case 'thinking':
            onStatus('thinking')
            fullResp.current = ''
            break

          // ── Transcript: user's speech → show in chat ──
          case 'transcript':
            onTranscript(msg.text)
            // Add user message to chat immediately
            onAddMessage({ role: 'user', content: msg.text, fromLive: true })
            break

          // ── Token: RUBRA's response streaming ──────────
          case 'token':
            fullResp.current += msg.content
            onToken(msg.content)
            setSpeaking(true)
            break

          // ── TTS audio chunk ────────────────────────────
          case 'tts_chunk':
            player.current.play(msg.audio_b64)
            break

          // ── TTS fallback text ──────────────────────────
          case 'tts_text':
            player.current.speakFallback(msg.text)
            break

          case 'interrupted':
            player.current.stop()
            setSpeaking(false)
            break

          // ── Response complete: add to chat ─────────────
          case 'done':
            setSpeaking(false)
            onStatus('ready')
            if (fullResp.current.trim()) {
              onAddMessage({ role: 'assistant', content: fullResp.current, fromLive: true })
              fullResp.current = ''
            }
            break

          case 'error':
            onStatus('error')
            console.error('Live error:', msg.message)
            break

          case 'pong': break
        }
      } catch (err) {
        console.warn('WS parse error:', err)
      }
    }
  }, [sessionId, onStatus, onTranscript, onToken, onAddMessage])

  // ── Disconnect ───────────────────────────────────────
  const disconnect = useCallback(() => {
    clearTimeout(reconnT.current)
    retries.current = 3 // prevent reconnect
    send({ type: 'stop' })
    ws.current?.close(1000)
    audioProc.current?.stop()
    visionProc.current?.stop()
    player.current.stop()
    setConnected(false); setListening(false); setSpeaking(false)
    setVisionMode(null); setVideoStream(null)
  }, [send])

  // ── Mic (VAD-based: always listening) ────────────────
  const startMic = useCallback(async () => {
    if (!connected || listening) return
    if (speaking) { send({ type: 'interrupt' }); player.current.stop() }
    try {
      const proc = new AudioProcessor(
        // audio chunk → backend
        (b64) => send({ type: 'audio_chunk', data: b64 }),
        // VAD silence → trigger transcription
        () => send({ type: 'audio_end' })
      )
      await proc.start()
      audioProc.current = proc
      setListening(true)
    } catch (err) {
      onStatus(`Mic denied: ${err.message}`)
    }
  }, [connected, listening, speaking, send, onStatus])

  const stopMic = useCallback(() => {
    audioProc.current?.stop()
    audioProc.current = null
    setListening(false)
  }, [])

  // ── Send typed text ──────────────────────────────────
  const sendText = useCallback((text) => {
    if (!connected || !text.trim()) return
    if (speaking) { send({ type: 'interrupt' }); player.current.stop() }
    send({ type: 'text', text })
  }, [connected, speaking, send])

  // ── Camera ───────────────────────────────────────────
  const startCamera = useCallback(async () => {
    visionProc.current?.stop()
    try {
      const proc = new VisionProcessor((url) => send({ type: 'frame', data: url }))
      await proc.startCamera()
      visionProc.current = proc
      setVisionMode('camera')
      setVideoStream(proc.getStream())
    } catch (err) { onStatus(`Camera: ${err.message}`) }
  }, [send, onStatus])

  // ── Screen ───────────────────────────────────────────
  const startScreen = useCallback(async () => {
    visionProc.current?.stop()
    try {
      const proc = new VisionProcessor((url) => send({ type: 'frame', data: url }))
      await proc.startScreen()
      visionProc.current = proc
      setVisionMode('screen')
      proc.getStream()?.getVideoTracks()[0]?.addEventListener('ended', () => {
        setVisionMode(null)
        send({ type: 'frame_clear' })
      })
    } catch (err) { onStatus(`Screen: ${err.message}`) }
  }, [send, onStatus])

  const stopVision = useCallback(() => {
    visionProc.current?.stop()
    visionProc.current = null
    send({ type: 'frame_clear' })
    setVisionMode(null)
    setVideoStream(null)
  }, [send])

  // ── Keepalive ping ───────────────────────────────────
  useEffect(() => {
    if (!connected) return
    const t = setInterval(() => send({ type: 'ping' }), 25000)
    return () => clearInterval(t)
  }, [connected, send])

  // ── Cleanup on unmount ───────────────────────────────
  useEffect(() => () => {
    clearTimeout(reconnT.current)
    disconnect()
  }, [])

  return {
    connected, listening, speaking, visionMode, videoStream,
    connect, disconnect, startMic, stopMic, sendText,
    startCamera, startScreen, stopVision,
    toggleAudio: (v) => player.current.setEnabled(v),
  }
}

// ══════════════════════════════════════════════════════
//  LIVE MODAL — Gemini Live Full Screen UI
// ══════════════════════════════════════════════════════
export default function LiveModal({ sessionId, onClose, onAddMessage }) {
  const [status,     setStatus]     = useState('disconnected')
  const [liveTokens, setLiveTokens] = useState('')
  const [transcript, setTranscript] = useState('')
  const [audioOn,    setAudioOn]    = useState(true)
  const videoRef = useRef(null)

  const live = useRubraLive(sessionId, {
    onTranscript:  (t) => { setTranscript(t); setLiveTokens('') },
    onToken:       (t) => setLiveTokens(prev => prev + t),
    onStatus:      (s) => setStatus(s),
    onAddMessage,  // pass through to parent (adds to chat)
  })

  // Attach camera preview
  useEffect(() => {
    if (videoRef.current && live.videoStream) {
      videoRef.current.srcObject = live.videoStream
    }
  }, [live.videoStream])

  const isConnected = live.connected

  const statusLabel = isConnected
    ? { ready: 'Listening...', thinking: 'Thinking...', error: 'Error' }[status] || status
    : 'Tap Connect to start'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col select-none"
      style={{ background: '#000' }}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 pt-10 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <rect x="2"  y="16" width="4" height="6" rx="1"
              fill={isConnected ? '#fff' : '#444'}/>
            <rect x="8"  y="11" width="4" height="11" rx="1"
              fill={isConnected ? '#fff' : '#444'}/>
            <rect x="14" y="6"  width="4" height="16" rx="1"
              fill={live.listening ? '#fb7185' : isConnected ? '#fff' : '#444'}/>
            <rect x="20" y="2"  width="4" height="20" rx="1"
              fill={live.speaking ? '#818cf8' : isConnected ? '#888' : '#333'}/>
          </svg>
          <span className="text-white text-[16px] font-medium">Live</span>
          {isConnected && (
            <span className="text-[11px] px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>
              {status === 'thinking' ? '⟳ thinking' : status === 'ready' ? '● ready' : status}
            </span>
          )}
        </div>
        <button onClick={() => { live.disconnect(); onClose() }}
          className="w-9 h-9 flex items-center justify-center rounded-xl"
          style={{ background: 'rgba(255,255,255,0.08)' }}>
          <X size={18} color="rgba(255,255,255,0.7)"/>
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 relative overflow-hidden">

        {/* Camera preview */}
        {live.visionMode === 'camera' && live.videoStream && (
          <motion.div initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }}
            className="absolute top-2 right-4 rounded-2xl overflow-hidden"
            style={{ width:120, height:90, border:'2px solid rgba(255,255,255,0.15)' }}>
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover"/>
          </motion.div>
        )}

        {/* Screen share badge */}
        {live.visionMode === 'screen' && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
            className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full"
            style={{ background:'rgba(99,102,241,0.2)', border:'1px solid rgba(99,102,241,0.35)' }}>
            <Monitor size={11} className="text-indigo-400"/>
            <span className="text-[10px] text-indigo-300">Screen sharing</span>
          </motion.div>
        )}

        {/* ── Orb ── */}
        <div className="relative flex items-center justify-center mb-12">
          {/* Glow rings */}
          {[90, 115, 140].map((size, i) => (
            <motion.div key={i} className="absolute rounded-full"
              style={{
                width: size, height: size,
                background: live.speaking
                  ? `radial-gradient(circle, rgba(99,102,241,${0.14 - i*0.04}) 0%, transparent 70%)`
                  : live.listening
                  ? `radial-gradient(circle, rgba(225,29,72,${0.12 - i*0.03}) 0%, transparent 70%)`
                  : `radial-gradient(circle, rgba(255,255,255,${0.04 - i*0.01}) 0%, transparent 70%)`,
              }}
              animate={
                live.speaking ? { scale:[1, 1.18+i*0.05, 1], opacity:[0.5,1,0.5] }
              : live.listening ? { scale:[1, 1.1+i*0.04, 1], opacity:[0.4,0.9,0.4] }
              : {}
              }
              transition={{ repeat:Infinity, duration:1.8+i*0.3 }}
            />
          ))}

          {/* Core orb */}
          <motion.div
            className="relative w-20 h-20 rounded-full flex items-center justify-center"
            style={{
              background: live.speaking
                ? 'radial-gradient(circle at 35% 35%, #818cf8, #4338ca)'
                : live.listening
                ? 'radial-gradient(circle at 35% 35%, #fb7185, #be123c)'
                : isConnected
                ? 'radial-gradient(circle at 35% 35%, #2d3748, #111827)'
                : 'radial-gradient(circle at 35% 35%, #1a1a2e, #000)',
              boxShadow: live.speaking
                ? '0 0 50px rgba(99,102,241,0.5)'
                : live.listening
                ? '0 0 50px rgba(225,29,72,0.5)'
                : 'none',
            }}
            animate={(live.speaking || live.listening) ? { scale:[1,1.07,1] } : {}}
            transition={{ repeat:Infinity, duration:1.2 }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24">
              <polygon points="12,2 21,7 21,17 12,22 3,17 3,7"
                fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5"/>
            </svg>
          </motion.div>
        </div>

        {/* Status */}
        <motion.p key={statusLabel} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }}
          className="text-[15px] font-medium mb-4 text-center"
          style={{ color:'rgba(255,255,255,0.7)' }}>
          {statusLabel}
        </motion.p>

        {/* Transcript + Response — shows in Live Modal AND gets added to chat */}
        <div className="w-full max-w-xs text-center space-y-2 min-h-[60px]">
          {transcript && !liveTokens && (
            <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }}
              className="text-[12px]" style={{ color:'rgba(255,255,255,0.35)' }}>
              You: {transcript}
            </motion.p>
          )}
          {liveTokens && (
            <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }}
              className="text-[13.5px] leading-relaxed"
              style={{ color:'rgba(255,255,255,0.85)' }}>
              {liveTokens}
              {live.speaking && (
                <motion.span className="inline-block w-0.5 h-[14px] ml-0.5 bg-indigo-400 align-middle rounded-sm"
                  animate={{ opacity:[1,0] }} transition={{ repeat:Infinity, duration:0.8, ease:'steps(2)' }}/>
              )}
            </motion.p>
          )}
        </div>
      </div>

      {/* ── Bottom controls ── */}
      <div className="flex-shrink-0 pb-12 px-8">
        {!isConnected ? (
          <div className="flex justify-center">
            <motion.button onClick={live.connect}
              whileHover={{ scale:1.04 }} whileTap={{ scale:0.96 }}
              className="px-10 py-3.5 rounded-full text-[15px] font-semibold text-white"
              style={{ background:'linear-gradient(135deg,#e11d48,#be123c)', boxShadow:'0 0 24px rgba(225,29,72,0.4)' }}>
              Connect
            </motion.button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-4">

            {/* Camera */}
            <motion.button
              onClick={live.visionMode === 'camera' ? live.stopVision : live.startCamera}
              whileHover={{ scale:1.06 }} whileTap={{ scale:0.94 }}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: live.visionMode === 'camera' ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.1)',
                border:     live.visionMode === 'camera' ? '1px solid rgba(52,211,153,0.4)' : '1px solid rgba(255,255,255,0.15)',
              }}>
              {live.visionMode === 'camera'
                ? <VideoOff size={22} color="#34d399"/>
                : <Video    size={22} color="rgba(255,255,255,0.7)"/>}
            </motion.button>

            {/* Screen */}
            <motion.button
              onClick={live.visionMode === 'screen' ? live.stopVision : live.startScreen}
              whileHover={{ scale:1.06 }} whileTap={{ scale:0.94 }}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: live.visionMode === 'screen' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.1)',
                border:     live.visionMode === 'screen' ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.15)',
              }}>
              {live.visionMode === 'screen'
                ? <MonitorOff size={22} color="#818cf8"/>
                : <Monitor   size={22} color="rgba(255,255,255,0.7)"/>}
            </motion.button>

            {/* Mic — CENTER, RED, biggest */}
            <motion.button
              onClick={live.listening ? live.stopMic : live.startMic}
              whileHover={{ scale:1.06 }} whileTap={{ scale:0.94 }}
              className="w-16 h-16 rounded-full flex items-center justify-center relative"
              style={{
                background: live.listening ? 'rgba(255,255,255,0.12)' : '#dc2626',
                border:     live.listening ? '1px solid rgba(255,255,255,0.2)' : 'none',
                boxShadow:  !live.listening ? '0 0 24px rgba(220,38,38,0.45)' : 'none',
              }}>
              {live.listening
                ? <MicOff size={24} color="rgba(255,255,255,0.9)"/>
                : <Mic    size={24} color="white"/>}
              {live.listening && (
                <motion.span className="absolute inset-0 rounded-full pointer-events-none"
                  style={{ border:'2px solid rgba(255,255,255,0.3)' }}
                  animate={{ scale:[1,1.45,1], opacity:[0.7,0,0.7] }}
                  transition={{ repeat:Infinity, duration:1.4 }}/>
              )}
            </motion.button>

            {/* Audio toggle */}
            <motion.button
              onClick={() => { const n = !audioOn; setAudioOn(n); live.toggleAudio(n) }}
              whileHover={{ scale:1.06 }} whileTap={{ scale:0.94 }}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)' }}>
              {audioOn
                ? <Volume2 size={22} color="rgba(255,255,255,0.7)"/>
                : <VolumeX size={22} color="rgba(255,255,255,0.25)"/>}
            </motion.button>

            {/* End call */}
            <motion.button
              onClick={() => { live.disconnect(); onClose() }}
              whileHover={{ scale:1.06 }} whileTap={{ scale:0.94 }}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background:'#dc2626', boxShadow:'0 0 16px rgba(220,38,38,0.35)' }}>
              <X size={22} color="white"/>
            </motion.button>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════
//  LIVE MODE BUTTON — paste in TopBar
// ══════════════════════════════════════════════════════
export function LiveModeButton({ onClick, active = false }) {
  return (
    <motion.button onClick={onClick}
      whileHover={{ scale:1.04 }} whileTap={{ scale:0.96 }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium"
      style={{
        background: active ? 'rgba(225,29,72,0.15)' : 'rgba(255,255,255,0.05)',
        border:     active ? '1px solid rgba(225,29,72,0.4)' : '1px solid rgba(255,255,255,0.08)',
        color:      active ? '#fb7185' : 'rgba(255,255,255,0.5)',
      }}>
      <svg width="13" height="13" viewBox="0 0 24 24">
        <rect x="2"  y="16" width="4" height="6"  rx="0.5" fill="currentColor" opacity="0.5"/>
        <rect x="8"  y="11" width="4" height="11" rx="0.5" fill="currentColor" opacity="0.7"/>
        <rect x="14" y="6"  width="4" height="16" rx="0.5" fill="currentColor" opacity="0.85"/>
        <rect x="20" y="2"  width="4" height="20" rx="0.5" fill="currentColor"/>
      </svg>
      Live
      {active && (
        <motion.span className="w-1.5 h-1.5 rounded-full bg-rose-400"
          animate={{ opacity:[1,0.3,1] }} transition={{ repeat:Infinity, duration:1 }}/>
      )}
    </motion.button>
  )
}
