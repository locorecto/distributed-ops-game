import { useGameStore } from './store/gameStore'
import { MainMenu } from './components/screens/MainMenu'
import { BriefingScreen } from './components/screens/BriefingScreen'
import { GameScreen } from './components/screens/GameScreen'
import { VictoryScreen } from './components/screens/VictoryScreen'
import { FailureScreen } from './components/screens/FailureScreen'
import { ToastContainer } from './components/layout/ToastContainer'

export default function App() {
  const { phase, setPhase } = useGameStore()

  function handleStartGame() {
    setPhase('playing')
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#0f172a' }}>
      {phase === 'menu' && <MainMenu />}
      {phase === 'briefing' && <BriefingScreen onStart={handleStartGame} />}
      {(phase === 'playing' || phase === 'paused') && <GameScreen />}
      {phase === 'victory' && <VictoryScreen />}
      {phase === 'failed' && <FailureScreen />}
      <ToastContainer />
    </div>
  )
}
