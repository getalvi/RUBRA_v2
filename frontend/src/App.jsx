import { useState, useEffect } from 'react'
import { useChat } from './hooks/useChat'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import ChatArea from './components/ChatArea'
import InputBar from './components/InputBar'
import { getStatus } from './api/client'

export default function App() {
  const chat = useChat()
  const [sidebarOpen, setSidebar] = useState(false)
  const [online, setOnline] = useState(null)

  useEffect(() => {
    getStatus().then(d => setOnline(!!d)).catch(() => setOnline(false))
    const t = setInterval(() => getStatus().then(d => setOnline(!!d)).catch(() => setOnline(false)), 15000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0f0f] text-white">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebar(false)} />
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
        />
        <ChatArea
          messages={chat.messages}
          streaming={chat.streaming}
          toolResult={chat.toolResult}
          onEdit={chat.editResend}
          onSuggest={(q) => chat.send(q)}
        />
        <InputBar
          onSend={chat.send}
          onFile={chat.sendFile}
          onStop={chat.stop}
          streaming={chat.streaming}
          disabled={online === false}
        />
      </div>
    </div>
  )
}