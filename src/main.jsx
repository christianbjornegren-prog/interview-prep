import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import App from './App'
import { installGlobalErrorLogging } from './lib/diagnostics'
import { logSystemEvent } from './lib/systemEvents'

// Fel som ingen annan tog hand om (krasch i en vy, bortglömt promise-fel)
// hamnar i driftloggen i stället för att försvinna i användarens webbläsare.
installGlobalErrorLogging(logSystemEvent)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
