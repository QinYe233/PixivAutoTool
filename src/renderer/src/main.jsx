import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// 渲染前先定主题，避免首帧闪一下深色：优先本地记忆，否则跟随系统偏好
try {
  const saved = localStorage.getItem('theme')
  const prefersLight =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  document.documentElement.dataset.theme = saved || (prefersLight ? 'light' : 'dark')
} catch {
  document.documentElement.dataset.theme = 'dark'
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
