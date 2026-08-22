import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { initGtfsOverride } from './gtfsOverride'

registerSW({ immediate: true })

// 保存済みのカスタムGTFSデータ（設定画面からのアップロード）があれば、
// 描画前に読み込んでおく。無ければ内蔵データのまま即座に描画される。
initGtfsOverride().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
