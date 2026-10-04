// 下载队列面板：列出所有任务（等待/进行中/完成/出错），可打开文件夹、清除已完成。
const STATUS = {
  pending: { text: '等待中', cls: 'q-pending' },
  running: { text: '进行中', cls: 'q-running' },
  done: { text: '已完成', cls: 'q-done' },
  error: { text: '出错', cls: 'q-error' },
  cancelled: { text: '已取消', cls: 'q-error' }
}

function pct(job) {
  if (!job.total) return 0
  return Math.round(((job.processed ?? job.done) / job.total) * 100)
}

export default function QueuePanel({ jobs, onClose, onClear, onOpenDir, onCancel, onRetry }) {
  return (
    <div className="history-overlay" onClick={onClose}>
      <div className="history-panel queue-panel" onClick={(e) => e.stopPropagation()}>
        <div className="history-head">
          <h3>下载队列（{jobs.length}）</h3>
          <div>
            <button className="btn ghost" onClick={onClear}>
              清除已完成
            </button>
            <button className="btn ghost" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
        <div className="history-list">
          {jobs.length === 0 && <div className="empty">暂无下载任务</div>}
          {jobs.map((job) => {
            const st = job.status === 'done' && (job.failed || job.resolveFail)
              ? { text: job.done > 0 ? '部分失败' : '下载失败', cls: 'q-error' }
              : STATUS[job.status] || STATUS.pending
            return (
              <div className="queue-item" key={job.id}>
                <div className="q-row">
                  <span className={`q-badge ${st.cls}`}>{st.text}</span>
                  <span className="q-label" title={job.label}>
                    {job.label}
                  </span>
                  <span className="q-count">
                    {job.done}/{job.total}
                    {job.failed > 0 ? `（失败 ${job.failed}）` : ''}
                  </span>
                </div>
                {(job.status === 'running' || job.status === 'pending') && (
                  <div className="q-progress">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${pct(job)}%` }} />
                    </div>
                    <span className="q-current">
                      {job.status === 'running'
                        ? `${job.phase === 'resolve' ? '解析原图' : '下载中'} ${job.current || ''}`
                        : '排队等待…'}
                    </span>
                  </div>
                )}
                {job.status === 'error' && <div className="q-err">下载失败：{job.error}</div>}
                {job.warning && <div className="q-err">{job.warning}</div>}
                {job.status === 'cancelled' && (
                  <div className="q-note">已取消（已下载 {job.done}/{job.total} 件保留在本地）</div>
                )}
                {job.status === 'done' && job.resolveFail > 0 && (
                  <div className="q-note">
                    另有 {job.resolveFail} 件解析失败（可能已删除/不可见）
                  </div>
                )}
                <div className="q-actions">
                  {(job.status === 'pending' || job.status === 'running') && (
                    <button
                      className="btn ghost tiny danger"
                      onClick={() => onCancel(job.id)}
                      disabled={job.phase === 'cancelling'}
                    >
                      {job.status === 'pending' ? '✕ 取消' : job.phase === 'cancelling' ? '停止中…' : '⛔ 终止下载'}
                    </button>
                  )}
                  {onRetry && job.retryable > 0 && (
                    <button
                      className="btn ghost tiny"
                      onClick={() => onRetry(job.id)}
                      title="仅重新下载失败的作品（已下好的会自动跳过）"
                    >
                      🔄 重试失败（{job.retryable}）
                    </button>
                  )}
                  {job.baseDir && (
                    <button className="btn ghost tiny" onClick={() => onOpenDir(job.baseDir)}>
                      📂 打开文件夹
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
