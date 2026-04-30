import { useState, useCallback, useRef } from 'react'
import { v4 as uid } from 'uuid'
import {
  streamChat as apiStreamChat,
  streamUpload as apiStreamUpload,
  speakWithClonedVoice,
  speakWithWebSpeech,
  stopAudio,
  createSpeechRecognizer,
  uploadVoiceSample,
} from '../api/client'

const BASE = import.meta.env.VITE_API_URL || ''

export function useChat() {
  const [messages, setMessages] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [sessionId, setSessionId] = useState(() => uid())
  const [sessions, setSessions] = useState(loadLocal)
  const [agent, setAgent] = useState(null)
  const [intent, setIntent] = useState(null)
  const [toolResult, setToolResult] = useState(null)
  const [error, setError] = useState(null)
  const [ttsEnabled, setTtsEnabled] = useState(false)        // NEW
  const [voiceId, setVoiceId] = useState('rubra_voice')    // NEW
  const [isSpeaking, setIsSpeaking] = useState(false)      // NEW
  const stopRef = useRef(false)
  const lastAssistantMsg = useRef('')

  // ... existing addMsg, appendTok functions ...

  const addMsg = (role, content, extra = {}) => {
    const msg = { id: uid(), role, content, ts: Date.now(), ...extra }
    setMessages(prev => [...prev, msg])
    return msg.id
  }

  const appendTok = useCallback((id, tok) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, content: m.content + tok } : m))
  }, [])

  // ── Auto TTS when assistant finishes ─────────────────
  const speakLastMessage = useCallback(async (text) => {
    if (!ttsEnabled || !text.trim()) return
    setIsSpeaking(true)
    lastAssistantMsg.current = text
    try {
      await speakWithClonedVoice(text, voiceId)
    } catch (e) {
      console.warn('Cloned voice failed, using fallback:', e)
      speakWithWebSpeech(text)
    }
    setIsSpeaking(false)
  }, [ttsEnabled, voiceId])

  // ── Send text message ────────────────────────────────
  const send = useCallback(async (text, taskType = null, mode = null) => {
    if (!text.trim() || streaming) return
    setError(null); setToolResult(null); stopRef.current = false
    
    // Stop any playing audio when user sends new message
    stopAudio()
    setIsSpeaking(false)
    
    addMsg('user', text)
    setStreaming(true)
    const aid = uid()
    setMessages(prev => [...prev, { id: aid, role: 'assistant', content: '', ts: Date.now(), agent: null, intent: null }])
    
    let fullResponse = ''
    
    try {
      for await (const tok of apiStreamChat({
        message: text,
        sessionId,
        taskType,
        mode,
        onMeta: (e) => {
          setAgent(e.agent)
          setIntent(e.intent)
          setMessages(prev => prev.map(m => m.id === aid ? { ...m, agent: e.agent, intent: e.intent } : m))
        },
        onTool: (e) => setToolResult(e)
      })) {
        if (stopRef.current) break
        appendTok(aid, tok)
        fullResponse += tok
      }
    } catch (e) {
      setError(e.message)
      setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: `❌ ${e.message}`, isError: true } : m))
    }
    
    setStreaming(false)
    
    // Auto speak the complete response
    if (fullResponse && !stopRef.current) {
      speakLastMessage(fullResponse)
    }
    
    // Save session
    setSessions(prev => {
      const upd = [{ id: sessionId, title: text.slice(0, 45), ts: Date.now() }, ...prev.filter(s => s.id !== sessionId)].slice(0, 30)
      saveLocal(upd)
      return upd
    })
  }, [streaming, sessionId, appendTok, speakLastMessage])

  // ── Send voice message (STT → send → TTS) ────────────
  const sendVoice = useCallback(async (transcribedText) => {
    if (!transcribedText.trim()) return
    // Just send as text — TTS will auto-play response
    await send(transcribedText, null, null)
  }, [send])

  // ── Toggle TTS ───────────────────────────────────────
  const toggleTTS = useCallback(() => {
    setTtsEnabled(prev => {
      const next = !prev
      if (!next) {
        stopAudio()
        setIsSpeaking(false)
      }
      return next
    })
  }, [])

  // ── Stop everything ──────────────────────────────────
  const stop = useCallback(() => {
    stopRef.current = true
    setStreaming(false)
    stopAudio()
    setIsSpeaking(false)
  }, [])

  // ... existing sendFile, newSession, loadSession, editResend ...

  const sendFile = useCallback(async (file, question = '', mode = '') => {
    // ... existing file upload logic ...
  }, [streaming, sessionId, appendTok])

  const newSession = useCallback(() => {
    setMessages([])
    setSessionId(uid())
    setAgent(null)
    setIntent(null)
    setToolResult(null)
    setError(null)
    stopAudio()
    setIsSpeaking(false)
  }, [])

  const loadSession = useCallback(async (id) => {
    try {
      const d = await (await fetch(`${BASE}/api/sessions/${id}`)).json()
      setMessages((d.messages || []).map(m => ({ id: uid(), role: m.role, content: m.content, ts: Date.now() })))
      setSessionId(id)
    } catch { }
  }, [])

  const editResend = useCallback((msgId, newText, taskType = null) => {
    const idx = messages.findIndex(m => m.id === msgId)
    if (idx < 0) return
    setMessages(prev => prev.slice(0, idx))
    send(newText, taskType)
  }, [messages, send])

  return {
    messages,
    streaming,
    sessionId,
    sessions,
    agent,
    intent,
    toolResult,
    error,
    ttsEnabled,        // NEW
    isSpeaking,        // NEW
    voiceId,           // NEW
    send,
    sendFile,
    sendVoice,         // NEW
    toggleTTS,         // NEW
    setVoiceId,        // NEW
    newSession,
    loadSession,
    editResend,
    stop,
  }
}

// Local storage helpers
function loadLocal() {
  try { return JSON.parse(localStorage.getItem('rubra_v6') || '[]') }
  catch { return [] }
}
function saveLocal(s) {
  try { localStorage.setItem('rubra_v6', JSON.stringify(s.slice(0, 30))) }
  catch { }
}
