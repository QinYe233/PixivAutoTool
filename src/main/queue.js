// 下载队列：任务排队，逐个执行（每个任务内部仍并发下载多张），状态实时广播给渲染进程。
// 好处：下载进行中可以继续搜索、勾选并追加新的下载任务，而不会互相阻塞。
import { runDownloadJob } from './job.js'

let jobs = [] // 对外可见的任务快照数组
const internal = new Map() // id -> { works, opts, retryWorks } （不外发，避免 IPC 传大对象）
const cancelledIds = new Set() // 已请求取消的任务 id
const controllers = new Map()
let running = false
let seq = 0
let onUpdate = () => {}
let onDone = () => {}
let resolveBaseDir = () => ''

export function init(opts = {}) {
  onUpdate = opts.onUpdate || (() => {})
  onDone = opts.onDone || (() => {})
  resolveBaseDir = opts.baseDirResolver || (() => '')
}

export function getState() {
  return jobs.map((j) => ({ ...j }))
}

function snapshot() {
  onUpdate(getState())
}

/** 追加一个下载任务，立即返回 { id }，不阻塞。 */
export function enqueue(works, opts = {}, label = '') {
  const id = `job_${++seq}`
  const baseDir = resolveBaseDir(opts)
  jobs.push({
    id,
    label: label || `下载 ${works.length} 件作品`,
    status: 'pending', // pending | running | done | error
    // 该任务包含的作品 id，供渲染层判断「是否仍在活跃队列中」以做去重（终止/完成后自动释放）
    itemIds: works.map((w) => String(w.id)),
    total: works.length,
    done: 0,
    processed: 0,
    failed: 0,
    resolveFail: 0,
    retryable: 0, // 可一键重试的失败作品数（0 = 无失败或不可重试）
    phase: 'pending',
    current: '',
    baseDir,
    error: '',
    warning: ''
  })
  internal.set(id, { works, opts: { ...opts, baseDir } })
  snapshot()
  runNext()
  return { id }
}

/** 清除已完成/出错/已取消的任务记录（保留 pending/running）。 */
export function clearFinished() {
  jobs
    .filter((j) => j.status !== 'pending' && j.status !== 'running')
    .forEach((j) => internal.delete(j.id)) // 一并释放为重试而保留的作品
  jobs = jobs.filter((j) => j.status === 'pending' || j.status === 'running')
  snapshot()
  return getState()
}

/**
 * 一键重试某个任务里下载/解析失败的作品：把这些作品作为新任务重新入队。
 * 依赖 downloader 的「跳过已存在文件」，已下好的会秒跳过，只有失败的真正重下。
 */
export function retry(id) {
  const entry = internal.get(id)
  if (!entry || !entry.retryWorks || !entry.retryWorks.length) return getState()
  const src = jobs.find((j) => j.id === id)
  // 去掉旧标签里可能已有的「· 重试…」后缀，避免多次重试后标签越接越长
  const base = String((src && src.label) || '下载').replace(/\s*·\s*重试.*$/, '')
  enqueue(entry.retryWorks, entry.opts, `${base} · 重试 ${entry.retryWorks.length} 件`)
  // 消费掉这批重试作品，避免对同一任务重复入队同一批
  internal.delete(id)
  if (src) src.retryable = 0
  snapshot()
  return getState()
}

/**
 * 取消/终止一个任务。
 * - pending：直接从队列移除（标记为 cancelled）。
 * - running：置取消标记，正在进行的任务会尽快停止（已在下载的分片会自然结束）。
 */
export function cancel(id) {
  const job = jobs.find((j) => j.id === id)
  if (!job) return getState()
  if (job.status === 'pending') {
    job.status = 'cancelled'
    job.phase = 'cancelled'
    job.current = ''
    internal.delete(id)
    snapshot()
  } else if (job.status === 'running') {
    cancelledIds.add(id)
    controllers.get(id)?.abort(new Error('任务已取消'))
    job.phase = 'cancelling'
    job.current = '正在停止…'
    snapshot()
  }
  return getState()
}

async function runNext() {
  if (running) return
  const job = jobs.find((j) => j.status === 'pending')
  if (!job) return

  running = true
  job.status = 'running'
  job.phase = 'resolve'
  snapshot()

  const { works, opts } = internal.get(job.id) || { works: [], opts: {} }
  const shouldCancel = () => cancelledIds.has(job.id)
  const controller = new AbortController()
  controllers.set(job.id, controller)
  let jobErrors = [] // 本次任务的失败明细 [{ id, message }]，用于「一键重试」
  try {
    const result = await runDownloadJob(
      works,
      job.baseDir,
      opts,
      (p) => {
        if (shouldCancel()) return
        job.phase = p.phase
        job.done = p.done
        job.processed = p.processed ?? p.done
        job.total = p.total
        job.failed = p.failed
        job.current = p.current || ''
        snapshot()
      },
      shouldCancel,
      controller.signal
    )
    jobErrors = result.errors || []
    if (shouldCancel()) {
      job.status = 'cancelled'
      job.phase = 'cancelled'
      job.done = result.done
      job.processed = result.processed
      job.total = result.total
      job.failed = result.failed
      job.baseDir = result.baseDir
      job.warning = result.warning || ''
      job.current = ''
    } else {
      job.status = 'done'
      job.total = result.total
      job.done = result.done
      job.processed = result.processed
      job.failed = result.failed
      job.baseDir = result.baseDir
      job.warning = result.warning || ''
      const errCount = (result.errors && result.errors.length) || 0
      job.resolveFail = Math.max(0, errCount - result.failed)
      job.current = ''
    }
  } catch (e) {
    if (shouldCancel()) {
      job.status = 'cancelled'
      job.phase = 'cancelled'
      job.current = ''
    } else {
      job.status = 'error'
      job.error = String((e && e.message) || e)
    }
  } finally {
    cancelledIds.delete(job.id)
    controllers.delete(job.id)
    running = false

    // 计算可重试的作品并按需保留：
    // - error（整个任务抛错）：全部作品可重试
    // - done 且有失败：仅重试「失败 illustId」对应的作品（配合跳过已存在，代价很小）
    // - 其余（全部成功 / 已取消）：清理，不保留
    let retryWorks = []
    if (job.status === 'error') {
      retryWorks = works
    } else if (job.status === 'done') {
      const failedIds = new Set(jobErrors.map((e) => String(e.id)))
      retryWorks = works.filter((w) => failedIds.has(String(w.id)))
    }
    if (retryWorks.length > 0) {
      internal.set(job.id, { works, opts, retryWorks })
      job.retryable = retryWorks.length
    } else {
      internal.delete(job.id)
      job.retryable = 0
    }

    // 任务已进入终态（done/error/cancelled），通知主进程做系统通知/提示音
    try {
      onDone({ ...job })
    } catch {
      /* ignore */
    }
    snapshot()
    runNext() // 继续下一个排队任务
  }
}
