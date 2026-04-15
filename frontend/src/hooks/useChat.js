import { useState, useCallback, useRef } from 'react'
import { v4 as uid } from 'uuid'

const BASE = import.meta.env.VITE_API_URL || ''

async function* streamAPI(url, body, onMeta, onTool) {
  const resp = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
  if (!resp.ok) throw new Error(`API ${resp.status}`)
  const reader = resp.body.getReader()
  const dec    = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of dec.decode(value).split('\n')) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') return
      try {
        const evt = JSON.parse(raw)
        if (evt.type === 'meta'        && onMeta) onMeta(evt)
        if (evt.type === 'tool_result' && onTool) onTool(evt)
        if (evt.type === 'token')       yield evt.content
        if (evt.type === 'error')       throw new Error(evt.message)
      } catch(e) { if (e.message !== 'Unexpected token') throw e }
    }
  }
}

async function* streamUpload(file, sessionId, question, mode, onMeta) {
  const form = new FormData()
  form.append('file', file)
  form.append('session_id', sessionId || '')
  form.append('question', question || '')
  form.append('mode', mode || '')
  const resp = await fetch(`${BASE}/api/upload`, { method:'POST', body:form })
  if (!resp.ok) throw new Error(`Upload ${resp.status}`)
  const reader = resp.body.getReader()
  const dec    = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of dec.decode(value).split('\n')) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') return
      try {
        const evt = JSON.parse(raw)
        if (evt.type === 'meta'  && onMeta) onMeta(evt)
        if (evt.type === 'token') yield evt.content
        if (evt.type === 'error') throw new Error(evt.message)
      } catch(e) { if (e.message !== 'Unexpected token') throw e }
    }
  }
}

function loadLocal() { try { return JSON.parse(localStorage.getItem('rubra_v6') || '[]') } catch { return [] } }
function saveLocal(s) { try { localStorage.setItem('rubra_v6', JSON.stringify(s.slice(0,30))) } catch {} }

export function useChat() {
  const [messages,  setMessages]  = useState([])
  const [streaming, setStreaming] = useState(false)
  const [sessionId, setSessionId] = useState(() => uid())
  const [sessions,  setSessions]  = useState(loadLocal)
  const [agent,     setAgent]     = useState(null)
  const [intent,    setIntent]    = useState(null)
  const [toolResult,setToolResult]= useState(null)
  const [error,     setError]     = useState(null)
  const stopRef = useRef(false)

  const addMsg = (role, content, extra={}) => {
    const msg = { id:uid(), role, content, ts:Date.now(), ...extra }
    setMessages(prev => [...prev, msg])
    return msg.id
  }

  const appendTok = useCallback((id, tok) => {
    setMessages(prev => prev.map(m => m.id===id ? {...m, content:m.content+tok} : m))
  }, [])

  const send = useCallback(async (text, taskType=null) => {
    if (!text.trim() || streaming) return
    setError(null); setToolResult(null); stopRef.current=false
    addMsg('user', text)
    setStreaming(true)
    const aid = uid()
    setMessages(prev => [...prev, {id:aid, role:'assistant', content:'', ts:Date.now(), agent:null, intent:null}])
    try {
      for await (const tok of streamAPI(`${BASE}/api/chat`,
        { message:text, session_id:sessionId, task_type:taskType||null,
          mode: taskType==='tutor' ? 'tutor' : null },
        (e) => { setAgent(e.agent); setIntent(e.intent); setMessages(prev => prev.map(m => m.id===aid ? {...m, agent:e.agent, intent:e.intent} : m)) },
        (e) => setToolResult(e)
      )) {
        if (stopRef.current) break
        appendTok(aid, tok)
      }
    } catch(e) {
      setError(e.message)
      setMessages(prev => prev.map(m => m.id===aid ? {...m, content:`❌ ${e.message}`, isError:true} : m))
    }
    setStreaming(false)
    setSessions(prev => {
      const upd = [{id:sessionId, title:text.slice(0,45), ts:Date.now()}, ...prev.filter(s=>s.id!==sessionId)].slice(0,30)
      saveLocal(upd); return upd
    })
  }, [streaming, sessionId, appendTok])

  const sendFile = useCallback(async (file, question='', mode='') => {
    if (streaming) return
    setStreaming(true); stopRef.current=false
    const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.name)
    addMsg('user', `${isImg?'🖼':'📎'} ${file.name}${question ? ` — ${question}` : ''}`)
    const aid = uid()
    setMessages(prev => [...prev, {id:aid, role:'assistant', content:'', ts:Date.now(), agent:mode==='tutor'?'SmartTutorAgent':'FileAgent', intent:'file'}])
    try {
      for await (const tok of streamUpload(file, sessionId, question, mode,
        (e) => { setAgent(e.agent); setIntent('file') }
      )) {
        if (stopRef.current) break
        appendTok(aid, tok)
      }
    } catch(e) {
      setMessages(prev => prev.map(m => m.id===aid ? {...m, content:`❌ ${e.message}`, isError:true} : m))
    }
    setStreaming(false)
  }, [streaming, sessionId, appendTok])

  const newSession = useCallback(() => {
    setMessages([]); setSessionId(uid()); setAgent(null); setIntent(null); setToolResult(null); setError(null)
  }, [])

  const loadSession = useCallback(async (id) => {
    try {
      const d = await (await fetch(`${BASE}/api/sessions/${id}`)).json()
      setMessages((d.messages||[]).map(m => ({id:uid(), role:m.role, content:m.content, ts:Date.now()})))
      setSessionId(id)
    } catch {}
  }, [])

  const editResend = useCallback((msgId, newText, taskType=null) => {
    const idx = messages.findIndex(m => m.id===msgId)
    if (idx<0) return
    setMessages(prev => prev.slice(0, idx))
    send(newText, taskType)
  }, [messages, send])

  const stop = useCallback(() => { stopRef.current=true; setStreaming(false) }, [])

  return { messages, streaming, sessionId, sessions, agent, intent, toolResult, error, send, sendFile, newSession, loadSession, editResend, stop }
}