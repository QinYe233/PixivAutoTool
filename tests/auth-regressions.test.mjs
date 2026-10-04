import test from 'node:test'
import assert from 'node:assert/strict'
import { createCookieVault, createLoginCapture, logout } from '../src/main/auth.js'

function memoryStore(initial = {}) {
  const data = { ...initial }
  return {
    data,
    get: (key, fallback) => key in data ? data[key] : fallback,
    set: (key, value) => { data[key] = value },
    remove: (key) => { delete data[key] }
  }
}

const crypto = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`sealed:${value}`),
  decryptString: (value) => value.toString().slice(7)
}

test('saved cookie is encrypted and legacy plaintext is removed', () => {
  const store = memoryStore({ pixivCookie: 'PHPSESSID=123_old' })
  const vault = createCookieVault(store, crypto)
  assert.equal(vault.getCookie(), 'PHPSESSID=123_old')
  assert.equal(store.data.pixivCookie, undefined)
  assert.equal(store.data.pixivCookieEncrypted, Buffer.from('sealed:PHPSESSID=123_old').toString('base64'))
})

test('logout clears persistent browser cookies and saved credential', async () => {
  const store = memoryStore()
  const vault = createCookieVault(store, crypto)
  vault.setCookie('PHPSESSID=123_secret')
  const calls = []
  const session = { clearStorageData: async (opts) => { calls.push(opts) } }
  await logout(vault, session)
  assert.deepEqual(calls, [{ storages: ['cookies'] }])
  assert.equal(vault.getCookie(), '')
  assert.equal(store.data.pixivCookieEncrypted, undefined)
})

test('concurrent login checks save and settle once', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  let saves = 0
  const results = []
  const capture = createLoginCapture(async () => { await gate; return { str: 'cookie', hasSession: true } }, () => { saves++ }, result => results.push(result))
  const first = capture.tryCapture()
  const second = capture.tryCapture()
  release()
  await Promise.all([first, second])
  assert.equal(saves, 1)
  assert.deepEqual(results, [{ ok: true }])
  capture.cancel()
  assert.equal(results.length, 1)
})

test('failed cookie save settles login with an error', async () => {
  const results = []
  const capture = createLoginCapture(async () => ({ str: 'cookie', hasSession: true }), () => { throw new Error('disk full') }, result => results.push(result))
  await capture.tryCapture()
  assert.deepEqual(results, [{ ok: false, error: 'disk full' }])
})
