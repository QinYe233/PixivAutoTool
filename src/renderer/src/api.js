// 渲染进程调用主进程能力的薄封装
const p = window.pixiv

export const api = {
  login: () => p.login(),
  authStatus: () => p.authStatus(),
  logout: () => p.logout(),
  setCookie: (c) => p.setCookie(c),

  searchUsers: (nick) => p.searchUsers(nick),
  userArtworks: (userId) => p.userArtworks(userId),
  userArtworksPage: (userId, ids) => p.userArtworksPage(userId, ids),
  searchArtworks: (keyword, page) => p.searchArtworks(keyword, page),
  illustPages: (id) => p.illustPages(id),
  ranking: (mode, content, page) => p.ranking(mode, content, page),
  bookmarks: (offset, rest, tag) => p.bookmarks(offset, rest, tag),
  bookmarkTags: (rest) => p.bookmarkTags(rest),
  selfId: () => p.selfId(),
  accountInfo: () => p.accountInfo(),

  historyList: (limit) => p.historyList(limit),
  historyClear: () => p.historyClear(),

  chooseDir: () => p.chooseDir(),
  getSettings: () => p.getSettings(),
  setSettings: (s) => p.setSettings(s),
  testProxy: () => p.testProxy(),

  enqueueDownload: (works, opts) => p.enqueueDownload(works, opts),
  queueState: () => p.queueState(),
  clearFinishedJobs: () => p.clearFinishedJobs(),
  cancelJob: (id) => p.cancelJob(id),
  retryJob: (id) => p.retryJob(id),
  onQueueUpdate: (cb) => p.onQueueUpdate(cb),
  onJobDone: (cb) => p.onJobDone(cb),
  openPath: (path) => p.openPath(path),
  openDownloadDir: () => p.openDownloadDir(),

  winMinimize: () => p.winMinimize(),
  winMaximizeToggle: () => p.winMaximizeToggle(),
  winClose: () => p.winClose(),
  winIsMaximized: () => p.winIsMaximized(),
  onMaximizeChange: (cb) => p.onMaximizeChange(cb)
}
