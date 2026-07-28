import { useEffect, useRef } from 'react'

// 通用确认弹窗：日系毛玻璃卡片，替代原生 window.confirm。
// 支持 Esc 取消 / Enter 确认，打开时自动聚焦「确定」按钮。
export default function ConfirmDialog({
  title,
  message,
  icon = '🌸',
  tone = 'primary', // primary | danger
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel
}) {
  const okRef = useRef(null)

  useEffect(() => {
    okRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.()
      else if (e.key === 'Enter') onConfirm?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm, onCancel])

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div
        className="confirm-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-icon">{icon}</div>
        {title && <h3 className="confirm-title">{title}</h3>}
        <p className="confirm-msg">{message}</p>
        <div className="confirm-actions">
          <button className="btn ghost" onClick={onCancel}>
            {cancelText}
          </button>
          <button ref={okRef} className={`btn ${tone}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
