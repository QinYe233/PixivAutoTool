import { app, shell, BrowserWindow, ipcMain, session, dialog, Notification, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'
import * as store from './store.js'
import * as pixiv from './pixiv.js'
import { setCookieProvider as setDlCookie } from './downloader.js'
import { setCookieProvider as setUgoiraCookie } from './ugoira.js'
import * as net from './net.js'
import * as queue from './queue.js'
import * as history from './history.js'
import { createCookieVault, createLoginCapture, logout } from './auth.js'
import { isAllowedOpenPath } from './open-path.js'
import { createDirectoryAuthorizer } from './directory-authorization.js'

// electron-vite 将主进程打包为 CJS，__dirname 天然可用

let mainWindow = null
let directoryAuthorizer

// 是否为已打包的生产环境（开发期不做这些加固，保证可调试）
const IS_PROD = app.isPackaged

// 运行时加固：生产环境封死所有开发者工具入口，防止开控制台扒渲染层/注入
function hardenWebContents(wc) {
  if (!IS_PROD || !wc) return
  // 屏蔽 F12 / Ctrl(⌘)+Shift+I|J|C 等唤起 DevTools 的快捷键
  wc.on('before-input-event', (event, input) => {
    const k = (input.key || '').toLowerCase()
    const mod = input.control || input.meta
    if (k === 'f12' || (mod && input.shift && ['i', 'j', 'c'].includes(k))) {
      event.preventDefault()
    }
  })
  // 兜底：万一 DevTools 被以其他方式打开，立即关掉
  wc.on('devtools-opened', () => wc.closeDevTools())
}

// ---- Cookie 管理 ----
const cookieVault = createCookieVault(store, safeStorage)
const getCookie = () => cookieVault.getCookie()
pixiv.setCookieProvider(getCookie)
setDlCookie(getCookie)
setUgoiraCookie(getCookie)

// 应用代理：同时作用于 Node 全局 fetch（undici，管 API/下载）和 Chromium session（管 <img> 预览）。
// 传空 = Node 直连 + session 回到系统默认（很多用户靠系统代理让预览出图，不能强行断开）。
function applyProxy(url) {
  const u = String(url || '').trim()
  try {
    net.setProxy(u)
  } catch {
    /* 地址不合法时 net.setProxy 已回退直连 */
  }
  try {
    if (u) {
      const rules = /^\w+:\/\//.test(u) ? u : `http://${u}`
      session.defaultSession.setProxy({ proxyRules: rules })
    } else {
      session.defaultSession.setProxy({ mode: 'system' })
    }
  } catch {
    /* ignore */
  }
}

// 计算下载根目录：显式指定 > 设置里的目录 > 默认「图片/PixivAutoTool」
function resolveBaseDir(opts = {}) {
  return (
    opts.baseDir ||
    store.get('downloadDir', '') ||
    path.join(app.getPath('pictures'), 'PixivAutoTool')
  )
}

// 向所有窗口广播消息
function broadcast(channel, payload) {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  })
}

// 下载任务进入终态时：始终广播给渲染层（做提示音/横幅），仅在窗口失焦时补一条系统通知，避免重复打扰
function notifyJobDone(job) {
  if (job.status === 'cancelled') return // 用户主动终止的不打扰
  broadcast('job:done', job)

  if (!Notification.isSupported()) return
  const focused = mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()
  if (focused) return // 前台时交给渲染层提示，不弹系统通知

  const ok = job.status === 'done' && !job.failed && !job.resolveFail && !job.warning
  const failNote = `${job.failed ? `，下载失败 ${job.failed} 张` : ''}${job.resolveFail ? `，解析失败 ${job.resolveFail} 件` : ''}`
  const n = new Notification({
    title: ok ? '✅ 下载完成' : job.status === 'error' ? '⚠️ 下载出错' : '⚠️ 下载有失败项',
    body: job.status === 'done'
      ? `${job.label}｜成功 ${job.done}/${job.total} 张${failNote}${job.warning ? `；${job.warning}` : ''}`
      : `${job.label}｜${job.error || '任务出错'}`
  })
  n.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
  n.show()
}

// 从 Electron session 读取 pixiv.net 的 cookie，拼成 Cookie 头字符串
async function readPixivCookieFromSession(sess) {
  // 用 url 取，等价于请求 www.pixiv.net 时会携带的全部 cookie
  const cookies = await sess.cookies.get({ url: 'https://www.pixiv.net/' })
  const str = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  // 关键：Pixiv 对未登录访客也会下发 PHPSESSID，但登录态的值形如 "<用户ID>_<哈希>"。
  // 只有匹配 ^\d+_ 才算真正登录，否则会把游客会话误判为已登录。
  const hasSession = cookies.some(
    (c) => c.name === 'PHPSESSID' && /^\d+_/.test(c.value)
  )
  return { str, hasSession }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'Pixiv 批量下载工具',
    autoHideMenuBar: true,
    frame: false, // 去掉系统标题栏，改用应用内自绘顶栏（可拖动 + 自定义窗口按钮）
    backgroundColor: '#14111c', // 无边框窗口首帧背景，避免白闪
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      devTools: !IS_PROD // 生产禁用 DevTools
    }
  })

  hardenWebContents(mainWindow.webContents)

  // 最大化/还原状态变化时通知渲染层，切换按钮图标
  mainWindow.on('maximize', () => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('win:maximized', true)
  })
  mainWindow.on('unmaximize', () => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('win:maximized', false)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// 给所有发往 i.pximg.net 的请求注入 Referer，绕过防盗链（让前端能直接 <img> 预览）
function installRefererInjection() {
  const filter = { urls: ['https://i.pximg.net/*', 'https://*.pximg.net/*'] }
  session.defaultSession.webRequest.onBeforeSendHeaders(
    filter,
    (details, callback) => {
      details.requestHeaders['Referer'] = 'https://www.pixiv.net/'
      details.requestHeaders['User-Agent'] =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      callback({ requestHeaders: details.requestHeaders })
    }
  )
}

// ---- 登录窗口：打开 Pixiv 登录页，登录成功后自动抓取 Cookie ----
function openLoginWindow() {
  return new Promise((resolve) => {
    const loginWin = new BrowserWindow({
      width: 500,
      height: 760,
      parent: mainWindow,
      modal: false,
      title: '登录 Pixiv',
      autoHideMenuBar: true,
      webPreferences: { partition: 'persist:pixiv', devTools: !IS_PROD }
    })

    hardenWebContents(loginWin.webContents)

    const sess = loginWin.webContents.session
    loginWin.loadURL('https://accounts.pixiv.net/login?lang=zh')

    const capture = createLoginCapture(
      () => readPixivCookieFromSession(sess),
      (cookie) => cookieVault.setCookie(cookie),
      (result) => {
        resolve(result)
        if (!loginWin.isDestroyed()) loginWin.close()
      }
    )

    // 登录成功后会跳转，监听导航来探测
    loginWin.webContents.on('did-navigate', capture.tryCapture)
    loginWin.webContents.on('did-navigate-in-page', capture.tryCapture)
    // 每 2 秒兜底检查一次（cookie 可能在 XHR 后才写入）
    const timer = setInterval(capture.tryCapture, 2000)

    loginWin.on('closed', () => {
      clearInterval(timer)
      capture.cancel()
    })
  })
}

// ---- IPC 处理 ----
function registerIpc() {
  ipcMain.handle('auth:login', () => openLoginWindow())

  ipcMain.handle('auth:status', () => {
    const cookie = getCookie()
    // 同样要求 PHPSESSID 为登录态格式 <用户ID>_<哈希>
    const loggedIn = /(?:^|;\s*)PHPSESSID=\d+_/.test(cookie || '')
    return { loggedIn }
  })

  ipcMain.handle('auth:logout', async () => {
    await logout(cookieVault, session.fromPartition('persist:pixiv'))
    return { ok: true }
  })

  // 手动粘贴 Cookie（备用方式）
  ipcMain.handle('auth:setCookie', (_e, cookie) => {
    cookieVault.setCookie(cookie)
    return { ok: true }
  })

  ipcMain.handle('pixiv:searchUsers', (_e, nick) => pixiv.searchUsers(nick))

  ipcMain.handle('pixiv:userArtworks', async (_e, userId) => {
    const { illustIds, name, avatar } = await pixiv.getUserArtworkIds(userId)
    // 分批取前若干作品的缩略图（避免一次太多）
    const firstBatch = illustIds.slice(0, 60)
    const items = await pixiv.getIllustsBrief(userId, firstBatch)
    return { userId, name, avatar, illustIds, items }
  })

  ipcMain.handle('pixiv:userArtworksPage', (_e, userId, illustIds) =>
    pixiv.getIllustsBrief(userId, illustIds)
  )

  ipcMain.handle('pixiv:searchArtworks', (_e, keyword, page) =>
    pixiv.searchArtworks(keyword, page)
  )

  ipcMain.handle('pixiv:illustPages', (_e, illustId) =>
    pixiv.getIllustPages(illustId)
  )

  // 选择下载目录
  ipcMain.handle('dialog:chooseDir', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (r.canceled || !r.filePaths.length) return null
    directoryAuthorizer.authorizeSelection(r.filePaths[0])
    return r.filePaths[0]
  })

  ipcMain.handle('settings:get', () => ({
    downloadDir: store.get('downloadDir', ''),
    concurrency: store.get('concurrency', 4),
    pageSize: store.get('pageSize', 50),
    proxyUrl: store.get('proxyUrl', ''),
    speedLimit: store.get('speedLimit', 0)
  }))

  ipcMain.handle('settings:set', (_e, s) => {
    if (s.downloadDir !== undefined) store.set('downloadDir', directoryAuthorizer.saveDirectory(s.downloadDir))
    if (s.concurrency !== undefined) store.set('concurrency', s.concurrency)
    if (s.pageSize !== undefined) store.set('pageSize', s.pageSize)
    if (s.proxyUrl !== undefined) {
      store.set('proxyUrl', s.proxyUrl)
      applyProxy(s.proxyUrl)
    }
    if (s.speedLimit !== undefined) {
      const kbps = Math.max(0, Number(s.speedLimit) || 0)
      store.set('speedLimit', kbps)
      net.setRateLimit(kbps)
    }
    return { ok: true }
  })

  // 测试当前代理是否能连通 Pixiv
  ipcMain.handle('proxy:test', () => net.testProxy())

  // 当前账号信息（含 R18/R18G 浏览权限探测）
  ipcMain.handle('pixiv:accountInfo', () => pixiv.getAccountInfo())

  // 追加下载任务到队列，立即返回 { id }，不阻塞（下载中可继续追加）
  // works = [{ id, illustType, userId, title }]
  ipcMain.handle('download:enqueue', (_e, works, opts = {}) => {
    const concurrency = opts.concurrency || store.get('concurrency', 4)
    const baseDir = directoryAuthorizer.resolveJobDir(opts.baseDir)
    return queue.enqueue(
      works,
      { baseDir, concurrency, overwrite: opts.overwrite },
      opts.label
    )
  })

  ipcMain.handle('download:queue', () => queue.getState())
  ipcMain.handle('download:clearFinished', () => queue.clearFinished())
  ipcMain.handle('download:cancel', (_e, id) => queue.cancel(id))
  ipcMain.handle('download:retry', (_e, id) => queue.retry(id))

  // 打开当前下载根目录（不存在则先创建），供“常驻打开文件夹”按钮使用
  ipcMain.handle('shell:openDownloadDir', async () => {
    const dir = directoryAuthorizer.resolveJobDir()
    try {
      await fs.promises.mkdir(dir, { recursive: true })
    } catch {
      /* ignore */
    }
    return shell.openPath(dir)
  })

  // 排行榜
  ipcMain.handle('pixiv:ranking', (_e, mode, content, page) =>
    pixiv.getRanking(mode, content, page)
  )

  // 收藏夹（自动取自己 userId）
  ipcMain.handle('pixiv:bookmarks', async (_e, offset, rest, tag) => {
    const uid = await pixiv.getSelfUserId()
    return pixiv.getBookmarks(uid, offset || 0, rest || 'show', tag || '')
  })

  ipcMain.handle('pixiv:selfId', () => pixiv.getSelfUserId())

  // 收藏分类标签列表（自动取自己 userId）
  ipcMain.handle('pixiv:bookmarkTags', async (_e, rest) => {
    const uid = await pixiv.getSelfUserId()
    return pixiv.getBookmarkTags(uid, rest || 'show')
  })

  // 历史
  ipcMain.handle('history:list', (_e, limit) => history.list(limit))
  ipcMain.handle('history:clear', () => {
    history.clear()
    return { ok: true }
  })

  ipcMain.handle('shell:openPath', (_e, p) => {
    if (!isAllowedOpenPath(p, queue.getState(), history.list(5000), resolveBaseDir())) {
      throw new Error('不允许打开此路径')
    }
    return shell.openPath(p)
  })

  // ---- 无边框窗口控制 ----
  ipcMain.handle('win:minimize', () => mainWindow && mainWindow.minimize())
  ipcMain.handle('win:maximizeToggle', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle('win:close', () => mainWindow && mainWindow.close())
  ipcMain.handle('win:isMaximized', () => !!(mainWindow && mainWindow.isMaximized()))
}

// 单例锁：拒绝多开（顺带提高被注入/挂调试器的门槛）；第二个实例唤起已有窗口
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    // 生产环境：检测到调试类启动参数直接退出（与 fuses 双保险，堵住附加调试器）
    if (IS_PROD) {
      const debugging = process.argv.some((a) =>
        /--inspect|--inspect-brk|--remote-debugging-port/.test(a)
      )
      if (debugging) {
        app.quit()
        return
      }
    }

    // Windows 通知需要设置 AppUserModelID，否则通知标题会显示为 electron.exe
    app.setAppUserModelId('com.qinye.pixivautotool')
    // 应用已保存的代理与限速设置
    applyProxy(store.get('proxyUrl', ''))
    net.setRateLimit(store.get('speedLimit', 0))
    directoryAuthorizer = createDirectoryAuthorizer(
      path.join(app.getPath('pictures'), 'PixivAutoTool'),
      store.get('downloadDir', '')
    )
    installRefererInjection()
    queue.init({
      onUpdate: (state) => broadcast('queue:update', state),
      onDone: notifyJobDone,
      baseDirResolver: resolveBaseDir
    })
    registerIpc()
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
