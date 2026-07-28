import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // 登录相关
  login: () => ipcRenderer.invoke('auth:login'),
  authStatus: () => ipcRenderer.invoke('auth:status'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  setCookie: (c) => ipcRenderer.invoke('auth:setCookie', c),

  // 搜索
  searchUsers: (nick) => ipcRenderer.invoke('pixiv:searchUsers', nick),
  userArtworks: (userId) => ipcRenderer.invoke('pixiv:userArtworks', userId),
  userArtworksPage: (userId, ids) =>
    ipcRenderer.invoke('pixiv:userArtworksPage', userId, ids),
  searchArtworks: (keyword, page) =>
    ipcRenderer.invoke('pixiv:searchArtworks', keyword, page),
  illustPages: (id) => ipcRenderer.invoke('pixiv:illustPages', id),
  ranking: (mode, content, page) =>
    ipcRenderer.invoke('pixiv:ranking', mode, content, page),
  bookmarks: (offset, rest, tag) =>
    ipcRenderer.invoke('pixiv:bookmarks', offset, rest, tag),
  bookmarkTags: (rest) => ipcRenderer.invoke('pixiv:bookmarkTags', rest),
  selfId: () => ipcRenderer.invoke('pixiv:selfId'),
  accountInfo: () => ipcRenderer.invoke('pixiv:accountInfo'),

  // 历史
  historyList: (limit) => ipcRenderer.invoke('history:list', limit),
  historyClear: () => ipcRenderer.invoke('history:clear'),

  // 设置 / 目录
  chooseDir: () => ipcRenderer.invoke('dialog:chooseDir'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),
  testProxy: () => ipcRenderer.invoke('proxy:test'),

  // 下载队列
  enqueueDownload: (works, opts) =>
    ipcRenderer.invoke('download:enqueue', works, opts),
  queueState: () => ipcRenderer.invoke('download:queue'),
  clearFinishedJobs: () => ipcRenderer.invoke('download:clearFinished'),
  cancelJob: (id) => ipcRenderer.invoke('download:cancel', id),
  retryJob: (id) => ipcRenderer.invoke('download:retry', id),
  onQueueUpdate: (cb) => {
    const listener = (_e, state) => cb(state)
    ipcRenderer.on('queue:update', listener)
    return () => ipcRenderer.removeListener('queue:update', listener)
  },
  onJobDone: (cb) => {
    const listener = (_e, job) => cb(job)
    ipcRenderer.on('job:done', listener)
    return () => ipcRenderer.removeListener('job:done', listener)
  },

  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  openDownloadDir: () => ipcRenderer.invoke('shell:openDownloadDir'),

  // 无边框窗口控制
  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winMaximizeToggle: () => ipcRenderer.invoke('win:maximizeToggle'),
  winClose: () => ipcRenderer.invoke('win:close'),
  winIsMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  onMaximizeChange: (cb) => {
    const listener = (_e, v) => cb(v)
    ipcRenderer.on('win:maximized', listener)
    return () => ipcRenderer.removeListener('win:maximized', listener)
  }
}

contextBridge.exposeInMainWorld('pixiv', api)
