import { useEffect, useState } from 'react'
import { api } from '../api'

// 无边框窗口的自绘标题栏按钮：最小化 / 最大化·还原 / 关闭。
// 图标用 SVG + currentColor，自动跟随深/浅主题。
export default function WindowControls() {
  const [max, setMax] = useState(false)

  useEffect(() => {
    api.winIsMaximized().then(setMax).catch(() => {})
    const off = api.onMaximizeChange(setMax)
    return off
  }, [])

  return (
    <div className="win-controls">
      <button
        className="win-btn"
        onClick={() => api.winMinimize()}
        title="最小化"
        aria-label="最小化"
      >
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
          <rect x="1" y="5" width="9" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        className="win-btn"
        onClick={() => api.winMaximizeToggle()}
        title={max ? '向下还原' : '最大化'}
        aria-label={max ? '向下还原' : '最大化'}
      >
        {max ? (
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <rect x="1.5" y="3.5" width="6" height="6" />
            <path d="M3.5 3.5V1.5h6v6h-2" />
          </svg>
        ) : (
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <rect x="1.5" y="1.5" width="8" height="8" />
          </svg>
        )}
      </button>
      <button
        className="win-btn close"
        onClick={() => api.winClose()}
        title="关闭"
        aria-label="关闭"
      >
        <svg width="11" height="11" viewBox="0 0 11 11" stroke="currentColor" aria-hidden="true">
          <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" />
        </svg>
      </button>
    </div>
  )
}
