// Pixiv AJAX API 客户端（运行在 Electron 主进程 / Node 环境）
// 所有请求都需要携带登录 Cookie，并伪装成浏览器请求头。

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let cookieProvider = () => ''

/** 由主进程注入：返回当前保存的 Cookie 字符串 */
export function setCookieProvider(fn) {
  cookieProvider = fn
}

function baseHeaders(referer = 'https://www.pixiv.net/') {
  return {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: referer,
    Cookie: cookieProvider() || ''
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- 全局请求节流 ----
// Pixiv 对短时间内的高频请求会返回 429。这里让所有 API 请求的「发起时刻」串行放行，
// 彼此至少间隔 minInterval 毫秒，从源头限制请求频率与并发，规避限流。
let minInterval = 350
let gateChain = Promise.resolve()
let lastStart = 0

/** 调整全局最小请求间隔（毫秒）；0 表示不节流。供设置面板/调试使用。 */
export function setThrottle(ms) {
  minInterval = Math.max(0, Number(ms) || 0)
}

function gate() {
  const p = gateChain.then(async () => {
    if (minInterval <= 0) return
    const now = Date.now()
    const wait = Math.max(0, lastStart + minInterval - now)
    if (wait) await sleep(wait)
    lastStart = Date.now()
  })
  // 闸门本身不应因单次异常而卡死后续请求
  gateChain = p.catch(() => {})
  return p
}

/**
 * 带退避重试的 fetch：Pixiv 在请求过密时会返回 429（限流），偶发 5xx（服务器繁忙）。
 * 遇到这些状态时，优先按响应的 Retry-After 头等待，否则指数退避，自动重试若干次。
 */
async function pixivFetch(url, options = {}, retries = 3) {
  let res
  for (let attempt = 0; ; attempt++) {
    await gate() // 全局节流：控制请求发起频率
    res = await fetch(url, options)
    // 只对「限流 / 服务器繁忙」重试；其余状态（含 4xx 鉴权错误）直接返回给上层处理
    if (res.status !== 429 && res.status < 500) return res
    if (attempt >= retries) return res

    let waitMs = 0
    const ra = res.headers.get('retry-after')
    if (ra) {
      const s = Number(ra)
      if (Number.isFinite(s)) waitMs = s * 1000
    }
    // 无 Retry-After 时指数退避：1s → 2s → 4s（上限 8s）
    if (!waitMs) waitMs = Math.min(1000 * 2 ** attempt, 8000)
    try {
      await res.arrayBuffer() // 消费响应体，及时释放连接
    } catch {
      /* ignore */
    }
    await sleep(waitMs)
  }
}

async function getJson(url, referer) {
  const res = await pixivFetch(url, { headers: baseHeaders(referer) })
  if (res.status === 401 || res.status === 403) {
    throw new Error('未登录或登录已失效，请重新登录 Pixiv')
  }
  if (res.status === 429) {
    throw new Error('请求失败 (429): Pixiv 请求过于频繁，已被临时限流，请稍等片刻再试')
  }
  if (!res.ok) {
    throw new Error(`请求失败 (${res.status}): ${url}`)
  }
  const data = await res.json()
  if (data.error) {
    throw new Error(data.message || 'Pixiv 返回错误')
  }
  return data.body
}

/** 校验当前 Cookie 是否为已登录状态。返回 {loggedIn} */
export async function checkLogin() {
  try {
    await getJson('https://www.pixiv.net/ajax/webpage/tags?lang=zh')
    return { loggedIn: true }
  } catch (e) {
    return { loggedIn: false }
  }
}

/**
 * 按作者昵称搜索用户。
 * 返回 [{ userId, name, avatar }]
 */
export async function searchUsers(nick) {
  const url = `https://www.pixiv.net/ajax/search/users?nick=${encodeURIComponent(
    nick
  )}&s_mode=s_usr&lang=zh`
  try {
    const body = await getJson(url)
    const users = (body.users?.data || body.users || []).map((u) => ({
      userId: String(u.user_id || u.userId),
      name: u.user_name || u.name,
      avatar: u.profile_img?.main || u.profileImageUrl || ''
    }))
    if (users.length) return users
  } catch (e) {
    // 接口可能变动，降级到搜索页解析
  }
  return await searchUsersFallback(nick)
}

/** 降级：解析 search_user.php 页面，抓取 /users/{id} 锚点里的 id 和昵称 */
async function searchUsersFallback(nick) {
  const url = `https://www.pixiv.net/search_user.php?nick=${encodeURIComponent(
    nick
  )}&s_mode=s_usr`
  const res = await pixivFetch(url, {
    headers: { ...baseHeaders(), Accept: 'text/html' }
  })
  const html = await res.text()

  const byId = new Map() // id -> name（优先保留非空昵称）
  // 兼容新版 /users/123 和旧版 member.php?id=123 两种链接
  const patterns = [
    /<a[^>]*href="\/users\/(\d+)"[^>]*>([^<]{0,60})<\/a>/g,
    /<a[^>]*href="[^"]*member\.php\?id=(\d+)"[^>]*>([^<]{0,60})<\/a>/g
  ]
  for (const re of patterns) {
    let m
    while ((m = re.exec(html)) !== null) {
      const id = m[1]
      const name = (m[2] || '').trim()
      if (!byId.has(id) || (!byId.get(id) && name)) byId.set(id, name)
    }
  }
  return Array.from(byId.entries()).map(([userId, name]) => ({
    userId,
    name,
    avatar: ''
  }))
}

/**
 * 获取某作者的全部作品 ID 列表（插画 + 漫画）。
 * 返回 { illustIds: string[], name, avatar }
 */
export async function getUserArtworkIds(userId) {
  const body = await getJson(
    `https://www.pixiv.net/ajax/user/${userId}/profile/all?lang=zh`,
    `https://www.pixiv.net/users/${userId}`
  )
  const illustIds = [
    ...Object.keys(body.illusts || {}),
    ...Object.keys(body.manga || {})
  ].sort((a, b) => Number(b) - Number(a))

  // 顺便取作者名
  let name = ''
  let avatar = ''
  try {
    const info = await getJson(
      `https://www.pixiv.net/ajax/user/${userId}?full=1&lang=zh`,
      `https://www.pixiv.net/users/${userId}`
    )
    name = info.name || ''
    avatar = info.imageBig || info.image || ''
  } catch (e) {
    /* ignore */
  }
  return { illustIds, name, avatar }
}

/**
 * 批量获取作品简要信息（用于预览缩略图）。
 * illustIds: string[]  -> 返回 [{ id, title, url(缩略), pageCount, userId, userName }]
 */
export async function getIllustsBrief(userId, illustIds) {
  if (!illustIds.length) return []
  const params = illustIds.map((id) => `ids[]=${id}`).join('&')
  const body = await getJson(
    `https://www.pixiv.net/ajax/user/${userId}/profile/illusts?${params}&work_category=illustManga&is_first_page=0&lang=zh`,
    `https://www.pixiv.net/users/${userId}`
  )
  const works = body.works || {}
  return illustIds
    .filter((id) => works[id])
    .map((id) => normalizeWork(works[id]))
}

/**
 * 关键字搜索作品。
 * 返回 { items: [...], total, pages }
 */
export async function searchArtworks(keyword, page = 1) {
  const url = `https://www.pixiv.net/ajax/search/artworks/${encodeURIComponent(
    keyword
  )}?word=${encodeURIComponent(
    keyword
  )}&order=date_d&mode=all&p=${page}&s_mode=s_tag&type=all&lang=zh`
  const body = await getJson(
    url,
    `https://www.pixiv.net/tags/${encodeURIComponent(keyword)}/artworks`
  )
  const section = body.illustManga || body.illust || {}
  const data = (section.data || []).filter((d) => d.id)
  return {
    items: data.map(normalizeWork),
    total: section.total || data.length,
    pages: Math.ceil((section.total || data.length) / 60)
  }
}

function normalizeWork(w) {
  return {
    id: String(w.id),
    title: w.title || '',
    thumb: w.url || w.thumb || '', // 列表缩略图
    pageCount: w.pageCount || 1,
    userId: String(w.userId || ''),
    userName: w.userName || '',
    xRestrict: w.xRestrict || 0, // 1 = R18, 2 = R18G
    illustType: w.illustType ?? 0 // 0 插画, 1 漫画, 2 动图(ugoira)
  }
}

// 从 headers 拿到（GET JSON，非 ajax 前缀的 ranking.php 也复用）
async function getRawJson(url, referer) {
  const res = await pixivFetch(url, { headers: baseHeaders(referer) })
  if (res.status === 401 || res.status === 403) {
    throw new Error('未登录或登录已失效，请重新登录 Pixiv')
  }
  if (res.status === 429) {
    throw new Error('请求失败 (429): Pixiv 请求过于频繁，已被临时限流，请稍等片刻再试')
  }
  if (!res.ok) throw new Error(`请求失败 (${res.status}): ${url}`)
  return res.json()
}

/** 获取当前登录用户自己的 userId（用于收藏夹） */
export async function getSelfUserId() {
  const data = await getRawJson(
    'https://www.pixiv.net/touch/ajax/user/self/status?lang=zh'
  )
  const uid = data?.body?.user_status?.user_id
  if (!uid || uid === '0') throw new Error('无法获取登录用户信息，请先登录')
  return String(uid)
}

/**
 * 当前登录账号概要，并实时探测 R18 / R18G 浏览权限。
 * 返回 { loggedIn, userId, userName, userAccount, premium, mail, r18, r18g }
 */
export async function getAccountInfo() {
  const info = {
    loggedIn: false,
    userId: '',
    userName: '',
    userAccount: '',
    premium: false,
    mail: '',
    r18: false,
    r18g: false
  }
  try {
    const data = await getRawJson(
      'https://www.pixiv.net/touch/ajax/user/self/status?lang=zh'
    )
    const st = data?.body?.user_status || {}
    const uid = String(st.user_id || '')
    info.loggedIn = !!(st.is_logged_in ?? (uid && uid !== '0'))
    info.userId = uid
    info.userName = st.user_name || ''
    info.userAccount = st.user_account || ''
    info.premium =
      st.premium === 'yes' || st.premium === true || !!st.is_premium
    info.mail = st.user_mail_address || st.mail_address || ''
  } catch (e) {
    return info // 连基本信息都取不到，视为未登录
  }
  // R18 榜/ R18G 榜能拿到内容 => 账号已开启对应浏览权限
  info.r18 = await probeRanking('daily_r18')
  info.r18g = await probeRanking('r18g')
  return info
}

async function probeRanking(mode) {
  try {
    const res = await pixivFetch(
      `https://www.pixiv.net/ranking.php?mode=${mode}&content=all&p=1&format=json`,
      { headers: baseHeaders('https://www.pixiv.net/ranking.php') }
    )
    if (!res.ok) return false
    const j = await res.json()
    return !j.error && Array.isArray(j.contents) && j.contents.length > 0
  } catch {
    return false
  }
}

/**
 * 排行榜。
 * @param mode daily|weekly|monthly|rookie|original|male|female|daily_r18|weekly_r18|male_r18|female_r18
 * @param content all|illust|ugoira|manga
 * @param page 1..10
 * 返回 { items, page, hasNext }
 */
export async function getRanking(mode = 'daily', content = 'all', page = 1) {
  const url = `https://www.pixiv.net/ranking.php?mode=${mode}&content=${content}&p=${page}&format=json`
  const data = await getRawJson(url, 'https://www.pixiv.net/ranking.php')
  const items = (data.contents || []).map((c) => ({
    id: String(c.illust_id),
    title: c.title || '',
    thumb: c.url || '',
    pageCount: c.illust_page_count ? Number(c.illust_page_count) : 1,
    userId: String(c.user_id || ''),
    userName: c.user_name || '',
    xRestrict: mode.includes('r18') ? 1 : 0,
    illustType: Number(c.illust_type || 0),
    width: Number(c.width || 0),
    height: Number(c.height || 0),
    rank: c.rank
  }))
  return { items, page, hasNext: !!data.next }
}

/**
 * 当前登录用户的收藏夹。
 * @param userId 自己的 userId
 * @param offset 偏移
 * @param rest show(公开)|hide(不公开)
 * @param tag 收藏分类标签（可空）
 * 返回 { items, total }
 */
export async function getBookmarks(userId, offset = 0, rest = 'show', tag = '') {
  const url =
    `https://www.pixiv.net/ajax/user/${userId}/illusts/bookmarks?` +
    `tag=${encodeURIComponent(tag)}&offset=${offset}&limit=48&rest=${rest}&lang=zh`
  const body = await getJson(url, `https://www.pixiv.net/users/${userId}/bookmarks/artworks`)
  const works = (body.works || []).filter((w) => w && w.id && w.id !== '0')
  return { items: works.map(normalizeWork), total: body.total || works.length }
}

/**
 * 获取当前登录用户的收藏分类标签列表。
 * @param userId 自己的 userId
 * @param rest show(公开)|hide(不公开) —— 公开/不公开收藏各有独立标签集
 * 返回 [{ tag, cnt }]，按收藏数从多到少排序；不含「全部」（由 UI 自行加）
 */
export async function getBookmarkTags(userId, rest = 'show') {
  const body = await getJson(
    `https://www.pixiv.net/ajax/user/${userId}/illusts/bookmark/tags?lang=zh`,
    `https://www.pixiv.net/users/${userId}/bookmarks/artworks`
  )
  const key = rest === 'hide' ? 'private' : 'public'
  const list = (body[key] || [])
    .map((t) => ({ tag: String(t.tag || ''), cnt: Number(t.cnt || 0) }))
    .filter((t) => t.tag)
  list.sort((a, b) => b.cnt - a.cnt)
  return list
}

/**
 * 动图(ugoira)元信息。
 * 返回 { originalSrc(zip地址), mimeType, frames:[{file,delay}] }
 */
export async function getUgoiraMeta(illustId) {
  const body = await getJson(
    `https://www.pixiv.net/ajax/illust/${illustId}/ugoira_meta?lang=zh`,
    `https://www.pixiv.net/artworks/${illustId}`
  )
  return {
    originalSrc: body.originalSrc,
    src: body.src,
    mimeType: body.mime_type,
    frames: body.frames || []
  }
}

/**
 * 获取单个作品的所有原图 URL（多图作品会有多页）。
 * 返回 { id, title, userId, pages: [{ urlOriginal, urlRegular, width, height }] }
 */
export async function getIllustPages(illustId) {
  // 先取作品详情拿标题/作者
  const detail = await getJson(
    `https://www.pixiv.net/ajax/illust/${illustId}?lang=zh`,
    `https://www.pixiv.net/artworks/${illustId}`
  )
  const pages = await getJson(
    `https://www.pixiv.net/ajax/illust/${illustId}/pages?lang=zh`,
    `https://www.pixiv.net/artworks/${illustId}`
  )
  return {
    id: String(illustId),
    title: detail.title || '',
    userId: String(detail.userId || ''),
    userName: detail.userName || '',
    illustType: detail.illustType ?? 0, // 2 = 动图
    pages: pages.map((p) => ({
      urlOriginal: p.urls.original,
      urlRegular: p.urls.regular,
      width: p.width,
      height: p.height
    }))
  }
}
