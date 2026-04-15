const BASE = import.meta.env.VITE_API_URL || ''  // empty = use vite proxy

export async function* streamChat({ message, sessionId, taskType, onMeta, onTool }) {
  const resp = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId, task_type: taskType || null }),
  })
  if (!resp.ok) throw new Error(`API ${resp.status}`)
  yield* parseSSE(resp, onMeta, onTool)
}

export async function* streamUpload({ file, sessionId, question, onMeta }) {
  const form = new FormData()
  form.append('file', file)
  form.append('session_id', sessionId || '')
  form.append('question', question || '')
  const resp = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form })
  if (!resp.ok) throw new Error(`Upload ${resp.status}`)
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
      } catch (e) {
        if (e.message && e.message !== 'Unexpected') throw e
      }
    }
  }
}

export async function getSessions()       { return (await fetch(`${BASE}/api/sessions`)).json() }
export async function getSession(id)      { return (await fetch(`${BASE}/api/sessions/${id}`)).json() }
export async function deleteSession(id)   { return fetch(`${BASE}/api/sessions/${id}`, { method: 'DELETE' }) }
export async function getStatus()         { try { return (await fetch(`${BASE}/api/status`)).json() } catch { return null } }