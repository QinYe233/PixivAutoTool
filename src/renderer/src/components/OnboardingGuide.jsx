import { useEffect, useState } from 'react'

// 首次使用引导：四步走「登录 → 搜索 → 勾选 → 下载」。
// 支持 ← → 键翻页、Esc 跳过；完成/跳过后由父组件写入 localStorage 不再自动弹出。
const STEPS = [
  {
    icon: '🔑',
    title: '第 1 步 · 登录 Pixiv',
    desc: '点右上角「登录 Pixiv」，在弹出的窗口里完成登录。',
    tip: '需要科学上网才能访问 Pixiv；登录一次后会自动记住。'
  },
  {
    icon: '🔍',
    title: '第 2 步 · 搜索作品',
    desc: '顶部可切换「作者名称 / 作者ID / 关键字 / 排行榜 / 我的收藏」，输入后回车搜索。',
    tip: '还能用「R18 过滤」只看或隐藏 R18 内容。'
  },
  {
    icon: '✅',
    title: '第 3 步 · 勾选图片',
    desc: '在结果里点选想要的作品；可「全选」，或在作者页用「一键下载全部」。',
    tip: '下载进行中也能继续搜索、勾选、追加新任务，互不打断。'
  },
  {
    icon: '📥',
    title: '第 4 步 · 开始下载',
    desc: '点「下载选中」加入队列，右下角/右上角「📥 队列」可查看进度。',
    tip: '任务完成会有提示音；软件在后台时还会弹系统通知。'
  }
]

export default function OnboardingGuide({ onClose }) {
  const [step, setStep] = useState(0)
  const last = step === STEPS.length - 1
  const cur = STEPS[step]

  const prev = () => setStep((s) => Math.max(0, s - 1))
  const next = () => (last ? onClose?.() : setStep((s) => Math.min(STEPS.length - 1, s + 1)))

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  return (
    <div className="guide-overlay">
      <div className="guide-card" role="dialog" aria-modal="true">
        <button className="guide-skip" onClick={onClose}>
          跳过
        </button>

        <div className="guide-icon">{cur.icon}</div>
        <h3 className="guide-title">{cur.title}</h3>
        <p className="guide-desc">{cur.desc}</p>
        <p className="guide-tip">💡 {cur.tip}</p>

        <div className="guide-dots">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`guide-dot ${i === step ? 'active' : ''}`}
              onClick={() => setStep(i)}
            />
          ))}
        </div>

        <div className="guide-actions">
          <button className="btn ghost" onClick={prev} disabled={step === 0}>
            上一步
          </button>
          <button className="btn primary" onClick={next}>
            {last ? '开始使用 🎉' : '下一步'}
          </button>
        </div>
      </div>
    </div>
  )
}
