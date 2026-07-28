import { useState, useEffect } from 'react'

const TYPES = [
  { key: 'authorName', label: '作者名称', placeholder: '输入作者昵称，如：wlop', text: true },
  { key: 'authorId', label: '作者 ID', placeholder: '输入作者数字 ID，如：123456', text: true },
  { key: 'keyword', label: '关键字', placeholder: '输入标签/关键字，如：初音ミク', text: true },
  { key: 'illustId', label: '作品 ID', placeholder: '输入作品数字 ID，如：99999999', text: true },
  { key: 'ranking', label: '排行榜', text: false },
  { key: 'bookmarks', label: '我的收藏', text: false },
  { key: 'treasure', label: '🎁 百宝箱', text: false }
]

const RANK_MODES = [
  { v: 'daily', label: '日榜' },
  { v: 'weekly', label: '周榜' },
  { v: 'monthly', label: '月榜' },
  { v: 'rookie', label: '新人' },
  { v: 'original', label: '原创' },
  { v: 'male', label: '男性向' },
  { v: 'female', label: '女性向' },
  { v: 'daily_r18', label: '日榜 R18' },
  { v: 'weekly_r18', label: '周榜 R18' },
  { v: 'male_r18', label: '男性向 R18' },
  { v: 'female_r18', label: '女性向 R18' }
]
const RANK_CONTENT = [
  { v: 'all', label: '综合' },
  { v: 'illust', label: '插画' },
  { v: 'ugoira', label: '动图' },
  { v: 'manga', label: '漫画' }
]

export default function SearchBar({
  onSearch,
  disabled,
  loggedIn,
  onLoadBookmarkTags,
  activeTab,
  onTabChange
}) {
  // 当前栏目由 App 统一掌管（抽屉式），保证 tab 高亮与内容始终一致
  const type = activeTab
  // 文本输入按栏目各自记忆，切换栏目互不串味
  const [values, setValues] = useState({})
  const value = values[type] || ''
  const setValue = (v) => setValues((s) => ({ ...s, [type]: v }))
  const [rankMode, setRankMode] = useState('daily')
  const [rankContent, setRankContent] = useState('all')
  const [rest, setRest] = useState('show')
  const [bmTag, setBmTag] = useState('') // 收藏分类标签，''=全部
  const [bmTags, setBmTags] = useState([]) // [{ tag, cnt }]
  const [loadingTags, setLoadingTags] = useState(false)

  const current = TYPES.find((t) => t.key === type)

  // 进入「我的收藏」或切换公开/不公开时，拉取对应的收藏分类标签
  useEffect(() => {
    if (type !== 'bookmarks' || !loggedIn || !onLoadBookmarkTags) return
    let cancelled = false
    setBmTag('') // 切换收藏范围后重置为「全部」
    setLoadingTags(true)
    onLoadBookmarkTags(rest)
      .then((tags) => {
        if (!cancelled) setBmTags(Array.isArray(tags) ? tags : [])
      })
      .finally(() => {
        if (!cancelled) setLoadingTags(false)
      })
    return () => {
      cancelled = true
    }
  }, [type, rest, loggedIn, onLoadBookmarkTags])

  function submit(e) {
    e.preventDefault()
    if (type === 'ranking') {
      onSearch(type, '', { mode: rankMode, content: rankContent })
    } else if (type === 'bookmarks') {
      onSearch(type, '', { rest, tag: bmTag })
    } else if (type === 'treasure') {
      onSearch(type, '')
    } else {
      onSearch(type, value)
    }
  }

  return (
    <form className="searchbar" onSubmit={submit}>
      <div className="type-tabs">
        {TYPES.map((t) => (
          <button
            type="button"
            key={t.key}
            className={`tab ${type === t.key ? 'active' : ''}`}
            onClick={() => onTabChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="search-input-row">
        {current.text && (
          <input
            value={value}
            placeholder={current.placeholder}
            onChange={(e) => setValue(e.target.value)}
          />
        )}

        {type === 'ranking' && (
          <>
            <select value={rankMode} onChange={(e) => setRankMode(e.target.value)}>
              {RANK_MODES.map((m) => (
                <option key={m.v} value={m.v}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={rankContent}
              onChange={(e) => setRankContent(e.target.value)}
            >
              {RANK_CONTENT.map((m) => (
                <option key={m.v} value={m.v}>
                  {m.label}
                </option>
              ))}
            </select>
          </>
        )}

        {type === 'bookmarks' && (
          <>
            <select value={rest} onChange={(e) => setRest(e.target.value)}>
              <option value="show">公开收藏</option>
              <option value="hide">不公开收藏</option>
            </select>
            <select
              value={bmTag}
              onChange={(e) => setBmTag(e.target.value)}
              disabled={loadingTags}
              title="按收藏分类标签筛选"
            >
              <option value="">
                {loadingTags ? '加载标签中…' : `全部分类${bmTags.length ? `（${bmTags.length} 个标签）` : ''}`}
              </option>
              {bmTags.map((t) => (
                <option key={t.tag} value={t.tag}>
                  {t.tag}（{t.cnt}）
                </option>
              ))}
            </select>
          </>
        )}

        {type === 'treasure' && (
          <span className="treasure-tip">抽取今日福气值 · 祈福语 · 一张随机好运图（非 R18）</span>
        )}

        <button className="btn primary" type="submit" disabled={disabled}>
          {type === 'treasure'
            ? '🎁 今日祈福'
            : `🔍 ${type === 'ranking' || type === 'bookmarks' ? '加载' : '搜索'}`}
        </button>
      </div>
    </form>
  )
}
