// Pixiv 登录凭据：仅保存系统加密后的 Cookie，并兼容迁移旧版明文配置。
export function createCookieVault(config, encryption) {
  let inMemoryCookie = ''

  function clearCookie() {
    inMemoryCookie = ''
    config.remove('pixivCookie')
    config.remove('pixivCookieEncrypted')
  }

  function setCookie(cookie) {
    inMemoryCookie = String(cookie || '')
    if (!inMemoryCookie) return clearCookie()
    if (encryption.isEncryptionAvailable()) {
      const encrypted = encryption.encryptString(inMemoryCookie).toString('base64')
      config.set('pixivCookieEncrypted', encrypted)
    } else {
      // 无系统加密服务时仅维持当前进程的登录态，不落盘明文凭据。
      config.remove('pixivCookieEncrypted')
    }
    config.remove('pixivCookie')
  }

  function getCookie() {
    if (inMemoryCookie) return inMemoryCookie
    const encrypted = config.get('pixivCookieEncrypted', '')
    if (encrypted) {
      config.remove('pixivCookie')
      try {
        inMemoryCookie = encryption.decryptString(Buffer.from(encrypted, 'base64'))
        return inMemoryCookie
      } catch {
        return ''
      }
    }
    const legacy = config.get('pixivCookie', '')
    if (legacy) setCookie(legacy)
    return inMemoryCookie
  }

  return { getCookie, setCookie, clearCookie }
}

export async function logout(vault, pixivSession) {
  await pixivSession.clearStorageData({ storages: ['cookies'] })
  vault.clearCookie()
}

// 登录页的导航事件与轮询可能同时触发；只允许一次读取与一次结算。
export function createLoginCapture(readCookie, saveCookie, settle) {
  let settled = false
  let checking = false
  function finish(result) {
    if (settled) return
    settled = true
    settle(result)
  }
  return {
    async tryCapture() {
      if (settled || checking) return
      checking = true
      try {
        let cookie
        try {
          cookie = await readCookie()
        } catch {
          return // 网络/会话临时读取错误，留待下一次轮询
        }
        if (settled || !cookie.hasSession) return
        try {
          saveCookie(cookie.str)
          finish({ ok: true })
        } catch (e) {
          finish({ ok: false, error: String(e?.message || e) })
        }
      } finally {
        checking = false
      }
    },
    cancel() { finish({ ok: false, canceled: true }) }
  }
}
