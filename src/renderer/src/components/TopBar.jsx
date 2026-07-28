import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import WindowControls from './WindowControls'

export default function TopBar({
  loggedIn,
  settings,
  accountInfo,
  loadingAccount,
  onLogin,
  onLogout,
  onChangeSettings,
  onChooseDir,
  onOpenHistory,
  onOpenDownloadDir,
  onOpenQueue,
  queueCount = 0,
  onLoadAccountInfo,
  onOpenSponsor,
  onOpenGuide,
  onTestProxy,
  theme,
  onToggleTheme
}) {
  const [showSettings, setShowSettings] = useState(false)
  const [proxyDraft, setProxyDraft] = useState(settings.proxyUrl || '')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null) // { ok, ms, status?, message? }

  // 打开设置或外部代理值变化时，同步代理输入框草稿
  useEffect(() => {
    setProxyDraft(settings.proxyUrl || '')
  }, [settings.proxyUrl, showSettings])

  // 保存代理并测试连通性
  async function applyAndTest() {
    setTesting(true)
    setTestResult(null)
    try {
      await onChangeSettings({ ...settings, proxyUrl: proxyDraft.trim() })
      const r = await onTestProxy()
      setTestResult(r)
    } catch (e) {
      setTestResult({ ok: false, message: String((e && e.message) || e) })
    } finally {
      setTesting(false)
    }
  }

  // 打开设置面板时，若已登录则拉取账号信息
  useEffect(() => {
    if (showSettings && loggedIn && !accountInfo) onLoadAccountInfo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings, loggedIn])

  // 设置弹窗：Esc 关闭
  useEffect(() => {
    if (!showSettings) return
    const onKey = (e) => e.key === 'Escape' && setShowSettings(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSettings])

  const yn = (v) => (v ? '✅ 可浏览' : '🚫 不可浏览')

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">🎨</span>
        <span>Pixiv 批量下载工具</span>
      </div>

      <div className="topbar-actions">
        <button className="btn ghost" onClick={onOpenDownloadDir}>
          📂 打开下载目录
        </button>
        <button className="btn ghost" onClick={onOpenQueue}>
          📥 队列{queueCount > 0 ? ` (${queueCount})` : ''}
        </button>
        <button className="btn ghost" onClick={onOpenHistory}>
          🕘 下载历史
        </button>
        <button
          className="btn ghost"
          onClick={onToggleTheme}
          title={theme === 'light' ? '切换到深色主题' : '切换到浅色主题'}
        >
          {theme === 'light' ? '🌙 深色' : '☀️ 浅色'}
        </button>
        <button className="btn ghost" onClick={() => setShowSettings((v) => !v)}>
          ⚙ 设置
        </button>
        <button className="btn ghost" onClick={onOpenGuide}>
          ❓ 引导
        </button>
        <button className="btn sponsor-btn" onClick={onOpenSponsor}>
          💝 赞助作者
        </button>
        {loggedIn ? (
          <>
            <span className="badge ok">● 已登录</span>
            <button className="btn ghost" onClick={onLogout}>
              退出登录
            </button>
          </>
        ) : (
          <>
            <span className="badge off">● 未登录</span>
            <button className="btn primary" onClick={onLogin}>
              登录 Pixiv
            </button>
          </>
        )}
      </div>

      <WindowControls />

      {showSettings &&
        createPortal(
          <div className="settings-overlay" onClick={() => setShowSettings(false)}>
            <div
              className="settings-modal"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="settings-head">
                <h3>⚙ 设置</h3>
                <button
                  className="settings-close"
                  onClick={() => setShowSettings(false)}
                  aria-label="关闭"
                >
                  ✕
                </button>
              </div>
              <div className="settings-body">
          <div className="setting-row">
            <label>下载目录</label>
            <div className="dir-input">
              <input
                readOnly
                value={settings.downloadDir || '(默认: 图片/PixivAutoTool/作者ID/)'}
              />
              <button className="btn" onClick={onChooseDir}>
                选择文件夹
              </button>
              {settings.downloadDir && (
                <button
                  className="btn ghost"
                  onClick={() =>
                    onChangeSettings({ ...settings, downloadDir: '' })
                  }
                >
                  恢复默认
                </button>
              )}
            </div>
          </div>
          <div className="setting-row">
            <label>并发数</label>
            <input
              type="number"
              min="1"
              max="16"
              value={settings.concurrency}
              onChange={(e) =>
                onChangeSettings({
                  ...settings,
                  concurrency: Math.max(1, Math.min(16, +e.target.value || 1))
                })
              }
              style={{ width: 80 }}
            />
          </div>
          <div className="setting-row">
            <label>单页数量</label>
            <input
              type="number"
              min="10"
              max="200"
              step="10"
              value={settings.pageSize || 50}
              onChange={(e) =>
                onChangeSettings({
                  ...settings,
                  pageSize: Math.max(10, Math.min(200, +e.target.value || 50))
                })
              }
              style={{ width: 80 }}
            />
            <span className="setting-hint">
              过滤 R18 后会自动补齐到该数量
            </span>
          </div>

          <div className="setting-row">
            <label>代理</label>
            <div className="dir-input">
              <input
                type="text"
                placeholder="如 127.0.0.1:7890（留空 = 直连 / 系统代理）"
                value={proxyDraft}
                onChange={(e) => setProxyDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyAndTest()}
              />
              <button className="btn" onClick={applyAndTest} disabled={testing}>
                {testing ? '测试中…' : '保存并测试'}
              </button>
              {settings.proxyUrl && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    setProxyDraft('')
                    setTestResult(null)
                    onChangeSettings({ ...settings, proxyUrl: '' })
                  }}
                >
                  清除
                </button>
              )}
            </div>
          </div>
          <div className="setting-row">
            <label></label>
            <div className="proxy-note">
              <span className="setting-hint">
                下载走 Node 直连、默认不吃系统代理；若「预览能出图但下载失败」，在此填 HTTP 代理即可。
              </span>
              {testResult && (
                <span
                  className="setting-hint"
                  style={{ color: testResult.ok ? '#7fe3a3' : '#ff9db0' }}
                >
                  {testResult.ok
                    ? `✅ 代理连通 Pixiv（${testResult.ms}ms，状态 ${testResult.status}）`
                    : `❌ 连接失败：${testResult.message || '无法连通'}`}
                </span>
              )}
            </div>
          </div>
          <div className="setting-row">
            <label>下载限速</label>
            <input
              type="number"
              min="0"
              step="128"
              value={settings.speedLimit || 0}
              onChange={(e) =>
                onChangeSettings({
                  ...settings,
                  speedLimit: Math.max(0, +e.target.value || 0)
                })
              }
              style={{ width: 100 }}
            />
            <span className="setting-hint">KB/s，0 = 不限速（对全部并发下载共同生效）</span>
          </div>

          <div className="setting-row account-row">
            <label>账号信息</label>
            <div className="account-box">
              {!loggedIn && <span className="account-dim">未登录</span>}
              {loggedIn && loadingAccount && (
                <span className="account-dim">正在检测账号…</span>
              )}
              {loggedIn && !loadingAccount && accountInfo && (
                <div className="account-info">
                  <div>
                    昵称：<b>{accountInfo.userName || '(未知)'}</b>
                    {accountInfo.userAccount ? `（@${accountInfo.userAccount}）` : ''}
                  </div>
                  <div>用户 ID：{accountInfo.userId || '(未知)'}</div>
                  <div>会员：{accountInfo.premium ? '✅ Premium' : '普通用户'}</div>
                  <div>R-18：{yn(accountInfo.r18)}</div>
                  <div>R-18G：{yn(accountInfo.r18g)}</div>
                  <button className="btn ghost tiny" onClick={onLoadAccountInfo}>
                    重新检测
                  </button>
                </div>
              )}
              {loggedIn && !loadingAccount && !accountInfo && (
                <button className="btn ghost tiny" onClick={onLoadAccountInfo}>
                  检测账号信息
                </button>
              )}
            </div>
          </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </header>
  )
}
