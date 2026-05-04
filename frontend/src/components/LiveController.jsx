import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, X, Volume2, VolumeX } from 'lucide-react'

const WS_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:7860')
  .replace(/^https?/, (m) => (m === 'https' ? 'wss' : 'ws'))

// ══════════════════════════════════════════════════════
//  AUDIO PROCESSOR
// ══════════════════════════════════════════════════════
class AudioProcessor {
  constructor(onChunk, onSilence) {
    this.onChunk   = onChunk
    this.onSilence = onSilence   // called when silence detected
    this.mediaRec  = null
    this.stream    = null
    this.active    = false

    // VAD state
    this.audioCtx    = null
    this.analyser    = null
    this.vadInterval = null
    this.silenceMs   = 0
    this.SILENCE_THRESHOLD = 1800  // 1.8s silence → send
    this.ENERGY_MIN  = 8           // minimum RMS to count as speech
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000, channelCount: 1,
        echoCancellation: true, noiseSuppression: true, autoGainControl: true
      }
    })

    // VAD via Web Audio API
    this.audioCtx  = new (window.AudioContext || window.webkitAudioContext)()
    const source   = this.audioCtx.createMediaStreamSource(this.stream)
    this.analyser  = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 512
    source.connect(this.analyser)

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm'
    this.mediaRec  = new MediaRecorder(this.stream, { mimeType })
    this.active    = true

    this.mediaRec.ondataavailable = async (e) => {
      if (e.data.size > 100 && this.active) {
        const buf = await e.data.arrayBuffer()
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
        this.onChunk(b64)
      }
    }
    this.mediaRec.start(400)  // chunk every 400ms

    // VAD loop — check energy every 100ms
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.vadInterval = setInterval(() => {
      if (!this.active) return
      this.analyser.getByteFrequencyData(data)
      const rms = Math.sqrt(data.reduce((s, v) => s + v*v, 0) / data.length)

      if (rms < this.ENERGY_MIN) {
        this.silenceMs += 100
        if (this.silenceMs >= this.SILENCE_THRESHOLD) {
          this.silenceMs = 0
          this.onSilence()  // silence detected → trigger send
        }
      } else {
        this.silenceMs = 0  // reset on speech
      }
    }, 100)
  }

  stop() {
    this.active = false
    clearInterval(this.vadInterval)
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
    this.onFrame = onFrame; this.stream = null
    this.interval = null
    this.canvas = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d')
    this.video = document.createElement('video')
    this.video.muted = true; this.video.playsInline = true
  }
  async startCamera() {
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
    this._capture()
  }
  async startScreen() {
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
    this._capture()
    // Auto-stop when user ends screen share
    this.stream.getVideoTracks()[0].onended = () => this.stop()
  }
  _capture() {
    this.video.srcObject = this.stream; this.video.play()
    this.interval = setInterval(() => {
      if (!this.video.videoWidth) return
      this.canvas.width = 480
      this.canvas.height = Math.round(480 * this.video.videoHeight / this.video.videoWidth)
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
      this.onFrame(this.canvas.toDataURL('image/jpeg', 0.55))
    }, 1500)
  }
  getStream() { return this.stream }
  stop() {
    clearInterval(this.interval)
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
  }
}

// ══════════════════════════════════════════════════════
//  STREAMING AUDIO PLAYER
// ══════════════════════════════════════════════════════
class StreamingPlayer {
  constructor() {
    this.ctx = null; this.queue = []; this.playing = false; this.enabled = true
  }
  _init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (this.ctx.state === 'suspended') this.ctx.resume()
  }
  async play(b64) {
  if (!this.enabled) return
  this._init()
  try {
    // Proper base64 decode
    const binary = atob(b64)
    const bytes  = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    // Decode MP3
    const cloned = bytes.buffer.slice(0)  // clone — decodeAudioData consumes buffer
    const audioBuf = await this.ctx.decodeAudioData(cloned)
    this.queue.push(audioBuf)
    if (!this.playing) this._next()
  } catch (e) {
    console.warn('TTS decode error:', e)
  }
}
  _next() {
    if (!this.queue.length || !this.enabled) { this.playing = false; return }
    this.playing = true
    const src = this.ctx.createBufferSource()
    src.buffer = this.queue.shift(); src.connect(this.ctx.destination)
    src.start(); src.onended = () => this._next()
  }
  speakFallback(text) {
    if (!this.enabled || !text) return
    const synth = window.speechSynthesis; synth.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    const voices = synth.getVoices()
    const v = voices.find(v => v.name.includes('Aria') || v.name.includes('Jenny') || v.name.includes('Samantha'))
    if (v) utt.voice = v
    utt.pitch = 1.15; utt.rate = 0.92; synth.speak(utt)
  }
  stop() {
    this.queue = []; this.playing = false
    window.speechSynthesis?.cancel()
  }
  setEnabled(v) { this.enabled = v; if (!v) this.stop() }
}

// ══════════════════════════════════════════════════════
//  useRubraLive HOOK
// ══════════════════════════════════════════════════════
function useRubraLive(sessionId, callbacks) {
  const { onTranscript, onToken, onStatus, onDone } = callbacks
  const ws       = useRef(null)
  const audio    = useRef(null)
  const vision   = useRef(null)
  const player   = useRef(new StreamingPlayer())
  const reconnT  = useRef(null)

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

    const url = `${WS_BASE}/ws/live/${sessionId}`
    const sock = new WebSocket(url)
    ws.current = sock

    sock.onopen = () => {
      setConnected(true)
      onStatus('ready')
      clearTimeout(reconnT.current)
    }

    sock.onclose = (e) => {
      setConnected(false); setListening(false); setSpeaking(false)
      onStatus('disconnected')
      // Auto-reconnect after 3s if not intentional close
      if (e.code !== 1000) {
        reconnT.current = setTimeout(() => connect(), 3000)
      }
    }

    sock.onerror = () => onStatus('error')

    sock.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      switch (msg.type) {
        case 'ready':       onStatus('ready'); break
        case 'thinking':    onStatus('thinking'); break
        case 'transcript':  onTranscript(msg.text); break
        case 'token':       onToken(msg.content); setSpeaking(true); break
        case 'tts_chunk':   player.current.play(msg.audio_b64); break
        case 'tts_text':    player.current.speakFallback(msg.text); break
        case 'interrupted': player.current.stop(); setSpeaking(false); break
        case 'done':        setSpeaking(false); onStatus('ready'); onDone(); break
        case 'error':       onStatus(`Error`); break
        case 'pong':        break
      }
    }
  }, [sessionId, onStatus, onTranscript, onToken, onDone])

  // ── Disconnect ───────────────────────────────────────
  const disconnect = useCallback(() => {
    clearTimeout(reconnT.current)
    send({ type: 'stop' })
    ws.current?.close(1000)
    audio.current?.stop(); vision.current?.stop()
    player.current.stop()
    setConnected(false); setListening(false); setSpeaking(false)
    setVisionMode(null); setVideoStream(null)
  }, [send])

  // ── Mic ──────────────────────────────────────────────
 const startMic = useCallback(async () => {
  if (!connected || listening) return
  if (speaking) { send({ type: 'interrupt' }); player.current.stop() }
  try {
    const proc = new AudioProcessor(
      // chunk ready → send to backend
      (b64) => send({ type: 'audio_chunk', data: b64 }),
      // VAD silence detected → trigger transcription
      () => {
        send({ type: 'audio_end' })
        // Keep listening — VAD auto-continues
        // Don't stop mic, just signal end of utterance
      }
    )
    await proc.start()
    audio.current = proc
    setListening(true)
  } catch (err) { onStatus(`Mic: ${err.message}`) }
}, [connected, listening, speaking, send, onStatus])

  // ADDED missing stopMic function to prevent ReferenceError crash
  const stopMic = useCallback(() => {
    if (audio.current) {
      audio.current.stop()
      audio.current = null
    }
    setListening(false)
  }, [])

  // ── Text ─────────────────────────────────────────────
  const sendText = useCallback((text) => {
    if (!connected || !text.trim()) return
    if (speaking) { send({ type: 'interrupt' }); player.current.stop() }
    send({ type: 'text', text })
  }, [connected, speaking, send])

  // ── Camera ───────────────────────────────────────────
  const startCamera = useCallback(async () => {
    vision.current?.stop()
    try {
      const proc = new VisionProcessor((dataUrl) => send({ type: 'frame', data: dataUrl }))
      await proc.startCamera()
      vision.current = proc
      setVisionMode('camera'); setVideoStream(proc.getStream())
    } catch (err) { onStatus(`Camera: ${err.message}`) }
  }, [send, onStatus])

  // ── Screen ───────────────────────────────────────────
  const startScreen = useCallback(async () => {
    vision.current?.stop()
    try {
      const proc = new VisionProcessor((dataUrl) => send({ type: 'frame', data: dataUrl }))
      await proc.startScreen()
      vision.current = proc; setVisionMode('screen')
      // Listen for screen share end
      proc.getStream()?.getVideoTracks()[0]?.addEventListener('ended', () => {
        setVisionMode(null); send({ type: 'frame_clear' })
      })
    } catch (err) { onStatus(`Screen: ${err.message}`) }
  }, [send, onStatus])

  const stopVision = useCallback(() => {
    vision.current?.stop(); vision.current = null
    send({ type: 'frame_clear' })
    setVisionMode(null); setVideoStream(null)
  }, [send])

  // ── Keepalive ────────────────────────────────────────
  useEffect(() => {
    if (!connected) return
    const t = setInterval(() => send({ type: 'ping' }), 25000)
    return () => clearInterval(t)
  }, [connected, send])

  useEffect(() => () => { clearTimeout(reconnT.current); disconnect() }, [])

  return {
    connected, listening, speaking, visionMode, videoStream,
    connect, disconnect, startMic, stopMic, sendText,
    startCamera, startScreen, stopVision,
    toggleAudio: (v) => player.current.setEnabled(v),
  }
}

// ══════════════════════════════════════════════════════
//  LIVE MODAL — Gemini Live Style Full Screen
// ══════════════════════════════════════════════════════
export default function LiveModal({ sessionId, onClose, onMessage }) {
  const [status,      setStatus]     = useState('disconnected')
  const [tokens,      setTokens]     = useState('')
  const [transcript, setTranscript] = useState('')
  const [audioOn,    setAudioOn]    = useState(true)
  const videoRef = useRef(null)

  const live = useRubraLive(sessionId, {
    onTranscript: (t) => { setTranscript(t); setTokens('') },
    onToken:      (t) => setTokens(prev => prev + t),
    onStatus:     (s) => setStatus(s),
    onDone:       ()  => {
      if (tokens) onMessage?.({ role: 'assistant', content: tokens })
    },
  })

  // Attach camera stream to video element
  useEffect(() => {
    if (videoRef.current && live.videoStream) {
      videoRef.current.srcObject = live.videoStream
    }
  }, [live.videoStream])

  const isConnected = live.connected
  const statusLabel = {
    ready:        'Listening',
    thinking:     'Thinking...',
    disconnected: 'Disconnected',
    error:        'Error',
  }[status] || status

  return (
    // Full-screen overlay like Gemini Live
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: '#000' }}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 pt-safe pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Signal bars icon like Gemini */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="2"  y="16" width="4" height="6" rx="1"
              fill={isConnected ? 'white' : '#444'} opacity="0.9"/>
            <rect x="8"  y="11" width="4" height="11" rx="1"
              fill={isConnected ? 'white' : '#444'} opacity="0.9"/>
            <rect x="14" y="6"  width="4" height="16" rx="1"
              fill={isConnected && live.listening ? 'white' : '#444'} opacity="0.9"/>
            <rect x="20" y="2"  width="4" height="20" rx="1"
              fill={isConnected && live.speaking ? 'white' : '#333'} opacity="0.9"/>
          </svg>
          <span className="text-white text-[16px] font-medium tracking-wide">Live</span>
        </div>
        {/* Close / Caption toggle */}
        <button
          onClick={() => { live.disconnect(); onClose() }}
          className="w-9 h-9 flex items-center justify-center rounded-xl"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <X size={18} color="rgba(255,255,255,0.7)"/>
        </button>
      </div>

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 relative">

        {/* Camera preview (small, top-right like Gemini) */}
        {live.visionMode === 'camera' && live.videoStream && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute top-4 right-4 rounded-2xl overflow-hidden"
            style={{ width: 120, height: 90, border: '2px solid rgba(255,255,255,0.15)' }}
          >
            <video ref={videoRef} autoPlay muted playsInline
              className="w-full h-full object-cover"/>
          </motion.div>
        )}

        {/* Screen share indicator */}
        {live.visionMode === 'screen' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2
              px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)' }}
          >
            <Monitor size={12} className="text-indigo-400"/>
            <span className="text-[11px] text-indigo-300">Screen active</span>
          </motion.div>
        )}

        {/* ── Central animated orb — Gemini style ── */}
        <div className="relative flex items-center justify-center mb-10">
          {/* Outer glow rings */}
          {[80, 100, 120].map((size, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: size, height: size,
                background: live.speaking
                  ? `radial-gradient(circle, rgba(99,102,241,${0.15 - i*0.04}) 0%, transparent 70%)`
                  : live.listening
                  ? `radial-gradient(circle, rgba(225,29,72,${0.12 - i*0.03}) 0%, transparent 70%)`
                  : `radial-gradient(circle, rgba(255,255,255,${0.05 - i*0.01}) 0%, transparent 70%)`,
              }}
              animate={
                live.speaking
                  ? { scale: [1, 1.15 + i*0.05, 1], opacity: [0.6, 1, 0.6] }
                  : live.listening
                  ? { scale: [1, 1.08 + i*0.03, 1], opacity: [0.4, 0.8, 0.4] }
                  : { scale: 1, opacity: 0.3 }
              }
              transition={{ repeat: Infinity, duration: 1.8 + i*0.3, ease: 'easeInOut' }}
            />
          ))}

          {/* Core orb */}
          <motion.div
            className="relative rounded-full flex items-center justify-center"
            style={{
              width: 72, height: 72,
              background: live.speaking
                ? 'radial-gradient(circle at 35% 35%, #818cf8, #4f46e5)'
                : live.listening
                ? 'radial-gradient(circle at 35% 35%, #fb7185, #e11d48)'
                : isConnected
                ? 'radial-gradient(circle at 35% 35%, #374151, #111827)'
                : 'radial-gradient(circle at 35% 35%, #1f2937, #0f0f0f)',
              boxShadow: live.speaking
                ? '0 0 40px rgba(99,102,241,0.5), 0 0 80px rgba(99,102,241,0.2)'
                : live.listening
                ? '0 0 40px rgba(225,29,72,0.5), 0 0 80px rgba(225,29,72,0.2)'
                : 'none',
            }}
            animate={
              live.speaking || live.listening
                ? { scale: [1, 1.06, 1] }
                : {}
            }
            transition={{ repeat: Infinity, duration: 1.2 }}
          >
            {/* RUBRA hexagon mark */}
            <svg width="28" height="28" viewBox="0 0 24 24">
              <polygon
                points="12,2 21,7 21,17 12,22 3,17 3,7"
                fill="none"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth="1.5"
              />
            </svg>
          </motion.div>
        </div>

        {/* ── Status text ── */}
        <motion.p
          key={status}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[15px] font-medium mb-3"
          style={{ color: 'rgba(255,255,255,0.75)' }}
        >
          {!isConnected ? 'Tap Connect to start' : statusLabel}
        </motion.p>

        {/* ── Transcript / Response text ── */}
        <div className="min-h-[48px] text-center max-w-[280px]">
          {transcript && !tokens && (
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-[13px]"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              {transcript}
            </motion.p>
          )}
          {tokens && (
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-[14px] leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.85)' }}
            >
              {tokens}
              {live.speaking && (
                <motion.span
                  className="inline-block w-0.5 h-3.5 ml-0.5 bg-indigo-400 align-middle rounded-sm"
                  animate={{ opacity: [1, 0] }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: 'steps(2)' }}
                />
              )}
            </motion.p>
          )}
        </div>
      </div>

      {/* ── Bottom controls — exactly like Gemini Live ── */}
      <div className="flex-shrink-0 pb-safe pb-8 px-8">
        {!isConnected ? (
          /* Connect button */
          <div className="flex justify-center">
            <motion.button
              onClick={live.connect}
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              className="flex items-center gap-2.5 px-8 py-3.5 rounded-full text-[15px] font-semibold"
              style={{
                background: 'linear-gradient(135deg, #e11d48, #be123c)',
                color: 'white',
                boxShadow: '0 0 24px rgba(225,29,72,0.4)',
              }}
            >
              Connect
            </motion.button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-5">
            {/* Camera button */}
            <motion.button
              onClick={live.visionMode === 'camera' ? live.stopVision : live.startCamera}
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: live.visionMode === 'camera'
                  ? 'rgba(52,211,153,0.15)'
                  : 'rgba(255,255,255,0.1)',
                border: live.visionMode === 'camera'
                  ? '1px solid rgba(52,211,153,0.4)'
                  : '1px solid rgba(255,255,255,0.15)',
              }}
            >
              {live.visionMode === 'camera'
                ? <VideoOff size={22} color="#34d399"/>
                : <Video    size={22} color="rgba(255,255,255,0.75)"/>
              }
            </motion.button>

            {/* Screen share button */}
            <motion.button
              onClick={live.visionMode === 'screen' ? live.stopVision : live.startScreen}
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: live.visionMode === 'screen'
                  ? 'rgba(99,102,241,0.15)'
                  : 'rgba(255,255,255,0.1)',
                border: live.visionMode === 'screen'
                  ? '1px solid rgba(99,102,241,0.4)'
                  : '1px solid rgba(255,255,255,0.15)',
              }}
            >
              {live.visionMode === 'screen'
                ? <MonitorOff size={22} color="#818cf8"/>
                : <Monitor   size={22} color="rgba(255,255,255,0.75)"/>
              }
            </motion.button>

            {/* Mic button — center, larger, RED like Gemini */}
            <motion.button
              onClick={live.listening ? live.stopMic : live.startMic}
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
              className="w-16 h-16 rounded-full flex items-center justify-center relative"
              style={{
                background: live.listening
                  ? 'rgba(255,255,255,0.15)'
                  : '#dc2626',
                border: live.listening
                  ? '1px solid rgba(255,255,255,0.2)'
                  : 'none',
                boxShadow: !live.listening
                  ? '0 0 20px rgba(220,38,38,0.4)'
                  : 'none',
              }}
            >
              {live.listening
                ? <MicOff size={24} color="rgba(255,255,255,0.9)"/>
                : <Mic    size={24} color="white"/>
              }
              {live.listening && (
                <motion.span
                  className="absolute inset-0 rounded-full"
                  style={{ border: '2px solid rgba(255,255,255,0.3)' }}
                  animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                />
              )}
            </motion.button>

            {/* Audio toggle */}
            <motion.button
              onClick={() => { const n = !audioOn; setAudioOn(n); live.toggleAudio(n) }}
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              {audioOn
                ? <Volume2  size={22} color="rgba(255,255,255,0.75)"/>
                : <VolumeX  size={22} color="rgba(255,255,255,0.3)"/>
              }
            </motion.button>

            {/* End call — RED X like Gemini */}
            <motion.button
              onClick={() => { live.disconnect(); onClose() }}
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: '#dc2626', boxShadow: '0 0 16px rgba(220,38,38,0.35)' }}
            >
              <X size={22} color="white"/>
            </motion.button>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════
//  LIVE MODE BUTTON — for TopBar
// ══════════════════════════════════════════════════════
export function LiveModeButton({ onClick, active = false }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all"
      style={{
        background: active ? 'rgba(225,29,72,0.15)' : 'rgba(255,255,255,0.05)',
        border:     active ? '1px solid rgba(225,29,72,0.4)' : '1px solid rgba(255,255,255,0.08)',
        color:      active ? '#fb7185' : 'rgba(255,255,255,0.5)',
      }}
    >
      {/* Signal bars icon */}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <rect x="2"  y="16" width="4" height="6" rx="0.5" fill="currentColor" opacity="0.6"/>
        <rect x="8"  y="11" width="4" height="11" rx="0.5" fill="currentColor" opacity="0.75"/>
        <rect x="14" y="6"  width="4" height="16" rx="0.5" fill="currentColor" opacity="0.9"/>
        <rect x="20" y="2"  width="4" height="20" rx="0.5" fill="currentColor"/>
      </svg>
      Live
      {active && (
        <motion.span className="w-1.5 h-1.5 rounded-full bg-rose-400"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ repeat: Infinity, duration: 1 }}
        />
      )}
    </motion.button>
  )
}
