import { useState } from 'react'
import { bigThumb } from '../thumb'

// 单张好运图：按真实宽高比占位 + 骨架加载动画，加载完淡入
function LuckyTile({ pic, onDownload }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const ratio = pic.width && pic.height ? `${pic.width} / ${pic.height}` : '3 / 4'

  return (
    <div className="lucky-tile">
      <div className="lucky-imgwrap" style={{ aspectRatio: ratio }}>
        {!loaded && !failed && <div className="img-skeleton" />}
        {failed ? (
          <div className="img-failed">图片加载失败</div>
        ) : (
          <img
            className={`lucky-img ${loaded ? 'is-loaded' : ''}`}
            src={bigThumb(pic.thumb)}
            alt={pic.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        )}
        <button className="lucky-dl" onClick={() => onDownload(pic)} title="加入下载">
          ⬇
        </button>
        {pic.pageCount > 1 && <span className="lucky-pages">🖼 {pic.pageCount}</span>}
      </div>
      <div className="lucky-meta">
        <div className="lucky-title" title={pic.title}>
          {pic.title || '(无标题)'}
        </div>
        <div className="lucky-author" title={pic.userName}>
          {pic.userName || '未知画师'}
        </div>
      </div>
    </div>
  )
}

// 百宝箱 · 今日祈福：福气值 + 祈福语 + 自适应比例的好运插画瀑布流
export default function TreasureBox({ result, checkin, rolling, onRoll, onDownload, onDownloadAll }) {
  const { fu, level, phrase } = result || {}
  // 兼容旧缓存的单图字段 pic
  const pics = result?.pics || (result?.pic ? [result.pic] : [])
  const showLoading = rolling && pics.length === 0

  return (
    <div className="treasure">
      <div className="treasure-card">
        {checkin && (
          <div className="checkin-strip">
            <span className="checkin-item">
              📅 今日{checkin.todayDone ? '已签到 ✅' : '未签到'}
            </span>
            <span className="checkin-item">
              🔥 连续 <b>{checkin.streak}</b> 天
            </span>
            <span className="checkin-item">
              🏆 累计 <b>{checkin.total}</b> 天
            </span>
          </div>
        )}

        <div className="treasure-head">
          <span className="treasure-emoji">{level?.emoji || '🎋'}</span>
          <div className="treasure-fortune">
            <div className="treasure-level">
              今日运势：<b>{level?.name || '——'}</b>
            </div>
            <div className="treasure-fu">
              福气值 <b>{fu ?? '--'}</b> / 100
            </div>
          </div>
        </div>

        <div className="treasure-bar">
          <div className="treasure-bar-fill" style={{ width: `${fu || 0}%` }} />
        </div>

        <blockquote className="treasure-phrase">「{phrase || '——'}」</blockquote>

        <div className="treasure-gallery-head">
          <span className="treasure-pic-title">🍀 今日好运画廊（插画）</span>
          <div className="treasure-gallery-actions">
            {pics.length > 0 && (
              <button className="btn primary small" onClick={() => onDownloadAll(pics)}>
                ⬇ 全部收下（{pics.length}）
              </button>
            )}
            <button className="btn small" onClick={onRoll} disabled={rolling}>
              {rolling ? '正在祈福…' : '🔄 换一批'}
            </button>
          </div>
        </div>

        {showLoading ? (
          <div className="lucky-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div className="lucky-tile" key={i}>
                <div
                  className="lucky-imgwrap"
                  style={{ aspectRatio: i % 2 ? '3 / 4' : '4 / 3' }}
                >
                  <div className="img-skeleton" />
                </div>
              </div>
            ))}
          </div>
        ) : pics.length > 0 ? (
          <div className="lucky-grid">
            {pics.map((p) => (
              <LuckyTile key={p.id} pic={p} onDownload={onDownload} />
            ))}
          </div>
        ) : (
          <div className="lucky-empty">好运图加载失败，点「换一批」再试一次~</div>
        )}

        <div className="treasure-note">每天可反复祈福，好运画廊每次随机 · 仅收录非 R18 插画</div>
      </div>
    </div>
  )
}
