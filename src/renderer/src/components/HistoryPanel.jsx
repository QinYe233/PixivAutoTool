function fmtTime(t) {
  const d = new Date(t)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`
}

export default function HistoryPanel({ items, onClose, onClear, onOpen }) {
  return (
    <div className="history-overlay" onClick={onClose}>
      <div className="history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="history-head">
          <h3>下载历史（{items.length}）</h3>
          <div>
            <button className="btn ghost" onClick={onClear}>
              清空历史
            </button>
            <button className="btn ghost" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
        <div className="history-list">
          {items.length === 0 && <div className="empty">暂无下载记录</div>}
          {items.map((h, i) => (
            <div className="history-item" key={i}>
              <span className="h-kind">{h.kind === 'ugoira' ? '🎞' : '🖼'}</span>
              <span className="h-title" title={h.title}>
                {h.title || '(无标题)'} · {h.illustId}
              </span>
              <span className="h-time">{fmtTime(h.time)}</span>
              <button className="btn ghost tiny" onClick={() => onOpen(h.file)}>
                打开
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
