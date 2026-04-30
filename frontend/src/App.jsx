// App.jsx — ADD to imports
import { Volume2, VolumeX } from 'lucide-react'

// Inside App component, after existing states:
const [ttsEnabled, setTtsEnabled] = useState(false)

// Pass to InputBar and TopBar
<InputBar
  onSend={handleSend}
  onFile={chat.sendFile}
  onStop={chat.stop}
  streaming={chat.streaming}
  disabled={online === false}
  appMode={appMode}
  onModeChange={setAppMode}
/>

// TopBar-এ TTS toggle button যোগ করুন:
// TopBar.jsx-এ এই props নিন:
// ttsEnabled, onToggleTTS, isSpeaking

// TopBar-এর JSX-এ:
<button
  onClick={onToggleTTS}
  title={ttsEnabled ? '🔊 Voice ON (RUBRA speaks)' : '🔇 Voice OFF'}
  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all
    ${isSpeaking ? 'bg-rose-500/20 text-rose-400 animate-pulse' : ''}
    ${ttsEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/30 hover:text-white/60'}`}
>
  {isSpeaking ? <Volume2 size={15} className="animate-pulse"/> : 
   ttsEnabled ? <Volume2 size={15}/> : <VolumeX size={15}/>}
</button>
