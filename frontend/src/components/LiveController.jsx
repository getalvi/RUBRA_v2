import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, useAnimation } from 'framer-motion'
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, X, Volume2, VolumeX, AlertCircle, Loader2 } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'https://getalvi-rubrav2.hf.space'

// ══════════════════════════════════════════════════════
//  VISION PROCESSOR (Optimized)
// ══════════════════════════════════════════════════════
class VisionProcessor {
  constructor(onFrame) {
    this.onFrame = onFrame
    this.stream  = null
    this.timer   = null
    this.canvas  = document.createElement('canvas')
    this.ctx2d   = this.canvas.getContext('2d', { willReadFrequently: true })
    this.video   = document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true
  }

  async startCamera() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } // Default to user facing for better engagement
    })
    this._capture()
  }

  async startScreen() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Screen sharing not supported on this browser.')
    }
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15 } },
      audio: false
    })
    this._capture()
    this.stream.getVideoTracks()[0].addEventListener('ended', () => this.stop())
  }

  _capture() {
    this.video.srcObject = this.stream
    this.video.play().catch(() => {})
    this.timer = setInterval(() => {
      if (!this.video.videoWidth || this.video.readyState !== 4) return
      
      const targetWidth = 480
      const targetHeight = Math.round(targetWidth * this.video.videoHeight / this.video.videoWidth)
      
      // Limit max height to prevent huge payloads on vertical screens
      this.canvas.width  = targetWidth
      this.canvas.height = Math.min(targetHeight, 800) 
      
      this.ctx2d.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
      this.onFrame(this.canvas.toDataURL('image/jpeg', 0.5)) // Slightly compressed for speed
    }, 1200) // Slightly faster frame rate for better responsiveness
  }

  getStream() { return this.stream }

  stop() {
    clearInterval(this.timer)
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
    this.video.srcObject = null
  }
}

// ══════════════════════════════════════════════════════
//  DYNAMIC AUDIO PLAYER (With Audio Reactivity)
// ══════════════════════════════════════════════════════
class StreamingPlayer {
  constructor() {
    this.ctx      = null
    this.analyser = null
    this.dataArr  = null
    this.queue    = []
    this.playing  = false
    this.enabled  = true
    this.onDone   = null
  }

  _init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)()
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.connect(this.ctx.destination)
      this.dataArr = new Uint8Array(this.analyser.frequencyBinCount)
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
  }

  async play(b64) {
    if (!this.enabled || !b64) return
    this._init()
    try {
      const bin  = atob(b64)
      const buf  = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
      const abuf = await this.ctx.decodeAudioData(buf.buffer.slice(0))
      this.queue.push(abuf)
      if (!this.playing) this._next()
    } catch (e) { console.warn('Audio decode error:', e) }
  }

  _next() {
    if (!this.queue.length || !this.enabled) {
      this.playing = false
      this.onDone?.()
      return
    }
    this.playing = true
    const src = this.ctx.createBufferSource()
    src.buffer = this.queue.shift()
    src.connect(this.analyser) // Connect to analyser instead of destination
    src.start(0)
    src.onended = () => this._next()
  }

  getVolume() {
    if (!this.analyser || !this.playing) return 0
    this.analyser.getByteFrequencyData(this.dataArr)
    let sum = 0
    for(let i=0; i<this.dataArr.length; i++) sum += this.dataArr[i]
    return (sum / this.dataArr.length) / 255 // Returns 0.0 to 1.0
  }

  stop() {
    this.queue = []; this.playing = false
    window.speechSynthesis?.cancel()
  }

  setEnabled(v) { this.enabled = v; if (!v) this.stop() }
  get isPlaying() { return this.playing }
}

// ══════════════════════════════════════════════════════
//  useRubraLive HOOK (Robust State Management)
// ══════════════════════════════════════════════════════
function useRubraLive(sessionId, { onTranscript, onToken, onStatus, onAddMessage }) {
  const esRef      = useRef(null)
  const recRef     = useRef(null)
  const visionProc = useRef(null)
  const player     = useRef(new StreamingPlayer())
  const fullResp   = useRef('')

  const isActive       = useRef(false)
  const isRubraTalking = useRef(false)

  const [connected,   setConnected]   = useState(false)
  const [listening,   setListening]   = useState(false)
  const [speaking,    setSpeaking]    = useState(false)
  const [visionMode,  setVisionMode]  = useState(null)
  const [videoStream, setVideoStream] = useState(null)
  const [audioVolume, setAudioVolume] = useState(0) // For real-time UI reaction

  // Audio volume polling for UI
  useEffect(() => {
    let animFrame;
    const pollVolume = () => {
      if (player.current.isPlaying) {
        setAudioVolume(player.current.getVolume())
      } else {
        setAudioVolume(0)
      }
      animFrame = requestAnimationFrame(pollVolume)
    }
    pollVolume()
    return () => cancelAnimationFrame(animFrame)
  }, [])

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close()
    
    onStatus('connecting')
    const es = new EventSource(`${API_URL}/api/live/stream/${sessionId}`)
    esRef.current = es

    es.onopen = () => {
      setConnected(true)
      onStatus('ready')
    }

    es.onerror = () => { 
      setConnected(false)
      onStatus('connection_dropped')
      es.close()
    }

    player.current.onDone = () => {
      isRubraTalking.current = false
      setSpeaking(false)
      if (isActive.current) {
        onStatus('listening')
        setTimeout(() => {
          if (isActive.current && recRef.current) {
            try { recRef.current.start() } catch {}
          }
        }, 300)
      } else {
        onStatus('ready')
      }
    }

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        switch (msg.type) {
          case 'thinking':
            onStatus('thinking')
            fullResp.current = ''
            break
          case 'token':
            fullResp.current += msg.content
            onToken(msg.content)
            setSpeaking(true)
            isRubraTalking.current = true
            break
          case 'tts_chunk':
            player.current.play(msg.audio_b64)
            break
          case 'done':
            if (fullResp.current.trim()) {
              onAddMessage({ role: 'assistant', content: fullResp.current, fromLive: true })
              fullResp.current = ''
            }
            if (!player.current.isPlaying) {
              isRubraTalking.current = false
              setSpeaking(false)
              onStatus(isActive.current ? 'listening' : 'ready')
            }
            break
        }
      } catch {}
    }
  }, [sessionId, onStatus, onToken, onAddMessage])

  const disconnect = useCallback(() => {
    isActive.current = false
    isRubraTalking.current = false
    esRef.current?.close()
    try { recRef.current?.stop() } catch {}
    recRef.current = null
    visionProc.current?.stop()
    player.current.stop()
    setConnected(false); setListening(false); setSpeaking(false); setAudioVolume(0)
    setVisionMode(null); setVideoStream(null)
    onStatus('disconnected')
  }, [onStatus])

  const _startRecLoop = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR || !isActive.current) return

    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'bn-BD' // Keep configurable if needed later
    recRef.current = rec

    let accumulated = ''
    let silenceTimer = null

    const sendNow = async () => {
      const text = accumulated.trim()
      accumulated = ''
      if (!text || !isActive.current) return

      if (isRubraTalking.current) {
        player.current.stop()
        isRubraTalking.current = false
        setSpeaking(false)
      }

      isActive.current = false
      onTranscript(text)
      onAddMessage({ role: 'user', content: text, fromLive: true })
      onStatus('thinking')
      setListening(false)

      try {
        await fetch(`${API_URL}/api/live/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, text, lang: 'auto' })
        })
      } catch {
        onStatus('error_sending')
      }
    }

    rec.onresult = (e) => {
      if (!isActive.current) return

      if (isRubraTalking.current) {
        clearTimeout(silenceTimer)
        player.current.stop()
        isRubraTalking.current = false
        setSpeaking(false)
        onStatus('listening')
      }

      const result = e.results[e.results.length - 1]
      const text   = result[0].transcript.trim()
      if (!text) return

      clearTimeout(silenceTimer)

      if (result.isFinal) {
        accumulated += (accumulated ? ' ' : '') + text
        // 2.5s silence for faster response feel
        silenceTimer = setTimeout(() => {
          if (accumulated.trim()) sendNow()
        }, 2500) 
      }
    }

    rec.onerror = (e) => {
      if (!isActive.current) return
      if (e.error === 'not-allowed') {
        onStatus('mic_denied')
        stopMic()
      } else {
        setTimeout(() => { if (isActive.current) _startRecLoop() }, 1000)
      }
    }

    rec.onend = () => {
      if (isActive.current) {
        setTimeout(() => _startRecLoop(), 300)
      } else {
        setListening(false)
        if (!speaking) onStatus('ready')
      }
    }

    try { rec.start() } catch {}
  }, [sessionId, onTranscript, onAddMessage, onStatus, speaking])

  const startMic = useCallback(async () => {
    if (!connected || listening) return
    
    // Explicit permission request makes it bulletproof
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      isActive.current = true
      setListening(true)
      onStatus('listening')
      _startRecLoop()
    } catch (err) {
      onStatus('mic_denied')
    }
  }, [connected, listening, _startRecLoop, onStatus])

  const stopMic = useCallback(() => {
    isActive.current = false
    try { recRef.current?.stop() } catch {}
    recRef.current = null
    setListening(false)
    if (!speaking) onStatus('ready')
  }, [onStatus, speaking])

  const startCamera = useCallback(async () => {
    visionProc.current?.stop()
    try {
      const proc = new VisionProcessor(async (dataUrl) => {
        try {
          await fetch(`${API_URL}/api/live/frame`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, frame: dataUrl })
          })
        } catch {}
      })
      await proc.startCamera()
      visionProc.current = proc
      setVisionMode('camera')
      setVideoStream(proc.getStream())
    } catch (err) { onStatus(`Camera Error: Blocked or Unavailable`) }
  }, [sessionId, onStatus])

  const startScreen = useCallback(async () => {
    visionProc.current?.stop()
    try {
      const proc = new VisionProcessor(async (dataUrl) => {
        fetch(`${API_URL}/api/live/frame`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, frame: dataUrl })
        }).catch(() => {})
      })
      await proc.startScreen()
      visionProc.current = proc
      setVisionMode('screen')
      proc.getStream()?.getVideoTracks()[0]?.addEventListener('ended', () => {
        stopVision()
      })
    } catch (err) {
      if (err.name !== 'NotAllowedError') onStatus('Screen share failed')
    }
  }, [sessionId, onStatus])

  const stopVision = useCallback(() => {
    visionProc.current?.stop()
    visionProc.current = null
    setVisionMode(null); setVideoStream(null)
    fetch(`${API_URL}/api/live/frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, frame: '' })
    }).catch(() => {})
  }, [sessionId])

  return {
    connected, listening, speaking, visionMode, videoStream, audioVolume,
    connect, disconnect, startMic, stopMic,
    startCamera, startScreen, stopVision,
    toggleAudio: (v) => player.current.setEnabled(v),
    player
  }
}

// ══════════════════════════════════════════════════════
//  LIVE MODAL UI (Cinematic & Interactive)
// ══════════════════════════════════════════════════════
export default function LiveModal({ sessionId, onClose, onAddMessage }) {
  const [status,     setStatus]     = useState('disconnected')
  const [liveTokens, setLiveTokens] = useState('')
  const [transcript, setTranscript] = useState('')
  const [audioOn,    setAudioOn]    = useState(true)
  const videoRef = useRef(null)

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  const live = useRubraLive(sessionId, {
    onTranscript: (t) => { setTranscript(t); setLiveTokens('') },
    onToken:      (t) => setLiveTokens(prev => prev + t),
    onStatus:     (s) => setStatus(s),
    onAddMessage,
  })

  useEffect(() => {
    if (videoRef.current && live.videoStream) {
      videoRef.current.srcObject = live.videoStream
    }
  }, [live.videoStream])

  // Map backend status to human-readable text
  const statusConfig = {
    disconnected: { text: 'Tap Connect to start', color: 'rgba(255,255,255,0.7)', icon: null },
    connecting:   { text: 'Connecting to RUBRA...', color: '#fbbf24', icon: <Loader2 size={14} className="animate-spin" /> },
    ready:        { text: '🎤 Tap mic to speak', color: '#34d399', icon: null },
    listening:    { text: '👂 Listening...', color: '#fb7185', icon: null },
    thinking:     { text: '⚡ Thinking...', color: '#818cf8', icon: <Loader2 size={14} className="animate-spin" /> },
    mic_denied:   { text: '⚠️ Please allow microphone access', color: '#ef4444', icon: <AlertCircle size={14} /> },
    connection_dropped: { text: 'Connection lost. Reconnecting...', color: '#ef4444', icon: <AlertCircle size={14} /> },
  }

  const currentStatus = statusConfig[status] || { text: status, color: '#fff' }
  
  // Calculate dynamic scale based on AI audio volume (0.0 to 1.0)
  const dynamicScale = live.speaking ? 1 + (live.audioVolume * 0.4) : 1

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-50 flex flex-col select-none backdrop-blur-md"
      style={{ background: 'rgba(0,0,0,0.92)' }} // Softer dark background
    >
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between px-6 pt-12 pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-white/10">
            <div className={`w-2 h-2 rounded-full ${live.connected ? 'bg-emerald-400' : 'bg-rose-500'}`} 
                 style={{ boxShadow: live.connected ? '0 0 10px rgba(52,211,153,0.5)' : 'none' }} />
          </div>
          <div>
            <h2 className="text-white text-[16px] font-semibold tracking-wide">RUBRA Voice</h2>
            <p className="text-[11px] text-white/50">{live.connected ? 'Secured Connection' : 'Offline'}</p>
          </div>
        </div>
        <button onClick={() => { live.disconnect(); onClose() }}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <X size={20} color="rgba(255,255,255,0.9)"/>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 relative overflow-hidden">

        {/* Floating Vision Preview */}
        {live.visionMode === 'camera' && live.videoStream && (
          <motion.div initial={{ opacity:0, scale:0.8, x: 20 }} animate={{ opacity:1, scale:1, x: 0 }}
            className="absolute top-4 right-4 rounded-2xl overflow-hidden shadow-2xl z-10"
            style={{ width:100, height:140, border:'2px solid rgba(255,255,255,0.1)' }}>
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover"/>
            <div className="absolute bottom-2 right-2 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          </motion.div>
        )}

        {live.visionMode === 'screen' && (
          <motion.div initial={{ opacity:0, y: -20 }} animate={{ opacity:1, y: 0 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/20 border border-indigo-500/40 backdrop-blur-sm">
            <Monitor size={14} className="text-indigo-400 animate-pulse"/>
            <span className="text-[12px] font-medium text-indigo-300">Screen Sharing Active</span>
          </motion.div>
        )}

        {/* Dynamic AI Orb (The Core Experience) */}
        <div className="relative flex items-center justify-center mb-16 mt-8">
          {/* Audio reactive outer glows */}
          {[120, 160, 200].map((baseSize, i) => {
            const size = live.speaking ? baseSize + (live.audioVolume * 100) : baseSize;
            return (
              <motion.div key={i} className="absolute rounded-full pointer-events-none"
                style={{
                  width: size, height: size,
                  background: live.speaking
                    ? `radial-gradient(circle, rgba(99,102,241,${0.15-i*0.04}) 0%, transparent 70%)`
                    : live.listening
                    ? `radial-gradient(circle, rgba(244,63,94,${0.12-i*0.03}) 0%, transparent 70%)`
                    : `radial-gradient(circle, rgba(255,255,255,${0.03-i*0.01}) 0%, transparent 70%)`,
                }}
                animate={
                  live.listening ? { scale:[1, 1.1+i*0.05, 1], opacity:[0.5, 0.8, 0.5] } : {}
                }
                transition={{ repeat:Infinity, duration:2 + i*0.5 }}
              />
            )
          })}
          
          {/* Main Core */}
          <motion.div className="relative w-24 h-24 rounded-full flex items-center justify-center z-10"
            style={{
              background: live.speaking
                ? 'radial-gradient(circle at 30% 30%, #818cf8, #3730a3)'
                : live.listening
                ? 'radial-gradient(circle at 30% 30%, #fb7185, #9f1239)'
                : live.connected
                ? 'radial-gradient(circle at 30% 30%, #334155, #0f172a)'
                : 'radial-gradient(circle at 30% 30%, #1e1e2f, #000)',
              boxShadow: live.speaking ? '0 0 60px rgba(99,102,241,0.6), inset 0 0 20px rgba(255,255,255,0.4)'
                : live.listening ? '0 0 50px rgba(244,63,94,0.5)' : 'inset 0 0 10px rgba(255,255,255,0.1)',
            }}
            animate={{ scale: dynamicScale }} // Real-time audio reactivity
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            {/* Center icon logic based on state */}
            {live.speaking ? (
               <div className="flex gap-1 items-center justify-center">
                 {[1, 2, 3].map((bar) => (
                   <motion.div key={bar} className="w-1.5 bg-white rounded-full"
                     animate={{ height: [8, 16 + (live.audioVolume*30), 8] }}
                     transition={{ repeat: Infinity, duration: 0.5 + (bar*0.1) }}
                   />
                 ))}
               </div>
            ) : live.listening ? (
              <Mic size={32} color="rgba(255,255,255,0.9)" className="animate-pulse" />
            ) : (
              <svg width="34" height="34" viewBox="0 0 24 24">
                <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5"/>
              </svg>
            )}
          </motion.div>
        </div>

        {/* Text Interface (Subtitles) */}
        <div className="w-full max-w-sm text-center space-y-4 min-h-[100px] flex flex-col items-center">
          {/* Status Badge */}
          <motion.div key={status} initial={{ opacity:0, y:5 }} animate={{ opacity:1, y:0 }}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10">
            {currentStatus.icon}
            <span className="text-[13px] font-medium tracking-wide" style={{ color: currentStatus.color }}>
              {currentStatus.text}
            </span>
          </motion.div>

          {transcript && !liveTokens && (
            <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }}
              className="text-[14px] italic text-white/40 px-4">
              "{transcript}"
            </motion.p>
          )}
          {liveTokens && (
            <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }}
              className="text-[16px] leading-relaxed text-white/90 font-medium px-2">
              {liveTokens}
              {live.speaking && (
                <motion.span className="inline-block w-1 h-[16px] ml-1 bg-indigo-400 align-middle rounded-sm"
                  animate={{ opacity:[1,0] }} transition={{ repeat:Infinity, duration:0.7, ease:'steps(2)' }}/>
              )}
            </motion.p>
          )}
        </div>
      </div>

      {/* Control Dock */}
      <div className="flex-shrink-0 pb-10 px-6 w-full max-w-md mx-auto">
        {!live.connected ? (
          <motion.button onClick={live.connect}
            whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
            className="w-full py-4 rounded-2xl text-[16px] font-bold text-white flex items-center justify-center gap-2"
            style={{ background:'linear-gradient(135deg, #4f46e5, #3730a3)', boxShadow:'0 10px 30px rgba(79,70,229,0.3)' }}>
            Start Live Session
          </motion.button>
        ) : (
          <div className="flex items-center justify-between bg-white/5 p-2 rounded-full border border-white/10 backdrop-blur-xl">

            {/* Camera */}
            <motion.button
              onClick={live.visionMode === 'camera' ? live.stopVision : live.startCamera}
              whileTap={{ scale:0.9 }}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${live.visionMode === 'camera' ? 'bg-emerald-500/20' : 'hover:bg-white/10'}`}>
              {live.visionMode === 'camera' ? <VideoOff size={20} color="#34d399"/> : <Video size={20} color="rgba(255,255,255,0.7)"/>}
            </motion.button>

            {/* Screen Share (Hidden on Mobile for safety) */}
            {!isMobile && (
              <motion.button
                onClick={live.visionMode === 'screen' ? live.stopVision : live.startScreen}
                whileTap={{ scale:0.9 }}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${live.visionMode === 'screen' ? 'bg-indigo-500/20' : 'hover:bg-white/10'}`}>
                {live.visionMode === 'screen' ? <MonitorOff size={20} color="#818cf8"/> : <Monitor size={20} color="rgba(255,255,255,0.7)"/>}
              </motion.button>
            )}

            {/* Primary Action: MIC */}
            <motion.button
              onClick={live.listening ? live.stopMic : live.startMic}
              whileTap={{ scale:0.9 }}
              className="w-16 h-16 rounded-full flex items-center justify-center relative -mt-6 shadow-2xl"
              style={{
                background: live.listening ? '#1e293b' : 'linear-gradient(135deg, #f43f5e, #be123c)',
                border: live.listening ? '2px solid rgba(255,255,255,0.1)' : 'none',
              }}>
              {live.listening ? <MicOff size={24} color="#f87171"/> : <Mic size={24} color="white"/>}
            </motion.button>

            {/* Audio Toggle */}
            <motion.button
              onClick={() => { const n = !audioOn; setAudioOn(n); live.toggleAudio(n) }}
              whileTap={{ scale:0.9 }}
              className="w-12 h-12 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
              {audioOn ? <Volume2 size={20} color="rgba(255,255,255,0.7)"/> : <VolumeX size={20} color="#f87171"/>}
            </motion.button>

            {/* End Session */}
            <motion.button
              onClick={() => { live.disconnect(); onClose() }}
              whileTap={{ scale:0.9 }}
              className="w-12 h-12 rounded-full flex items-center justify-center hover:bg-rose-500/20 transition-colors">
              <X size={20} color="#f87171"/>
            </motion.button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
