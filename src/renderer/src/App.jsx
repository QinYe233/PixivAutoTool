import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { api } from './api'
import TopBar from './components/TopBar'
import SearchBar from './components/SearchBar'
import UserList from './components/UserList'
import WorkGrid from './components/WorkGrid'
import DownloadBar from './components/DownloadBar'
import HistoryPanel from './components/HistoryPanel'
import QueuePanel from './components/QueuePanel'
import TreasureBox from './components/TreasureBox'
import Toast from './components/Toast'
import ConfirmDialog from './components/ConfirmDialog'
import SponsorPanel from './components/SponsorPanel'
import OnboardingGuide from './components/OnboardingGuide'
import { playChime } from './sound'

// 把主进程/IPC 抛出的原始报错，转成给最终用户看的一句话提示
function humanizeError(raw, ctx) {
  let msg = String(raw || '')
  msg = msg.replace(/^Error invoking remote method '[^']*':\s*/i, '')
  msg = msg.replace(/^Error:\s*/i, '')
  const codeMatch = msg.match(/请求失败 \((\d+)\)/)
  const code = codeMatch ? Number(codeMatch[1]) : null
  if (code === 404) {
    if (/\/ajax\/user\//.test(msg) || ctx === 'authorId') return '作者 ID 不存在或无效，请核对后重试'
    if (/\/ajax\/illust\//.test(msg) || ctx === 'illustId') return '作品 ID 不存在或无效，请核对后重试'
    return '未找到相关内容（404），请检查输入是否正确'
  }
  if (code === 401 || code === 403 || /未登录|登录已失效/.test(msg)) {
    return '登录已失效，请重新登录 Pixiv'
  }
  if (code === 429 || /限流|请求过于频繁/.test(msg)) {
    return 'Pixiv 请求过于频繁，已被临时限流，请稍等 1~2 分钟再试'
  }
  if (code && code >= 500) return `Pixiv 服务器繁忙（${code}），请稍后再试`
  if (/ByteString|character at index \d+ has a value/i.test(msg)) {
    return '输入内容无效：ID 必须是纯数字。若要按名称/标签查找，请切换到「作者名称」或「关键字」'
  }
  if (/fetch failed|network|ENOTFOUND|ETIMEDOUT|ECONNRESET|getaddrinfo/i.test(msg)) {
    return '网络连接失败，Pixiv 可能需要科学上网后再试'
  }
  return msg.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim() || '操作失败，请重试'
}

// 按当前 R18 过滤器，计算某列表的可见数量
function countVisible(list, filter) {
  if (filter === 'hide') return list.filter((w) => (w.xRestrict || 0) === 0).length
  if (filter === 'only') return list.filter((w) => (w.xRestrict || 0) >= 1).length
  return list.length
}

// ——— 百宝箱 · 今日祈福 ———
const FORTUNE_LEVELS = [
  { min: 95, name: '天选之子', emoji: '🌟' },
  { min: 80, name: '大吉', emoji: '🎉' },
  { min: 60, name: '中吉', emoji: '😊' },
  { min: 40, name: '小吉', emoji: '🙂' },
  { min: 20, name: '末吉', emoji: '😌' },
  { min: 0, name: '凶', emoji: '🌫️' }
]
const BLESSINGS = [
  '愿你今日下载不掉线，图图皆原图。',
  '所求皆如愿，所download皆秒传。',
  '愿你的收藏夹永远有空位，硬盘永远有余量。',
  '今日宜摸鱼，宜看图，宜心情愉悦。',
  '愿你遇见的每一位画师都在更新。',
  '好运连连，喜欢的作品永不删档。',
  '愿你被温柔以待，被好图环绕。',
  '心之所向，皆是热爱；手之所点，皆是精品。',
  '愿你今日灵感迸发，收藏满载而归。',
  '万事顺遂，网络通畅，科学上网一切安好。'
]
function stampOf(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}${m}${day}`
}
function todayStamp() {
  return stampOf(new Date())
}

// ——— 每日签到统计 ———
function loadCheckinDates() {
  try {
    const arr = JSON.parse(localStorage.getItem('checkin-dates') || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
function computeCheckin(dates) {
  const set = new Set(dates)
  const todayDone = set.has(todayStamp())
  // 连续签到：从今天往前数连续存在的天数
  let streak = 0
  const cur = new Date()
  // 若今天还没签到，则连续天数从昨天起算
  if (!todayDone) cur.setDate(cur.getDate() - 1)
  while (set.has(stampOf(cur))) {
    streak++
    cur.setDate(cur.getDate() - 1)
  }
  return { total: set.size, streak, todayDone }
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [settings, setSettings] = useState({ downloadDir: '', concurrency: 4, pageSize: 50 })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [booting, setBooting] = useState(true) // 启动加载动画
  // 我的收藏首页预取缓存（登录后后台预取，首次打开即时展示）
  const bookmarksCacheRef = useRef(null)

  const [users, setUsers] = useState([])
  const [works, setWorks] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [context, setContext] = useState(null)
  const [r18Filter, setR18Filter] = useState('all') // all | hide | only
  // 当前实际展示的条数上限（凑满 R18 时会在后台多抓，但页面只展示这么多）
  const [displayLimit, setDisplayLimit] = useState(50)

  // 抽屉式栏目：当前激活的栏目 + 各栏目内容缓存（切走再切回即时恢复，互不干扰）
  const [activeTab, setActiveTab] = useState('authorName')
  const tabCacheRef = useRef({}) // { [tab]: { works, context, users, selected, displayLimit, treasure } }
  // 加载令牌：每次新加载/切栏目都自增，令在途请求作废——结果回来发现过期就不再提交，
  // 避免「切栏目时上一个搜索加载完落到新栏目」这类并发错位。
  const loadTokenRef = useRef(0)
  const nextLoadToken = () => {
    const t = ++loadTokenRef.current
    return () => loadTokenRef.current === t
  }

  const [queue, setQueue] = useState([])
  const [showQueue, setShowQueue] = useState(false)

  // 自定义确认弹窗（替代原生 window.confirm）：askConfirm() 返回 Promise<boolean>
  const [confirmData, setConfirmData] = useState(null)
  const confirmResolveRef = useRef(null)
  const askConfirm = useCallback((opts) => {
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve
      setConfirmData(opts)
    })
  }, [])
  const closeConfirm = useCallback((result) => {
    const r = confirmResolveRef.current
    confirmResolveRef.current = null
    setConfirmData(null)
    if (r) r(result)
  }, [])

  // 百宝箱 · 今日祈福结果
  const [treasure, setTreasure] = useState(null)
  const [rolling, setRolling] = useState(false)
  const [checkin, setCheckin] = useState(() => computeCheckin(loadCheckinDates()))

  const [showHistory, setShowHistory] = useState(false)
  const [historyItems, setHistoryItems] = useState([])
  const [showSponsor, setShowSponsor] = useState(false)
  // 首次使用引导：本地无标记时首启自动弹出；顶栏「❓ 引导」可随时重开
  const [showGuide, setShowGuide] = useState(() => {
    try {
      return !localStorage.getItem('onboarded-v1')
    } catch {
      return false
    }
  })
  const closeGuide = useCallback(() => {
    try {
      localStorage.setItem('onboarded-v1', '1')
    } catch {
      /* ignore */
    }
    setShowGuide(false)
  }, [])

  const [accountInfo, setAccountInfo] = useState(null)
  const [loadingAccount, setLoadingAccount] = useState(false)

  // 深色/浅色主题：初值取自 main.jsx 已写入 <html> 的 data-theme
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || 'dark'
  )
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'light' ? 'dark' : 'light'
      document.documentElement.dataset.theme = next
      try {
        localStorage.setItem('theme', next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const refreshAuth = useCallback(async () => {
    const s = await api.authStatus()
    setLoggedIn(s.loggedIn)
  }, [])

  useEffect(() => {
    // 订阅下载队列状态
    api.queueState().then(setQueue)
    const off = api.onQueueUpdate((state) => setQueue(state))
    // 订阅「任务完成」：前台时给出提示音 + 横幅（后台由主进程弹系统通知）
    const offDone = api.onJobDone((job) => {
      if (job.status === 'cancelled') return
      playChime()
      if (job.status === 'done') {
        const failNote = job.failed ? `，失败 ${job.failed} 张` : ''
        const retryNote = job.retryable > 0 ? '　可在「📥 队列」里一键重试失败项。' : ''
        setStatus(
          `✅ 「${job.label}」下载完成：成功 ${job.done}/${job.total} 张${failNote}` +
            '。点右上角「📂 打开下载目录」查看。' +
            retryNote
        )
      } else if (job.status === 'error') {
        setError(
          `「${job.label}」下载出错：${humanizeError(job.error || '未知错误')}` +
            (job.retryable > 0 ? '　可在「📥 队列」里一键重试。' : '')
        )
      }
    })

    // 启动引导：并行取登录态与设置；登录则落地排行榜内容，并后台预取收藏/祈福图
    ;(async () => {
      try {
        const [auth, s] = await Promise.all([api.authStatus(), api.getSettings()])
        setLoggedIn(auth.loggedIn)
        setSettings(s)
        if (auth.loggedIn) {
          setActiveTab('ranking') // 落地在「排行榜」抽屉，tab 高亮与内容一致
          ensureDailyBlessing() // 后台缓存今日祈福 12 图
          prefetchBookmarks('show') // 后台预取「我的收藏（公开）」首页
          // 落地内容：日榜。闪屏保持到加载完成，但最多 6s，避免网络卡住时一直转
          await Promise.race([
            loadRanking('daily', 'all', 1).catch(() => {}),
            new Promise((r) => setTimeout(r, 6000))
          ])
        }
      } catch {
        /* ignore：启动信息获取失败不阻塞进入 */
      } finally {
        setBooting(false)
      }
    })()

    return () => {
      off()
      offDone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 错误提示自动消失（弹窗形式）
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(''), 6000)
    return () => clearTimeout(t)
  }, [error])

  // R18 过滤后的可见作品（再按 displayLimit 截断，避免后台补齐的多余条目一次性涌出）
  const visibleWorks = useMemo(() => {
    let list = works
    if (r18Filter === 'hide') list = works.filter((w) => (w.xRestrict || 0) === 0)
    else if (r18Filter === 'only') list = works.filter((w) => (w.xRestrict || 0) >= 1)
    return list.slice(0, displayLimit)
  }, [works, r18Filter, displayLimit])

  // 切换过滤器后，若可见不足单页数量且还能继续加载，则自动补齐。
  // 用 run-token 保证「只有最新一次切换」控制 loading 与数据提交，杜绝来回切时卡「加载中」。
  const filterRunRef = useRef(0)
  useEffect(() => {
    const myRun = ++filterRunRef.current
    const isCurrent = () => filterRunRef.current === myRun
    // 切到「全部」或无上下文：取消在途补齐并确保清除 loading
    if (r18Filter === 'all' || !context) {
      setLoading(false)
      return
    }
    const target = settings.pageSize || 50
    if (countVisible(works, r18Filter) >= target) {
      setLoading(false)
      return
    }
    setLoading(true)
    ;(async () => {
      try {
        await applyResults(works, context, isCurrent)
      } catch (e) {
        if (isCurrent()) setError(humanizeError(e.message))
      } finally {
        if (isCurrent()) setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r18Filter])

  // 队列派生信息
  const activeJob = queue.find((j) => j.status === 'running') || null
  const runningCount = queue.filter((j) => j.status === 'running').length
  const pendingCount = queue.filter((j) => j.status === 'pending').length

  // 仍在活跃队列（等待/进行中）里的作品 id 集合：只有这些才算「重复添加」。
  // 任务一旦终止/完成/出错就不再活跃，其 id 自动释放，可再次下载。
  const activeIds = useMemo(() => {
    const s = new Set()
    for (const j of queue) {
      if (j.status === 'pending' || j.status === 'running') {
        for (const id of j.itemIds || []) s.add(String(id))
      }
    }
    return s
  }, [queue])

  async function handleLogin() {
    setStatus('请在弹出的窗口中登录 Pixiv...')
    const r = await api.login()
    setStatus('')
    if (r.ok) {
      await refreshAuth()
      setAccountInfo(null)
    } else setError('登录已取消或未完成')
  }

  async function handleLogout() {
    await api.logout()
    await refreshAuth()
    setAccountInfo(null)
  }

  async function loadAccountInfo() {
    setLoadingAccount(true)
    try {
      const info = await api.accountInfo()
      setAccountInfo(info)
    } catch (e) {
      setError(humanizeError(e.message))
    } finally {
      setLoadingAccount(false)
    }
  }

  function resetResults() {
    setUsers([])
    setWorks([])
    setSelected(new Set())
    setError('')
    setTreasure(null)
    setDisplayLimit(settings.pageSize || 50)
  }

  // 抽屉式切换栏目：先把当前栏目内容存入缓存，再恢复目标栏目的缓存（无缓存则显示空白）。
  // 各栏目内容/勾选互不干扰；切走再切回即时恢复，不重新请求。
  function switchTab(tab) {
    if (tab === activeTab) return
    loadTokenRef.current++ // 作废在途加载，防止其结果落到新栏目
    filterRunRef.current++ // 同时作废在途的 R18 自动补齐
    tabCacheRef.current[activeTab] = {
      works,
      context,
      users,
      selected,
      displayLimit,
      treasure
    }
    const c = tabCacheRef.current[tab]
    if (c) {
      setWorks(c.works)
      setContext(c.context)
      setUsers(c.users)
      setSelected(c.selected)
      setDisplayLimit(c.displayLimit)
      setTreasure(c.treasure)
    } else {
      setWorks([])
      setContext(null)
      setUsers([])
      setSelected(new Set())
      setDisplayLimit(settings.pageSize || 50)
      setTreasure(null)
    }
    setStatus('')
    setError('')
    setActiveTab(tab)
  }

  // 取下一批数据用于补齐（各搜索类型统一入口）。返回 { items, nextCtx } 或 null
  async function fetchNextChunk(ctx) {
    if (!ctx) return null
    if (ctx.type === 'author') {
      const next = ctx.illustIds.slice(ctx.loaded, ctx.loaded + 60)
      if (!next.length) return null
      const items = await api.userArtworksPage(ctx.userId, next)
      return { items, nextCtx: { ...ctx, loaded: ctx.loaded + next.length } }
    }
    if (ctx.type === 'bookmarks') {
      if (ctx.loaded >= ctx.total) return null
      const nextOffset = ctx.offset + 48
      const r = await api.bookmarks(nextOffset, ctx.rest, ctx.tag || '')
      if (!r.items.length) return null
      return {
        items: r.items,
        nextCtx: { ...ctx, offset: nextOffset, loaded: ctx.loaded + r.items.length }
      }
    }
    if (ctx.type === 'keyword') {
      const nextPage = ctx.page + 1
      if (nextPage > ctx.pages) return null
      const r = await api.searchArtworks(ctx.keyword, nextPage)
      if (!r.items.length) return null
      return { items: r.items, nextCtx: { ...ctx, page: nextPage } }
    }
    if (ctx.type === 'ranking') {
      if (!ctx.hasNext) return null
      const nextPage = ctx.page + 1
      const r = await api.ranking(ctx.mode, ctx.content, nextPage)
      if (!r.items.length) return null
      return { items: r.items, nextCtx: { ...ctx, page: nextPage, hasNext: r.hasNext } }
    }
    return null
  }

  // 应用一批结果，并在过滤模式下自动补齐到单页数量。返回最终 { items, ctx }
  // isCurrent(): 若本次请求已被更晚的请求取代则返回 false —— 中断补齐、且不提交陈旧结果，
  // 避免频繁切换（尤其 R18 来回切）时并发竞态覆盖数据、或把 loading 卡死。
  async function applyResults(items, ctx, isCurrent = () => true) {
    const target = settings.pageSize || 50
    let acc = items
    let c = ctx
    if (r18Filter !== 'all') {
      let guard = 0
      while (countVisible(acc, r18Filter) < target && guard++ < 30) {
        if (!isCurrent()) return { items: acc, ctx: c } // 已被取代：停止补齐
        let chunk
        try {
          chunk = await fetchNextChunk(c)
        } catch {
          break
        }
        if (!chunk) break
        const seen = new Set(acc.map((w) => w.id))
        const fresh = chunk.items.filter((w) => !seen.has(w.id))
        acc = fresh.length ? [...acc, ...fresh] : acc
        c = chunk.nextCtx
      }
    }
    if (!isCurrent()) return { items: acc, ctx: c } // 已被取代：不提交陈旧结果
    setWorks(acc)
    setContext(c)
    return { items: acc, ctx: c }
  }

  async function handleSearch(type, value, extra) {
    if (type === 'treasure') {
      resetResults()
      return rollBlessing()
    }
    if (!loggedIn) return setError('请先登录 Pixiv')
    if (
      (type === 'authorName' || type === 'authorId' || type === 'keyword' || type === 'illustId') &&
      !value.trim()
    ) {
      return setError('请输入搜索内容')
    }
    // ID 类必须是纯数字，避免把中文/昵称塞进请求头触发底层报错
    if (type === 'authorId' && !/^\d+$/.test(value.trim())) {
      return setError('作者 ID 必须是纯数字（如 123456）。要按昵称查找请切到「作者名称」')
    }
    if (type === 'illustId' && !/^\d+$/.test(value.trim())) {
      return setError('作品 ID 必须是纯数字（如 99999999）。要按标签查找请切到「关键字」')
    }
    resetResults()
    setLoading(true)
    try {
      if (type === 'authorName') {
        const isCurrent = nextLoadToken()
        const list = await api.searchUsers(value.trim())
        if (!isCurrent()) return
        setUsers(list)
        setContext({ type: 'authorName' })
        if (!list.length) setStatus('未找到匹配的作者')
      } else if (type === 'authorId') {
        await loadAuthorWorks(value.trim())
      } else if (type === 'keyword') {
        await loadKeyword(value.trim(), 1)
      } else if (type === 'illustId') {
        await loadSingleIllust(value.trim())
      } else if (type === 'ranking') {
        await loadRanking(extra.mode, extra.content, 1)
      } else if (type === 'bookmarks') {
        await loadBookmarks(0, extra.rest, false, extra.tag)
      }
    } catch (e) {
      setError(humanizeError(e.message || String(e), type))
    } finally {
      setLoading(false)
    }
  }

  async function loadAuthorWorks(userId) {
    const isCurrent = nextLoadToken()
    const r = await api.userArtworks(userId)
    if (!isCurrent()) return
    setSelected(new Set())
    setDisplayLimit(settings.pageSize || 50)
    const { ctx } = await applyResults(
      r.items,
      { type: 'author', userId, name: r.name, illustIds: r.illustIds, loaded: r.items.length },
      isCurrent
    )
    if (!isCurrent()) return
    setStatus(`作者「${r.name || userId}」共 ${r.illustIds.length} 件，已加载 ${ctx.loaded} 件`)
  }

  async function loadMoreAuthor() {
    if (!context || context.type !== 'author') return
    const next = context.illustIds.slice(context.loaded, context.loaded + 60)
    if (!next.length) return
    const isCurrent = nextLoadToken()
    setLoading(true)
    try {
      const more = await api.userArtworksPage(context.userId, next)
      if (!isCurrent()) return
      setWorks((w) => [...w, ...more])
      setDisplayLimit((d) => d + more.length)
      setContext((c) => ({ ...c, loaded: c.loaded + next.length }))
    } catch (e) {
      if (isCurrent()) setError(humanizeError(e.message))
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }

  async function loadKeyword(keyword, page) {
    const isCurrent = nextLoadToken()
    setLoading(true)
    try {
      const r = await api.searchArtworks(keyword, page)
      if (!isCurrent()) return
      setSelected(new Set())
      setDisplayLimit(settings.pageSize || 50)
      await applyResults(
        r.items,
        { type: 'keyword', keyword, page, pages: r.pages, total: r.total },
        isCurrent
      )
      if (!isCurrent()) return
      setStatus(`关键字「${keyword}」共约 ${r.total} 件，第 ${page}/${r.pages} 页`)
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }

  async function loadRanking(mode, content, page) {
    const isCurrent = nextLoadToken()
    setLoading(true)
    try {
      const r = await api.ranking(mode, content, page)
      if (!isCurrent()) return
      setSelected(new Set())
      setDisplayLimit(settings.pageSize || 50)
      await applyResults(
        r.items,
        { type: 'ranking', mode, content, page, hasNext: r.hasNext },
        isCurrent
      )
      if (!isCurrent()) return
      setStatus(`排行榜（${mode} / ${content}）第 ${page} 页，共 ${r.items.length} 件`)
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }

  // 登录后后台预取「我的收藏」首页，首次打开该 tab 即时展示
  async function prefetchBookmarks(rest) {
    try {
      const r = await api.bookmarks(0, rest, '')
      bookmarksCacheRef.current = { rest, r }
    } catch {
      /* ignore */
    }
  }

  async function loadBookmarks(offset, rest, append, tag = '') {
    const isCurrent = nextLoadToken()
    setLoading(true)
    try {
      // 首页（无标签筛选）优先用启动预取的缓存，命中即消费一次
      let r
      const cache = bookmarksCacheRef.current
      if (!append && offset === 0 && !tag && cache && cache.rest === rest) {
        r = cache.r
        bookmarksCacheRef.current = null
      } else {
        r = await api.bookmarks(offset, rest, tag)
      }
      if (!isCurrent()) return
      if (append) {
        setWorks((w) => [...w, ...r.items])
        setDisplayLimit((d) => d + r.items.length)
        setContext((c) => ({ ...c, offset, loaded: (c?.loaded || 0) + r.items.length }))
      } else {
        setSelected(new Set())
        setDisplayLimit(settings.pageSize || 50)
        await applyResults(
          r.items,
          { type: 'bookmarks', rest, tag, offset, total: r.total, loaded: r.items.length },
          isCurrent
        )
        if (!isCurrent()) return
      }
      const tagNote = tag ? `｜分类「${tag}」` : ''
      setStatus(`我的收藏（${rest === 'show' ? '公开' : '不公开'}${tagNote}）共 ${r.total} 件`)
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }

  async function loadSingleIllust(illustId) {
    const isCurrent = nextLoadToken()
    const info = await api.illustPages(illustId)
    if (!isCurrent()) return
    const item = {
      id: info.id,
      title: info.title,
      thumb: info.pages[0]?.urlRegular || info.pages[0]?.urlOriginal || '',
      pageCount: info.pages.length,
      userId: info.userId,
      userName: info.userName,
      xRestrict: 0,
      illustType: info.illustType
    }
    setWorks([item])
    setSelected(new Set([item.id]))
    setContext({ type: 'illust', illustId })
    setStatus(
      `作品「${info.title}」${info.illustType === 2 ? '（动图，将转为 GIF）' : `共 ${info.pages.length} 张`}`
    )
  }

  function toggle(id) {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function selectAll() {
    setSelected(new Set(visibleWorks.map((w) => w.id)))
  }
  function selectNone() {
    setSelected(new Set())
  }

  // 把 payload 加入下载队列（不阻塞，可继续追加）。
  // 仅跳过「仍在活跃队列（等待/进行中）」的作品，避免重复排队；已终止/完成的可再次下载。
  async function enqueue(payload, label) {
    setError('')
    const fresh = payload.filter((w) => !activeIds.has(String(w.id)))
    const skipped = payload.length - fresh.length
    if (!fresh.length) {
      return setStatus(`所选 ${payload.length} 件正在下载队列中，未重复添加`)
    }
    try {
      await api.enqueueDownload(fresh, {
        baseDir: settings.downloadDir || undefined,
        concurrency: settings.concurrency,
        label
      })
      setStatus(
        `已加入下载队列：${label}` +
          (skipped > 0 ? `（其中 ${skipped} 件正在下载队列，已自动跳过）` : '') +
          '。下载中可继续搜索/勾选追加，点顶部「📥 队列」查看进度。'
      )
    } catch (e) {
      setError('加入队列失败：' + humanizeError(e.message))
    }
  }

  function handleDownload() {
    const chosen = works.filter((w) => selected.has(w.id))
    if (!chosen.length) return setError('请先勾选要下载的图片')
    const payload = chosen.map((w) => ({
      id: w.id,
      illustType: w.illustType,
      userId: w.userId,
      title: w.title
    }))
    enqueue(payload, `勾选下载 ${payload.length} 件`)
  }

  // 一键下载当前作者的全部作品（按当前 R18 过滤器筛选）
  async function handleDownloadAllAuthor() {
    if (!context || context.type !== 'author') return
    const ids = context.illustIds || []
    if (!ids.length) return setError('该作者没有可下载的作品')

    const filterLabel = r18Filter === 'only' ? '仅 R18' : r18Filter === 'hide' ? '隐藏 R18' : '全部'
    const ok = await askConfirm({
      icon: '📥',
      title: '下载全部作品',
      message:
        `即将解析并下载作者「${context.name || context.userId}」的全部 ${ids.length} 件作品\n` +
        `（过滤条件：${filterLabel}）\n作品较多时解析耗时较长，确定继续吗？`,
      confirmText: '开始下载',
      cancelText: '再想想'
    })
    if (!ok) return

    setError('')
    setLoading(true)
    setStatus(`正在解析作者全部 ${ids.length} 件作品信息…`)
    try {
      const all = []
      const batch = 60
      for (let i = 0; i < ids.length; i += batch) {
        const part = ids.slice(i, i + batch)
        const w = await api.userArtworksPage(context.userId, part)
        all.push(...w)
        setStatus(`解析作品信息中… ${Math.min(i + batch, ids.length)}/${ids.length}`)
      }
      let chosen = all
      if (r18Filter === 'hide') chosen = all.filter((w) => (w.xRestrict || 0) === 0)
      else if (r18Filter === 'only') chosen = all.filter((w) => (w.xRestrict || 0) >= 1)

      setLoading(false)
      if (!chosen.length) return setError(`没有符合「${filterLabel}」条件的作品`)

      const payload = chosen.map((w) => ({
        id: w.id,
        illustType: w.illustType,
        userId: w.userId,
        title: w.title
      }))
      await enqueue(payload, `作者「${context.name || context.userId}」全部（${filterLabel}）${payload.length} 件`)
    } catch (e) {
      setLoading(false)
      setError(humanizeError(e.message, 'authorId'))
    }
  }

  // 从月/周/日榜（均为非 R18）取一批「插画」作为今日好运图：只要插画、去重、打乱
  async function pickLuckyPics(n = 12) {
    const modes = ['monthly', 'weekly', 'daily']
    const mode = modes[Math.floor(Math.random() * modes.length)]
    const startPage = 1 + Math.floor(Math.random() * 3)
    const seen = new Set()
    const pool = []
    for (let p = startPage; p < startPage + 3 && pool.length < n * 2; p++) {
      let r
      try {
        r = await api.ranking(mode, 'illust', p)
      } catch {
        break
      }
      for (const w of r.items || []) {
        if ((w.xRestrict || 0) !== 0) continue // 排除 R18
        if (Number(w.illustType) !== 0) continue // 只要插画（排除漫画/动图）
        if (seen.has(w.id)) continue
        seen.add(w.id)
        pool.push(w)
      }
      if (!r.hasNext) break
    }
    // Fisher–Yates 洗牌
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return pool.slice(0, n)
  }

  // 记录今日签到（每天首次进入百宝箱/祈福即算签到）
  function markCheckin() {
    const dates = loadCheckinDates()
    const t = todayStamp()
    if (!dates.includes(t)) {
      dates.push(t)
      try {
        localStorage.setItem('checkin-dates', JSON.stringify(dates))
      } catch {
        /* ignore */
      }
    }
    setCheckin(computeCheckin(dates))
  }

  // 掷今日运势（福气值 + 等级 + 祈福语）——每天只在首次生成，之后按天缓存复用
  function rollFortune(today) {
    const fu = Math.floor(Math.random() * 101)
    const level = FORTUNE_LEVELS.find((l) => fu >= l.min) || FORTUNE_LEVELS[FORTUNE_LEVELS.length - 1]
    const phrase = BLESSINGS[Math.floor(Math.random() * BLESSINGS.length)]
    return { date: today, fu, level, phrase, pics: [] }
  }

  // 只拉一批新好运图并写入当日缓存；运势(fu/level/phrase)沿用 base，不改变。
  // 拉取期间保留旧图 + 转场动画，完成后整体替换。
  async function fillLuckyPics(base) {
    setRolling(true)
    setError('')
    try {
      const pics = await pickLuckyPics(12)
      const result = { ...base, pics }
      setTreasure(result)
      try {
        localStorage.setItem(`blessing-${base.date}`, JSON.stringify(result))
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError('好运图加载失败：' + humanizeError(e.message))
    } finally {
      setRolling(false)
    }
  }

  // 今日祈福：运势每天只掷一次（缓存），图库可「换一批」。进入百宝箱时调用。
  async function rollBlessing() {
    if (!loggedIn) return setError('请先登录 Pixiv 后再来求签~')
    markCheckin()
    const today = todayStamp()
    let cached = null
    try {
      cached = JSON.parse(localStorage.getItem(`blessing-${today}`) || 'null')
    } catch {
      /* ignore */
    }
    if (cached && cached.date === today) {
      setTreasure(cached)
      // 有当日运势但图缺失（如预取失败）：补图，运势不变
      if (!cached.pics || !cached.pics.length) return fillLuckyPics({ ...cached, pics: [] })
      return
    }
    // 当日首次：掷运势（仅此一次）后取图
    const base = rollFortune(today)
    setTreasure(base)
    return fillLuckyPics(base)
  }

  // 「换一批」：只换画廊图片，保留今日运势数值不变
  function refreshLuckyPics() {
    if (!treasure) return
    return fillLuckyPics({ ...treasure, pics: [] })
  }

  // 启动后台预取：确保今日运势与 12 张好运图已缓存（不切换视图），供打开百宝箱即时展示
  async function ensureDailyBlessing() {
    const today = todayStamp()
    const key = `blessing-${today}`
    try {
      const cached = JSON.parse(localStorage.getItem(key) || 'null')
      if (cached && cached.date === today && cached.pics && cached.pics.length) return
    } catch {
      /* ignore */
    }
    const base = rollFortune(today)
    try {
      const pics = await pickLuckyPics(12)
      localStorage.setItem(key, JSON.stringify({ ...base, pics }))
    } catch {
      /* ignore：预取失败不影响后续手动求签 */
    }
  }

  function downloadLuckyPic(pic) {
    if (!pic) return
    enqueue(
      [{ id: pic.id, illustType: pic.illustType, userId: pic.userId, title: pic.title }],
      `今日好运图 ${pic.title || pic.id}`
    )
  }

  function downloadAllLucky(pics) {
    if (!pics || !pics.length) return
    enqueue(
      pics.map((p) => ({ id: p.id, illustType: p.illustType, userId: p.userId, title: p.title })),
      `今日好运画廊 ${pics.length} 张`
    )
  }

  // 供 SearchBar 拉取收藏分类标签；用 useCallback 固定引用，
  // 否则每次 App 重渲染都会让 SearchBar 的 effect 重跑、把已选标签重置回「全部」
  const loadBookmarkTags = useCallback(
    (rest) => api.bookmarkTags(rest).catch(() => []),
    []
  )

  async function openHistory() {
    const items = await api.historyList(500)
    setHistoryItems(items)
    setShowHistory(true)
  }
  async function clearHistory() {
    await api.historyClear()
    setHistoryItems([])
  }
  async function clearFinishedJobs() {
    const s = await api.clearFinishedJobs()
    setQueue(s)
  }
  async function cancelJob(id) {
    const s = await api.cancelJob(id)
    setQueue(s)
  }
  async function retryJob(id) {
    const s = await api.retryJob(id)
    setQueue(s)
    setShowQueue(true)
    setStatus('已把失败的作品重新加入下载队列，已下好的会自动跳过。')
  }

  // 分页/加载更多回调（按 context 类型）
  const onLoadMore =
    context?.type === 'author' && context.loaded < context.illustIds.length
      ? loadMoreAuthor
      : context?.type === 'bookmarks' && context.loaded < context.total
        ? () => loadBookmarks(context.offset + 48, context.rest, true, context.tag || '')
        : null

  const onPage =
    context?.type === 'keyword'
      ? (dir) => loadKeyword(context.keyword, Math.max(1, Math.min(context.pages, context.page + dir)))
      : context?.type === 'ranking'
        ? (dir) => {
            const next = context.page + dir
            if (next < 1 || (dir > 0 && !context.hasNext)) return
            loadRanking(context.mode, context.content, next)
          }
        : null

  const pageInfo =
    context?.type === 'keyword'
      ? { page: context.page, pages: context.pages }
      : context?.type === 'ranking'
        ? { page: context.page, pages: context.hasNext ? context.page + 1 : context.page }
        : null

  return (
    <div className="app">
      {booting && (
        <div className="boot-splash">
          <div className="boot-logo">🎨</div>
          <div className="boot-title">Pixiv 批量下载工具</div>
          <div className="boot-spinner">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="boot-tip">{loggedIn ? '正在为你加载今日内容…' : '正在准备…'}</div>
        </div>
      )}
      <TopBar
        loggedIn={loggedIn}
        settings={settings}
        accountInfo={accountInfo}
        loadingAccount={loadingAccount}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onOpenHistory={openHistory}
        onOpenDownloadDir={() => api.openDownloadDir()}
        onOpenQueue={() => setShowQueue(true)}
        queueCount={runningCount + pendingCount}
        onLoadAccountInfo={loadAccountInfo}
        onOpenSponsor={() => setShowSponsor(true)}
        onOpenGuide={() => setShowGuide(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onTestProxy={() => api.testProxy()}
        onChangeSettings={async (s) => {
          setSettings(s)
          await api.setSettings(s)
        }}
        onChooseDir={async () => {
          const dir = await api.chooseDir()
          if (dir) {
            const s = { ...settings, downloadDir: dir }
            setSettings(s)
            await api.setSettings(s)
          }
        }}
      />

      <SearchBar
        onSearch={handleSearch}
        disabled={loading}
        loggedIn={loggedIn}
        onLoadBookmarkTags={loadBookmarkTags}
        activeTab={activeTab}
        onTabChange={switchTab}
      />

      <Toast toast={error ? { type: 'error', text: error } : null} onClose={() => setError('')} />
      {status && !error && <div className="banner info">{status}</div>}

      <main className="content">
        {loading && <div className="loading">加载中…</div>}

        {treasure && (
          <TreasureBox
            result={treasure}
            checkin={checkin}
            rolling={rolling}
            onRoll={refreshLuckyPics}
            onDownload={downloadLuckyPic}
            onDownloadAll={downloadAllLucky}
          />
        )}

        {users.length > 0 && (
          <UserList
            users={users}
            onPick={(u) => {
              setUsers([])
              loadAuthorWorks(u.userId).catch((e) => setError(humanizeError(e.message, 'authorId')))
            }}
          />
        )}

        {works.length > 0 && (
          <>
            <div className="grid-toolbar">
              <span className="filter-label">R18 过滤：</span>
              <div className="filter-tabs">
                {[
                  { v: 'all', t: '全部' },
                  { v: 'hide', t: '隐藏 R18' },
                  { v: 'only', t: '仅 R18' }
                ].map((f) => (
                  <button
                    key={f.v}
                    className={`tab small ${r18Filter === f.v ? 'active' : ''}`}
                    onClick={() => setR18Filter(f.v)}
                  >
                    {f.t}
                  </button>
                ))}
              </div>
              <span className="grid-count">
                显示 {visibleWorks.length} 件 · 已选 {selected.size}
              </span>
              <div className="toolbar-actions">
                {context?.type === 'author' && (
                  <button
                    className="btn primary small"
                    onClick={handleDownloadAllAuthor}
                    disabled={loading}
                    title="下载该作者全部作品（按当前 R18 过滤）"
                  >
                    ⬇ 一键下载所有（
                    {r18Filter === 'only' ? '仅R18' : r18Filter === 'hide' ? '隐藏R18' : '全部'}）
                  </button>
                )}
              </div>
            </div>
            <WorkGrid works={visibleWorks} selected={selected} onToggle={toggle} />
          </>
        )}
      </main>

      {works.length > 0 && (
        <DownloadBar
          total={visibleWorks.length}
          selectedCount={selected.size}
          pageInfo={pageInfo}
          activeJob={activeJob}
          runningCount={runningCount}
          pendingCount={pendingCount}
          onSelectAll={selectAll}
          onSelectNone={selectNone}
          onDownload={handleDownload}
          onLoadMore={onLoadMore}
          onPage={onPage}
          onOpenQueue={() => setShowQueue(true)}
        />
      )}

      {showQueue && (
        <QueuePanel
          jobs={queue}
          onClose={() => setShowQueue(false)}
          onClear={clearFinishedJobs}
          onOpenDir={(dir) => api.openPath(dir)}
          onCancel={cancelJob}
          onRetry={retryJob}
        />
      )}

      {showHistory && (
        <HistoryPanel
          items={historyItems}
          onClose={() => setShowHistory(false)}
          onClear={clearHistory}
          onOpen={(file) => api.openPath(file)}
        />
      )}

      {showSponsor && <SponsorPanel onClose={() => setShowSponsor(false)} />}

      {showGuide && <OnboardingGuide onClose={closeGuide} />}

      {confirmData && (
        <ConfirmDialog
          {...confirmData}
          onConfirm={() => closeConfirm(true)}
          onCancel={() => closeConfirm(false)}
        />
      )}
    </div>
  )
}
