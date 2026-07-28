import { useEffect } from 'react'

// 收款码缺失时的占位图（内联 SVG，避免出现「裂图」）
function placeholder(text) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect width="200" height="200" rx="14" fill="#2a2440"/>
    <rect x="8" y="8" width="184" height="184" rx="10" fill="none" stroke="#ff8fb3" stroke-dasharray="6 6" stroke-opacity="0.5"/>
    <text x="100" y="92" fill="#ffb3cc" font-size="15" text-anchor="middle" font-family="sans-serif">${text}</text>
    <text x="100" y="118" fill="#8a83a6" font-size="11" text-anchor="middle" font-family="sans-serif">请放入收款码图片</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// 赞助作者弹窗：支付宝 / 微信收款码 + 感谢语。
// 收款码图片请放到 src/renderer/public/sponsor/ 下：alipay.png、wechat.png
export default function SponsorPanel({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sponsor-overlay" onClick={onClose}>
      <div
        className="sponsor-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="sponsor-close" onClick={onClose} aria-label="关闭">
          ✕
        </button>

        <div className="sponsor-head">
          <div className="sponsor-emoji">💝</div>
          <h3 className="sponsor-title">赞助作者 [ QinYe ]</h3>
          <p className="sponsor-sub">这是一个公益项目，永久免费 · 无广告 · 无套路</p>
        </div>

        <p className="sponsor-thanks">
          如果这个小工具帮你省下了时间、带来了一点点快乐，
          <br />
          欢迎请我喝杯奶茶 🧋，你的每一份心意都是我继续更新的动力！
        </p>

        <div className="qr-row">
          <div className="qr-item">
            <img
              className="qr-img"
              src="./sponsor/alipay.png"
              alt="支付宝收款码"
              onError={(e) => {
                e.currentTarget.src = placeholder('支付宝 · Alipay')
              }}
            />
            <span className="qr-label alipay">💙 支付宝</span>
          </div>
          <div className="qr-item">
            <img
              className="qr-img"
              src="./sponsor/wechat.png"
              alt="微信收款码"
              onError={(e) => {
                e.currentTarget.src = placeholder('微信 · WeChat')
              }}
            />
            <span className="qr-label wechat">💚 微信</span>
          </div>
        </div>

        <p className="sponsor-foot">
          无论是否赞助，都感谢你的使用与支持 ✨ 愿你图图皆原图，下载不掉线~
        </p>
      </div>
    </div>
  )
}
