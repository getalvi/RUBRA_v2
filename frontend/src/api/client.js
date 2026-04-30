 /**
 * RUBRA API Client
 * 
 * VITE_API_URL must be set in Vercel:
 * Settings → Environment Variables → VITE_API_URL = your HuggingFace URL
 * 
 * Example: https://yourname-rubra-backend.hf.space 
 */

const BASE = import.meta.env.VITE_API_URL || ''

// Warn in console if not configured
if (!BASE && typeof window !== 'undefined') {
  console.warn('⚠️ VITE_API_URL not set. Set it in Vercel Environment Variables.')
}

export const API_BASE = BASE

export async function* streamChat({ message, sessionId, taskType, mode, onMeta, onTool }) {
  const url = `${BASE}/api/chat`
  let resp
  try {
    resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        message,
        session_id: sessionId,
        task_type:  taskType || null,
        mode:       mode     || null,
      }),
    })
  } catch (e) {
    throw new Error(`Cannot reach backend. Check VITE_API_URL in Vercel settings.`)
  }
  if (!resp.ok) throw new Error(`API error ${resp.status}`)
  yield* parseSSE(resp, onMeta, onTool)
}

export async function* streamUpload({ file, sessionId, question, mode, onMeta }) {
  const form = new FormData()
  form.append('file',       file)
  form.append('session_id', sessionId || '')
  form.append('question',   question  || '')
  form.append('mode',       mode      || '')
  let resp
  try {
    resp = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form })
  } catch (e) {
    throw new Error('Cannot reach backend for file upload.')
  }
  if (!resp.ok) throw new Error(`Upload error ${resp.status}`)
  yield* parseSSE(resp, onMeta, null)
}

async function* parseSSE(resp, onMeta, onTool) {
  const reader  = resp.body.getReader()
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
        if (evt.type === 'meta'        && onMeta) onMeta(evt)
        if (evt.type === 'tool_result' && onTool) onTool(evt)
        if (evt.type === 'token')       yield evt.content
        if (evt.type === 'error')       throw new Error(evt.message)
      } catch(e) {
        if (e.message && !e.message.startsWith('Unexpected')) throw e
      }
    }
  }
}

export async function getSessions()     {
  try { return (await fetch(`${BASE}/api/sessions`, {signal: AbortSignal.timeout(5000)})).json() }
  catch { return { sessions: [] } }
}
export async function getSession(id)    { return (await fetch(`${BASE}/api/sessions/${id}`)).json() }
export async function deleteSession(id) { return fetch(`${BASE}/api/sessions/${id}`, { method: 'DELETE' }) }
export async function getStatus()       {
  if (!BASE) return null   // No URL = offline immediately
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) })
    return r.ok ? await r.json() : null
  } catch { return null }
}
export async function getTrending()     {
  try { return (await fetch(`${BASE}/api/trending`, {signal: AbortSignal.timeout(8000)})).json() }
  catch { return null }
}
