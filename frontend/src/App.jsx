// frontend/src/App.jsx — COMPLETE FILE

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useChat } from './hooks/useChat'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import ChatArea from './components/ChatArea'
import InputBar from './components/InputBar'
import ArtifactPanel from './components/ArtifactPanel'
import { getStatus } from './api/client'

function extractArtifacts(messages) {
  const artifacts = []
  const seen = new Set()

  for (const msg of messages) {
    if (msg.role !== 'assistant' || !msg.content) continue

    const codeBlockRe = /```(\w+)?\n([\s\S]*?)```/g
    let match
    while ((match = codeBlockRe.exec(msg.content)) !== null) {
      const lang = (match[1] || 'code').toLowerCase()
      const code = match[2].trim()

      if (code.split('\n').length < 4 && code.length < 200) continue
      if (['bash','sh','shell','cmd','powershell','text','txt','markdown','md'].includes(lang)) continue

      const key = lang + ':' + code.slice(0, 80)
      if (seen.has(key)) continue
      seen.add(key)

      let title = ''
      const commentMatch   = code.match(/(?:\/\/|#|\/\*)\s*(.{4,50}?)(?:\*\/|\n|$)/)
      const functionMatch  = code.match(/(?:function|def|class|const|let|var)\s+([A-Za-z][A-Za-z0-9_]{2,30})/)
      const componentMatch = code.match(/export\s+(?:default\s+)?(?:function|class)\s+([A-Za-z][A-Za-z0-9_]{2,30})/)
      if (componentMatch) title = componentMatch[1]
      else if (functionMatch) title = functionMatch[1]
      else if (commentMatch) title = commentMatch[1].trim()
      else title = lang.charAt(0).toUpperCase() + lang.slice(1) + ' Code'

      artifacts.push({
        id: msg.id + '_' + artifacts.length,
        lang,
        code,
        title,
        msgId: msg.id,
        timestamp: msg.timestamp || Date.now(),
      })
    }
  }
  return artifacts
}

export default function App() {
  const chat = useChat()
  const [sidebarOpen, setSidebar] = useState(false)
  const [online, setOnline] = useState(null)
  const [appMode, setAppMode] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [activeArtifactId, setActiveArtifactId] = useState(null)

  const artifacts = extractArtifacts(chat.messages)

  useEffect(() => {
    if (artifacts.length > 0) {
      const latest = artifacts[artifacts.length - 1]
      setActiveArtifactId(latest.id)
      if (chat.intent === 'code' || chat.agent === 'CodingAgent') {
        setPanelOpen(true)
      }
    }
  }, [artifacts.length, chat.intent, chat.agent])

  useEffect(() => {
    if (chat.messages.length === 0) {
      setPanelOpen(false)
      setActiveArtifactId(null)
    }
  }, [chat.sessionId])

  useEffect(() => {
    getStatus().then(d => setOnline(!!d)).catch(() => setOnline(false))
    const t = setInterval(
      () => getStatus().then(d => setOnline(!!d)).catch(() => setOnline(false)),
      20000
    )
    return () => clearInterval(t)
  }, [])

  const handleSend = useCallback((message, taskType = null, mode = null) => {
    chat.send(message, taskType, mode || appMode)
  }, [chat, appMode])

  const handleArtifactContinue = useCallback((lastChunk) => {
    const continueMsg = `[RUBRA_CONTINUE]${lastChunk}`
    chat.send(continueMsg, 'code', null)
  }, [chat])

  const handleOpenArtifact = useCallback((artifactId) => {
    setActiveArtifactId(artifactId)
    setPanelOpen(true)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0f0f] text-white">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebar(false)}
        />
      )}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebar(false)}
        sessions={chat.sessions}
        currentId={chat.sessionId}
        onNew={() => { chat.newSession(); setSidebar(false) }}
        onLoad={(id) => { chat.loadSession(id); setSidebar(false) }}
      />

      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <TopBar
          onMenu={() => setSidebar(true)}
          agent={chat.agent}
          intent={chat.intent}
          streaming={chat.streaming}
          online={online}
          onNew={chat.newSession}
          appMode={appMode}
          artifactCount={artifacts.length}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen(p => !p)}
          ttsEnabled={chat.ttsEnabled}
          isSpeaking={chat.isSpeaking}
          onToggleTTS={chat.toggleTTS}
        />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className={`flex flex-col min-w-0 transition-all duration-300 ${
            panelOpen ? 'flex-[1_1_0] min-w-[320px]' : 'flex-1'
          }`}>
            <ChatArea
              messages={chat.messages}
              streaming={chat.streaming}
              toolResult={chat.toolResult}
              onEdit={chat.editResend}
              onSuggest={(q) => handleSend(q)}
              appMode={appMode}
              online={online}
              artifacts={artifacts}
              activeArtifactId={activeArtifactId}
              onOpenArtifact={handleOpenArtifact}
            />
            <InputBar
              onSend={handleSend}
              onFile={chat.sendFile}
              onStop={chat.stop}
              streaming={chat.streaming}
              disabled={online === false}
              appMode={appMode}
              onModeChange={setAppMode}
            />
          </div>

          <AnimatePresence>
            {panelOpen && artifacts.length > 0 && (
              <div className="hidden md:flex flex-col"
                style={{ width: '48%', maxWidth: 720, minWidth: 340, flexShrink: 0 }}>
                <ArtifactPanel
                  artifacts={artifacts}
                  activeId={activeArtifactId}
                  onClose={() => setPanelOpen(false)}
                  onSelectArtifact={setActiveArtifactId}
                  onContinue={handleArtifactContinue}
                  streaming={chat.streaming}
                />
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
