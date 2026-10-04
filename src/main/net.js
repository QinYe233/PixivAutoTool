// 网络控制：代理（给 Node 全局 fetch 挂 ProxyAgent）+ 全局下载限速（时隙节流）。
//
// 背景：Electron 主进程的全局 fetch 是 undici 实现，默认「直连」，不吃系统/浏览器代理。
// 很多用户「预览能出图（Chromium 走系统代理）但下载失败（undici 直连）」正是这个原因。
// 这里通过 setGlobalDispatcher 给全局 fetch 统一挂上代理，所有现有 fetch 调用自动生效。
import { ProxyAgent, Agent, setGlobalDispatcher } from 'undici'

// ---- 代理 ----
let currentProxy = ''

/**
 * 设置全局代理。传空字符串 = 直连。
 * 仅支持 http(s):// 代理（Clash/v2ray 的混合端口 7890 亦以 HTTP 代理形式工作）。
 * 地址不合法时回退直连并抛出，供上层提示。
 */
export function setProxy(url) {
  const u = String(url || '').trim()
  if (!u) {
    currentProxy = ''
    setGlobalDispatcher(new Agent())
    return
  }
  // 允许用户只填 host:port，自动补 http://
  const normalized = /^\w+:\/\//.test(u) ? u : `http://${u}`
  try {
    setGlobalDispatcher(new ProxyAgent(normalized))
    currentProxy = normalized
  } catch (e) {
    currentProxy = ''
    setGlobalDispatcher(new Agent())
    throw e
  }
}

export function getProxy() {
  return currentProxy
}

/**
 * 测试代理是否可用：通过当前全局 dispatcher（即已设置的代理）请求 Pixiv。
 * 返回 { ok, ms, status?, message? }
 */
export async function testProxy() {
  const t0 = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch('https://www.pixiv.net/ajax/webpage/tags?lang=zh', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: ctrl.signal
    })
    // 能连通即算成功（即使 403/需登录，也说明代理通了 Pixiv）
    return { ok: true, ms: Date.now() - t0, status: res.status }
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, message: String((e && e.message) || e) }
  } finally {
    clearTimeout(timer)
  }
}

// ---- 全局下载限速（时隙节流）----
// 所有并发下载共享同一条「时间轴」：每个数据块按 大小/速率 预约一个时间片，
// 从而把总吞吐量限制在 bytesPerSec 附近，无论有多少个并发流。
let bytesPerSec = 0 // 0 = 不限速
let nextFreeAt = 0 // 下一个可用时刻（ms 时间戳）

/** 设置全局下载限速（KB/s）；0 或负 = 不限速。 */
export function setRateLimit(kbps) {
  bytesPerSec = Math.max(0, Number(kbps) || 0) * 1024
}

/** 当前限速（KB/s）；0 = 不限速。 */
export function getRateLimit() {
  return Math.round(bytesPerSec / 1024)
}

/** 为 n 字节预约发送时机；不限速时立即返回。由下载流的节流 Transform 调用。 */
export async function throttle(n) {
  if (bytesPerSec <= 0) return
  const now = Date.now()
  const start = Math.max(now, nextFreeAt)
  nextFreeAt = start + (n / bytesPerSec) * 1000
  const wait = start - now
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
}
