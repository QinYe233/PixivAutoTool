// 全局弹窗提示（toast）。type: 'error' | 'info' | 'success'
export default function Toast({ toast, onClose }) {
  if (!toast) return null
  const icon = toast.type === 'error' ? '⚠️' : toast.type === 'success' ? '✅' : 'ℹ️'
  return (
    <div className={`toast toast-${toast.type || 'info'}`} role="alert">
      <span className="toast-icon">{icon}</span>
      <span className="toast-text">{toast.text}</span>
      <button className="toast-close" onClick={onClose} aria-label="关闭">
        ✕
      </button>
    </div>
  )
}
