import { bigThumb } from '../thumb'

export default function WorkGrid({ works, selected, onToggle }) {
  return (
    <div className="work-grid">
      {works.map((w) => {
        const isSel = selected.has(w.id)
        const src = bigThumb(w.thumb)
        return (
          <div
            key={w.id}
            className={`work-card ${isSel ? 'selected' : ''}`}
            onClick={() => onToggle(w.id)}
          >
            <div className="thumb-wrap">
              <img className="thumb-bg" src={src} alt="" aria-hidden="true" referrerPolicy="no-referrer" />
              <img
                className="thumb-img"
                src={src}
                alt={w.title}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <input
                type="checkbox"
                className="check"
                checked={isSel}
                readOnly
              />
              {w.illustType === 2 && <span className="ugoira-badge">🎞 动图</span>}
              {w.illustType !== 2 && w.pageCount > 1 && (
                <span className="page-badge">🖼 {w.pageCount}</span>
              )}
              {w.xRestrict >= 1 && <span className="r18-badge">R-18</span>}
              {w.rank && <span className="rank-badge">#{w.rank}</span>}
            </div>
            <div className="work-title" title={w.title}>
              {w.title || '(无标题)'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
