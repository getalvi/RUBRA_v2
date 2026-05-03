// frontend/src/components/LiveController.jsx
// Then import in App.jsx and add <LiveModal> component

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  Phone, PhoneOff, Zap, Eye, Volume2, VolumeX, Minimize2
} from 'lucide-react'

const WS_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:7860')
  .replace(/^http/, 'ws')

// ══════════════════════════════════════════════════════
//  AUDIO PROCESSOR — captures mic, sends to WS
// ══════════════════════════════════════════════════════
class AudioProcessor {
  constructor(onChunk, onEnd) {
    this.onChunk    = onChunk
    this.onEnd      = onEnd
    this.mediaRec   = null
    this.stream     = null
    this.silenceTimer = null
    this.active     = false
    this.SILENCE_MS = 1200  // stop after 1.2s silence
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      })
      this.mediaRec = new MediaRecorder(this.stream, { mimeType: 'audio/webm;codecs=opus' })
      this.active = true

      this.mediaRec.ondataavailable = async (e) => {
        if (e.data.size > 0 && this.active) {
          const buf  = await e.data.arrayBuffer()
          const b64  = btoa(String.fromCharCode(...new Uint8Array(buf)))
          this.onChunk(b64)
          // Reset silence timer on audio activity
          clearTimeout(this.silenceTimer)
          this.silenceTimer = setTimeout(() => {
            if (this.active) this._stopRecording()
          }, this.SILENCE_MS)
        }
      }

      this.mediaRec.start(250)  // chunk every 250ms
    } catch (e) {
      throw new Error(`Mic access denied: ${e.message}`)
    }
  }

  _stopRecording() {
    if (this.mediaRec?.state === 'recording') {
      this.mediaRec.stop()
      this.onEnd()
    }
  }

  stop() {
    this.active = false
    clearTimeout(this.silenceTimer)
    this._stopRecording()
    this.stream?.getTracks().forEach(t => t.stop())
  }
}

// ══════════════════════════════════════════════════════
//  VISION PROCESSOR — captures camera/screen frames
// ══════════════════════════════════════════════════════
class VisionProcessor {
  constructor(onFrame) {
    this.onFrame  = onFrame
    this.stream   = null
    this.canvas   = document.createElement('canvas')
    this.ctx      = this.canvas.getContext('2d')
    this.interval = null
    this.video    = document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true
  }

  async startCamera() {
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
    this._beginCapture()
  }

  async startScreen() {
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: 1280, height: 720 } })
    this._beginCapture()
  }

  _beginCapture() {
    this.video.srcObject = this.stream
    this.video.play()
    // Capture frame every 1.5 seconds
    this.interval = setInterval(() => this._captureFrame(), 1500)
  }

  _captureFrame() {
    if (!this.video.videoWidth) return
    this.canvas.width  = 480   // resize for efficiency
    this.canvas.height = Math.round(480 * this.video.videoHeight / this.video.videoWidth)
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
    // JPEG at 60% quality — good enough for vision context
    const dataUrl = this.canvas.toDataURL('image/jpeg', 0.6)
    this.onFrame(dataUrl)
  }

  stop() {
    clearInterval(this.interval)
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
  }

  getPreviewStream() { return this.stream }
}

// ══════════════════════════════════════════════════════
//  AUDIO PLAYER — plays streaming TTS chunks
// ══════════════════════════════════════════════════════
class StreamingAudioPlayer {
  constructor() {
    this.ctx     = new (window.AudioContext || window.webkitAudioContext)()
    this.queue   = []
    this.playing = false
    this.enabled = true
  }

  async enqueue(b64) {
    if (!this.enabled) return
    const raw = atob(b64)
    const buf = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i)
    try {
      const audioBuf = await this.ctx.decodeAudioData(buf.buffer)
      this.queue.push(audioBuf)
      if (!this.playing) this._play()
    } catch {}
  }

  _play() {
    if (!this.queue.length || !this.enabled) { this.playing = false; return }
    this.playing = true
    const src = this.ctx.createBufferSource()
    src.buffer = this.queue.shift()
    src.connect(this.ctx.destination)
    src.start()
    src.onended = () => this._play()
  }

  // Text fallback (Web Speech)
  speakText(text) {
    if (!this.enabled || !text) return
    const synth = window.speechSynthesis
    synth.cancel()
    const utt   = new SpeechSynthesisUtterance(text)
    const voices = synth.getVoices()
    const aria   = voices.find(v => v.name.includes('Aria') || v.name.includes('Jenny'))
    if (aria) utt.voice = aria
    utt.pitch = 1.15; utt.rate = 0.92
    synth.speak(utt)
  }

  stop() {
    this.queue = []; this.playing = false
    window.speechSynthesis?.cancel()
    try { this.ctx.close() } catch {}
    this.ctx = new (window.AudioContext || window.webkitAudioContext)()
  }

  setEnabled(v) { this.enabled = v; if (!v) this.stop() }
}

// ══════════════════════════════════════════════════════
//  RUBRA LIVE HOOK
// ══════════════════════════════════════════════════════
function useRubraLive(sessionId, onTranscript, onToken, onStatus) {
  const wsRef      = useRef(null)
  const audioProc  = useRef(null)
  const visionProc = useRef(null)
  const player     = useRef(null)
  const micActive  = useRef(false)

  const [connected,  setConnected]  = useState(false)
  const [listening,  setListening]  = useState(false)
  const [speaking,   setSpeaking]   = useState(false)
  const [visionMode, setVisionMode] = useState(null) // 'camera'|'screen'|null
  const [previewSrc, setPreviewSrc] = useState(null)

  // ── Connect WebSocket ───────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    player.current = new StreamingAudioPlayer()
    const ws = new WebSocket(`${WS_BASE}/ws/live/${sessionId}`)
    wsRef.current = ws

    ws.onopen  = () => { setConnected(true); onStatus('connected') }
    ws.onclose = () => { setConnected(false); onStatus('disconnected') }
    ws.onerror = () => { onStatus('error') }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      switch (msg.type) {
        case 'ready':       onStatus('ready'); break
        case 'thinking':    setSpeaking(false); onStatus('thinking'); break
        case 'transcript':  onTranscript(msg.text); break
        case 'token':       onToken(msg.content); setSpeaking(true); break
        case 'tts_chunk':   player.current?.enqueue(msg.audio_b64); break
        case 'tts_text':    player.current?.speakText(msg.text); break
        case 'interrupted': player.current?.stop(); setSpeaking(false); break
        case 'done':        setSpeaking(false); onStatus('ready'); break
        case 'error':       onStatus(`error: ${msg.message}`); break
        case 'pong':        break
      }
    }
  }, [sessionId, onTranscript, onToken, onStatus])

  // ── Disconnect ──────────────────────────────────────
  const disconnect = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'stop' }))
    wsRef.current?.close()
    audioProc.current?.stop()
    visionProc.current?.stop()
    player.current?.stop()
    setConnected(false); setListening(false); setSpeaking(false)
    setVisionMode(null); setPreviewSrc(null)
  }, [])

  // ── Start mic ───────────────────────────────────────
  const startMic = useCallback(async () => {
    if (!connected || listening) return
    // Interrupt AI if speaking
    if (speaking) {
      wsRef.current?.send(JSON.stringify({ type: 'interrupt' }))
      player.current?.stop()
    }
    const proc = new AudioProcessor(
      (b64)  => wsRef.current?.send(JSON.stringify({ type: 'audio_chunk', data: b64 })),
      ()     => {
        wsRef.current?.send(JSON.stringify({ type: 'audio_end' }))
        setListening(false)
        micActive.current = false
      }
    )
    try {
      await proc.start()
      audioProc.current = proc
      micActive.current = true
      setListening(true)
    } catch (e) { onStatus(`mic error: ${e.message}`) }
  }, [connected, listening, speaking, onStatus])

  const stopMic = useCallback(() => {
    audioProc.current?.stop()
    setListening(false)
  }, [])

  // ── Send text ───────────────────────────────────────
  const sendText = useCallback((text) => {
    if (!connected || !text.trim()) return
    if (speaking) {
      wsRef.current?.send(JSON.stringify({ type: 'interrupt' }))
      player.current?.stop()
    }
    wsRef.current?.send(JSON.stringify({ type: 'text', text }))
  }, [connected, speaking])

  // ── Camera ──────────────────────────────────────────
  const startCamera = useCallback(async () => {
    visionProc.current?.stop()
    const proc = new VisionProcessor((dataUrl) => {
      wsRef.current?.send(JSON.stringify({ type: 'frame', data: dataUrl }))
      setPreviewSrc(dataUrl)
    })
    try {
      await proc.startCamera()
      visionProc.current = proc
      setVisionMode('camera')
      // Set preview video element
      const stream = proc.getPreviewStream()
      setPreviewSrc(stream ? URL.createObjectURL(new MediaStream(stream.getVideoTracks())) : null)
    } catch (e) { onStatus(`camera error: ${e.message}`) }
  }, [onStatus])

  // ── Screen share ────────────────────────────────────
  const startScreen = useCallback(async () => {
    visionProc.current?.stop()
    const proc = new VisionProcessor((dataUrl) => {
      wsRef.current?.send(JSON.stringify({ type: 'frame', data: dataUrl }))
    })
    try {
      await proc.startScreen()
      visionProc.current = proc
      setVisionMode('screen')
    } catch (e) { onStatus(`screen error: ${e.message}`) }
  }, [onStatus])

  const stopVision = useCallback(() => {
    visionProc.current?.stop()
    visionProc.current = null
    wsRef.current?.send(JSON.stringify({ type: 'frame_clear' }))
    setVisionMode(null); setPreviewSrc(null)
  }, [])

  // ── Cleanup ─────────────────────────────────────────
  useEffect(() => () => disconnect(), [])

  // ── Ping keepalive ──────────────────────────────────
  useEffect(() => {
    if (!connected) return
    const t = setInterval(() => wsRef.current?.send(JSON.stringify({ type: 'ping' })), 30000)
    return () => clearInterval(t)
  }, [connected])

  return {
    connected, listening, speaking, visionMode, previewSrc,
    connect, disconnect, startMic, stopMic, sendText,
    startCamera, startScreen, stopVision,
    toggleAudio: (v) => player.current?.setEnabled(v),
  }
}

// ══════════════════════════════════════════════════════
//  LIVE MODAL UI
// ══════════════════════════════════════════════════════
export default function LiveModal({ sessionId, onClose, onMessage }) {
  const [status,   setStatus]   = useState('disconnected')
  const [tokens,   setTokens]   = useState('')
  const [transcript, setTranscript] = useState('')
  const [audioOn,  setAudioOn]  = useState(true)
  const [minimized, setMinimized] = useState(false)

  const live = useRubraLive(
    sessionId,
    (t) => setTranscript(t),
    (t) => setTokens(prev => prev + t),
    (s) => setStatus(s),
  )

  // When AI finishes → pass to parent chat
  useEffect(() => {
    if (status === 'ready' && tokens) {
      onMessage?.({ role: 'assistant', content: tokens })
      setTokens('')
    }
  }, [status])

  const statusColor = {
    connected:    '#4ade80',
    ready:        '#4ade80',
    thinking:     '#fbbf24',
    disconnected: '#6b7280',
    error:        '#fb7185',
  }[status.split(':')[0]] || '#6b7280'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      className="fixed bottom-6 right-6 z-50 rounded-2xl overflow-hidden shadow-2xl"
      style={{
        width: minimized ? 280 : 360,
        background: 'rgba(10,10,10,0.95)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5">
          <motion.div className="w-2 h-2 rounded-full"
            style={{ background: statusColor }}
            animate={live.speaking ? { scale: [1, 1.4, 1] } : {}}
            transition={{ repeat: Infinity, duration: 0.8 }}
          />
          <span className="text-[13px] font-medium text-white/80">RUBRA Live</span>
          <span className="text-[10px] text-white/30 capitalize">{status}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMinimized(m => !m)}
            className="p-1.5 rounded-lg hover:bg-white/08 text-white/30 hover:text-white/60 transition-all">
            <Minimize2 size={12}/>
          </button>
          <button onClick={() => { live.disconnect(); onClose() }}
            className="p-1.5 rounded-lg hover:bg-white/08 text-white/30 hover:text-white/60 transition-all">
            <PhoneOff size={12}/>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {!minimized && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
          >
            {/* Vision preview */}
            {live.visionMode === 'camera' && live.previewSrc && (
              <div className="relative mx-3 mt-3 rounded-xl overflow-hidden"
                style={{ height: 160, background: '#000' }}>
                <video autoPlay muted playsInline
                  src={live.previewSrc}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Video size={10} className="text-emerald-400"/>
                  <span className="text-[10px] text-white/60">Camera</span>
                </div>
              </div>
            )}

            {live.visionMode === 'screen' && (
              <div className="mx-3 mt-3 rounded-xl flex items-center justify-center"
                style={{ height: 60, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <Monitor size={16} className="text-indigo-400 mr-2"/>
                <span className="text-[12px] text-indigo-300">Screen sharing active</span>
              </div>
            )}

            {/* Transcript / response */}
            <div className="mx-3 mt-3 px-3 py-2.5 rounded-xl min-h-[60px]"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              {transcript && (
                <p className="text-[11px] text-white/40 mb-1">You: {transcript}</p>
              )}
              {tokens && (
                <p className="text-[12.5px] text-white/80 leading-relaxed">
                  {tokens}
                  {live.speaking && (
                    <motion.span className="inline-block w-0.5 h-3.5 ml-0.5 bg-rose-400 align-middle"
                      animate={{ opacity: [1, 0] }}
                      transition={{ repeat: Infinity, duration: 0.8, ease: 'steps(2)' }}
                    />
                  )}
                </p>
              )}
              {!transcript && !tokens && (
                <p className="text-[11px] text-white/20 text-center pt-2">
                  {live.connected ? 'Press mic to speak...' : 'Connect to start'}
                </p>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 p-4">
              {/* Connect / Disconnect */}
              {!live.connected ? (
                <motion.button onClick={live.connect}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-medium"
                  style={{ background: 'rgba(225,29,72,0.15)', border: '1px solid rgba(225,29,72,0.3)', color: '#fb7185' }}
                >
                  <Zap size={13}/> Connect
                </motion.button>
              ) : (
                <>
                  {/* Mic */}
                  <motion.button
                    onClick={live.listening ? live.stopMic : live.startMic}
                    whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
                    className="w-12 h-12 rounded-full flex items-center justify-center relative"
                    style={{
                      background: live.listening ? 'rgba(225,29,72,0.2)' : 'rgba(255,255,255,0.06)',
                      border:     live.listening ? '1px solid rgba(225,29,72,0.5)' : '1px solid rgba(255,255,255,0.1)',
                      color:      live.listening ? '#fb7185' : 'rgba(255,255,255,0.6)',
                    }}
                  >
                    {live.listening ? <MicOff size={18}/> : <Mic size={18}/>}
                    {live.listening && (
                      <motion.span className="absolute inset-0 rounded-full"
                        style={{ border: '2px solid rgba(225,29,72,0.4)' }}
                        animate={{ scale: [1, 1.5, 1], opacity: [0.7, 0, 0.7] }}
                        transition={{ repeat: Infinity, duration: 1.3 }}
                      />
                    )}
                  </motion.button>

                  {/* Camera */}
                  <motion.button
                    onClick={live.visionMode === 'camera' ? live.stopVision : live.startCamera}
                    whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{
                      background: live.visionMode === 'camera' ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.05)',
                      border:     live.visionMode === 'camera' ? '1px solid rgba(52,211,153,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      color:      live.visionMode === 'camera' ? '#34d399' : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {live.visionMode === 'camera' ? <VideoOff size={15}/> : <Video size={15}/>}
                  </motion.button>

                  {/* Screen share */}
                  <motion.button
                    onClick={live.visionMode === 'screen' ? live.stopVision : live.startScreen}
                    whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{
                      background: live.visionMode === 'screen' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                      border:     live.visionMode === 'screen' ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      color:      live.visionMode === 'screen' ? '#818cf8' : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {live.visionMode === 'screen' ? <MonitorOff size={15}/> : <Monitor size={15}/>}
                  </motion.button>

                  {/* Audio toggle */}
                  <motion.button
                    onClick={() => { const n = !audioOn; setAudioOn(n); live.toggleAudio(n) }}
                    whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: audioOn ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)',
                    }}
                  >
                    {audioOn ? <Volume2 size={15}/> : <VolumeX size={15}/>}
                  </motion.button>
                </>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-4 pb-3 text-center">
              <p className="text-[10px] text-white/18">
                {live.listening ? '🎙 Listening — speak now' :
                 live.speaking  ? '🔊 RUBRA is speaking — speak to interrupt' :
                 live.visionMode ? `👁 ${live.visionMode === 'camera' ? 'Camera' : 'Screen'} active` :
                 'Tap mic · Camera · Screen to start'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════
//  LIVE MODE BUTTON — add to TopBar
// ══════════════════════════════════════════════════════
export function LiveModeButton({ onClick, active = false }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] font-medium transition-all"
      style={{
        background: active ? 'rgba(225,29,72,0.15)' : 'rgba(255,255,255,0.04)',
        border:     active ? '1px solid rgba(225,29,72,0.35)' : '1px solid rgba(255,255,255,0.07)',
        color:      active ? '#fb7185' : 'rgba(255,255,255,0.45)',
      }}
    >
      <motion.div
        animate={active ? { scale: [1, 1.3, 1] } : {}}
        transition={{ repeat: Infinity, duration: 1.5 }}
      >
        <Zap size={12}/>
      </motion.div>
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
