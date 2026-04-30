/**
 * RUBRA API Client — with Voice Support
 */

const BASE = import.meta.env.VITE_API_URL || ''

if (!BASE && typeof window !== 'undefined') {
  console.warn('⚠️ VITE_API_URL not set.')
}

export const API_BASE = BASE

// ═══════════════════════════════════════════════════════
//  STREAMING CHAT (existing)
// ═══════════════════════════════════════════════════════
export async function* streamChat({ message, sessionId, taskType, mode, onMeta, onTool }) {
  const resp = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId, task_type: taskType, mode }),
  })
  if (!resp.ok) throw new Error(`API error ${resp.status}`)
  yield* parseSSE(resp, onMeta, onTool)
}

export async function* streamUpload({ file, sessionId, question, mode, onMeta }) {
  const form = new FormData()
  form.append('file', file)
  form.append('session_id', sessionId || '')
  form.append('question', question || '')
  form.append('mode', mode || '')
  const resp = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form })
  if (!resp.ok) throw new Error(`Upload error ${resp.status}`)
  yield* parseSSE(resp, onMeta, null)
}

async function* parseSSE(resp, onMeta, onTool) {
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const lines = decoder.decode(value).split('\n')
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') return
      try {
        const evt = JSON.parse(raw)
        if (evt.type === 'meta' && onMeta) onMeta(evt)
        if (evt.type === 'tool_result' && onTool) onTool(evt)
        if (evt.type === 'token') yield evt.content
        if (evt.type === 'error') throw new Error(evt.message)
      } catch (e) {
        if (e.message && !e.message.startsWith('Unexpected')) throw e
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
//  VOICE: Text-to-Speech (Backend)
// ═══════════════════════════════════════════════════════

let currentAudio = null

/**
 * Speak text using cloned voice (backend TTS)
 */
export async function speakWithClonedVoice(text, voiceId = 'rubra_voice') {
  // Stop any current audio
  stopAudio()
  
  // Clean text
  const cleanText = text
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`[^`]+`/g, '$1')
    .replace(/\*\*|\*|__|_/g, '')
    .slice(0, 500)
  
  if (!cleanText.trim()) return

  try {
    const resp = await fetch(`${BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanText,
        voice_id: voiceId,
        lang: detectLanguage(text)
      }),
    })

    if (!resp.ok) {
      // Fallback to Web Speech API
      console.warn('Backend TTS failed, using Web Speech')
      speakWithWebSpeech(text)
      return
    }

    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    currentAudio = new Audio(url)
    
    return new Promise((resolve) => {
      currentAudio.onended = () => {
        URL.revokeObjectURL(url)
        resolve()
      }
      currentAudio.onerror = () => {
        URL.revokeObjectURL(url)
        speakWithWebSpeech(text) // Fallback
        resolve()
      }
      currentAudio.play()
    })
  } catch (e) {
    console.warn('TTS error:', e)
    speakWithWebSpeech(text) // Fallback
  }
}

export function stopAudio() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

// ═══════════════════════════════════════════════════════
//  VOICE: Web Speech API Fallback
// ═══════════════════════════════════════════════════════

export function speakWithWebSpeech(text, lang = 'en-US') {
  if (!window.speechSynthesis) return

  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.92
  utterance.pitch = 0.95
  utterance.volume = 0.95

  // Detect Bengali
  if (/[\u0980-\u09FF]/.test(text)) {
    utterance.lang = 'bn-BD'
    utterance.rate = 0.88
  } else {
    utterance.lang = lang
  }

  // Select female voice
  const voices = window.speechSynthesis.getVoices()
  const femaleVoice = voices.find(v => 
    v.name.includes('Female') || 
    v.name.includes('Jenny') ||
    v.name.includes('Aria') ||
    v.name.includes('Zira') ||
    v.name.includes('Google US English')
  ) || voices.find(v => v.lang.startsWith(lang.split('-')[0])) || voices[0]
  
  if (femaleVoice) utterance.voice = femaleVoice

  window.speechSynthesis.speak(utterance)
  return utterance
}

// ═══════════════════════════════════════════════════════
//  VOICE: Speech-to-Text (Web Speech API)
// ═══════════════════════════════════════════════════════

export function createSpeechRecognizer({ onResult, onError, onEnd, lang = 'bn-BD' }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    onError?.('Speech recognition not supported. Use Chrome/Edge.')
    return null
  }

  const rec = new SpeechRecognition()
  rec.continuous = false
  rec.interimResults = true
  rec.lang = lang

  rec.onresult = (e) => {
    let final = ''
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const transcript = e.results[i][0].transcript
      if (e.results[i].isFinal) final += transcript
      else interim += transcript
    }
    onResult?.(final, interim)
  }

  rec.onerror = (e) => {
    const errors = {
      'no-speech': 'কথা শোনা যায়নি। আবার চেষ্টা করুন। (No speech detected)',
      'audio-capture': 'মাইক্রোফোন পাওয়া যায়নি। (No microphone)',
      'not-allowed': 'মাইক্রোফোন permission দিন। (Permission denied)',
      'network': 'Network error। Internet চেক করুন।',
    }
    onError?.(errors[e.error] || `Error: ${e.error}`)
  }

  rec.onend = () => onEnd?.()

  return rec
}

// ═══════════════════════════════════════════════════════
//  VOICE: Upload voice sample for cloning
// ═══════════════════════════════════════════════════════

export async function uploadVoiceSample(file, name = 'rubra_voice') {
  const form = new FormData()
  form.append('file', file)
  form.append('name', name)
  
  const resp = await fetch(`${BASE}/api/voice/clone`, {
    method: 'POST',
    body: form
  })
  return resp.json()
}

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function detectLanguage(text) {
  if (/[\u0980-\u09FF]/.test(text)) return 'bn'
  return 'en'
}

// Existing helpers
export async function getSessions() {
  try { return (await fetch(`${BASE}/api/sessions`, { signal: AbortSignal.timeout(5000) })).json() }
  catch { return { sessions: [] } }
}
export async function getSession(id) { return (await fetch(`${BASE}/api/sessions/${id}`)).json() }
export async function deleteSession(id) { return fetch(`${BASE}/api/sessions/${id}`, { method: 'DELETE' }) }
export async function getStatus() {
  if (!BASE) return null
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) })
    return r.ok ? await r.json() : null
  } catch { return null }
}
export async function getTrending() {
  try { return (await fetch(`${BASE}/api/trending`, { signal: AbortSignal.timeout(8000) })).json() }
  catch { return null }
}
export async function getVoices() {
  try { return (await fetch(`${BASE}/api/voices`)).json() }
  catch { return { cloned: [], edge_tts: [] } }
}
