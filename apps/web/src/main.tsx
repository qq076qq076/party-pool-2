import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StairClimbDebugPage } from './games/stair-climb/StairClimbDebugPage.tsx'

const debugScene = new URLSearchParams(window.location.search).get('debugScene')
const RootComponent =
  import.meta.env.DEV && debugScene === 'stair-climb' ? StairClimbDebugPage : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>,
)
