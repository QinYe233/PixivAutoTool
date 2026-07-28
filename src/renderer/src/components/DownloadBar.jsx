export default function DownloadBar({
  total,
  selectedCount,
  pageInfo,
  activeJob,
  runningCount,
  pendingCount,
  onSelectAll,
  onSelectNone,
  onDownload,
  onLoadMore,
  onPage,
  onOpenQueue
}) {
  const pct =
    activeJob && activeJob.total
      ? Math.round((activeJob.done / activeJob.total) * 100)
      : 0
  const phaseText =
    activeJob?.phase === 'resolve'
      ? '解析原图'
      : activeJob?.phase === 'download'
        ? '下载中'
        : ''
  const busy = runningCount + pendingCount

  return (
    <footer className="downloadbar">
      <div className="select-controls">
        <span className="count">
          已选 <b>{selectedCount}</b> / {total}
        </span>
        <button className="btn ghost" onClick={onSelectAll}>
          全选
        </button>
        <button className="btn ghost" onClick={onSelectNone}>
          清空
        </button>

        {onLoadMore && (
          <button className="btn ghost" onClick={onLoadMore}>
            加载更多
          </button>
        )}
        {onPage && pageInfo && (
          <span className="pager">
            <button className="btn ghost" onClick={() => onPage(-1)}>
              上一页
            </button>
            <span>
              {pageInfo.page} / {pageInfo.pages}
            </span>
            <button className="btn ghost" onClick={() => onPage(1)}>
              下一页
            </button>
          </span>
        )}
      </div>

      <div className="download-controls">
        <button className="btn ghost queue-btn" onClick={onOpenQueue}>
          📥 队列{busy > 0 ? ` (${busy})` : ''}
        </button>

        {activeJob && (
          <div className="progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="progress-text">
              {phaseText} {activeJob.done}/{activeJob.total}
              {pendingCount > 0 ? `　+${pendingCount} 排队` : ''}
            </span>
          </div>
        )}

        <button
          className="btn primary big"
          onClick={onDownload}
          disabled={selectedCount === 0}
          title="加入下载队列（下载中也可继续追加）"
        >
          {busy > 0 ? `⬇ 追加下载 (${selectedCount})` : `⬇ 下载所选 (${selectedCount})`}
        </button>
      </div>
    </footer>
  )
}
