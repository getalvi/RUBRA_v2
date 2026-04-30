const BASE = import.meta.env.VITE_API_URL || ''

if (!BASE && typeof window !== 'undefined') {
  console.warn('⚠️ VITE_API_URL not set.')
}

export const API_BASE = BASE

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

// ── VOICE: TTS ────────────────────────────────────────

let currentAudio = null

export async function speakWithClonedVoice(text, voiceId = 'rubra_voice') {
  stopAudio()
  const cleanText = text.replace(/```[\s\S]*?```/g, '[code]').replace(/`[^`]+`/g, '$1').replace(/\*\*|\*|__|_/g, '').slice(0, 500)
  if (!cleanText.trim()) return

  try {
    const resp = await fetch(`${BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanText, voice_id: voiceId, lang: /[\u0980-\u09FF]/.test(text) ? 'bn' : 'en' }),
    })
    if (!resp.ok) throw new Error('TTS failed')
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    currentAudio = new Audio(url)
    await new Promise((resolve) => {
      currentAudio.onended = () => { URL.revokeObjectURL(url); resolve() }
      currentAudio.onerror = () => { URL.revokeObjectURL(url); resolve() }
      currentAudio.play()
    })
  } catch (e) {
    speakWithWebSpeech(text)
  }
}

export function speakWithWebSpeech(text, lang = 'en-US') {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.92
  utterance.pitch = 0.95
  utterance.volume = 0.95
  utterance.lang = /[\u0980-\u09FF]/.test(text) ? 'bn-BD' : lang
  const voices = window.speechSynthesis.getVoices()
  const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Jenny') || v.name.includes('Aria') || v.name.includes('Google')) || voices[0]
  if (femaleVoice) utterance.voice = femaleVoice
  window.speechSynthesis.speak(utterance)
}

export function stopAudio() {
  if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; currentAudio = null }
  if (window.speechSynthesis) window.speechSynthesis.cancel()
}

// ── VOICE: STT ────────────────────────────────────────

export function createSpeechRecognizer({ onResult, onError, onEnd, lang = 'bn-BD' }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) { onError?.('Speech recognition not supported. Use Chrome/Edge.'); return null }
  const rec = new SpeechRecognition()
  rec.continuous = false
  rec.interimResults = true
  rec.lang = lang
  rec.onresult = (e) => {
    let final = '', interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript
      if (e.results[i].isFinal) final += t
      else interim += t
    }
    onResult?.(final, interim)
  }
  rec.onerror = (e) => {
    const errors = { 'no-speech': 'কথা শোনা যায়নি। আবার চেষ্টা করুন।', 'audio-capture': 'মাইক্রোফোন পাওয়া যায়নি।', 'not-allowed': 'মাইক্রোফোন permission দিন।', 'network': 'Network error।' }
    onError?.(errors[e.error] || `Error: ${e.error}`)
  }
  rec.onend = () => onEnd?.()
  return rec
}

// ── HELPERS ───────────────────────────────────────────

export async function getSessions() {
  try { return (await fetch(`${BASE}/api/sessions`, { signal: AbortSignal.timeout(5000) })).json() }
  catch { return { sessions: [] } }
}
export async function getSession(id) { return (await fetch(`${BASE}/api/sessions/${id}`)).json() }
export async function deleteSession(id) { return fetch(`${BASE}/api/sessions/${id}`, { method: 'DELETE' }) }
export async function getStatus() {
  if (!BASE) return null
  try { const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) }); return r.ok ? await r.json() : null }
  catch { return null }
}
export async function getTrending() {
  try { return (await fetch(`${BASE}/api/trending`, { signal: AbortSignal.timeout(8000) })).json() }
  catch { return null }
}
