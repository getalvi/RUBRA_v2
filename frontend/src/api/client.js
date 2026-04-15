// RUBRA API Client
// VITE_API_URL is set in .env.production (your HuggingFace Space URL)
// In local dev, empty string = vite proxy forwards /api to localhost:8000
const BASE = import.meta.env.VITE_API_URL || ''

export async function* streamChat({ message, sessionId, taskType, mode, onMeta, onTool }) {
  const resp = await fetch(`${BASE}/api/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      message,
      session_id: sessionId,
      task_type:  taskType || null,
      mode:       mode || null,
    }),
  })
  if (!resp.ok) throw new Error(`API error ${resp.status}`)
  yield* parseSSE(resp, onMeta, onTool)
}

export async function* streamUpload({ file, sessionId, question, mode, onMeta }) {
  const form = new FormData()
  form.append('file',       file)
  form.append('session_id', sessionId || '')
  form.append('question',   question  || '')
  form.append('mode',       mode      || '')
  const resp = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form })
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
        if (e.message && !e.message.startsWith('Unexpected token')) throw e
      }
    }
  }
}

export async function getSessions()     { try { return (await fetch(`${BASE}/api/sessions`)).json() } catch { return {sessions:[]} } }
export async function getSession(id)    { return (await fetch(`${BASE}/api/sessions/${id}`)).json() }
export async function deleteSession(id) { return fetch(`${BASE}/api/sessions/${id}`, { method: 'DELETE' }) }
export async function getStatus()       { try { return (await fetch(`${BASE}/api/status`, {signal: AbortSignal.timeout(5000)})).json() } catch { return null } }
export async function getTrending()     { try { return (await fetch(`${BASE}/api/trending`)).json() } catch { return null } }
