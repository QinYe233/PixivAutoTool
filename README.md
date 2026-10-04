# PixivAutoTool

基于 Electron、React 和 Vite 的 Pixiv 桌面下载工具。可搜索作者、关键词和作品，浏览排行榜及自己的收藏，预览作品并将原图下载到本地。动图会转换为 GIF。

## 使用

1. 启动应用，点击右上角「登录 Pixiv」，在 Pixiv 登录窗口完成登录。
2. 选择作者名称、作者 ID、关键词、作品 ID、排行榜或我的收藏，加载作品。
3. 勾选作品并点击「下载所选」；作者页也可下载该作者的全部作品。
4. 在「队列」查看进度、取消任务或重试失败作品；在「下载历史」查看已下载文件。

默认保存位置为系统图片目录下的 `PixivAutoTool/<作者ID>/`。可在「设置」中更改下载目录、并发数、每页显示数量、HTTP 代理和全局下载限速。普通作品命名为 `<作品ID>_p<页码>.<扩展名>`，动图命名为 `<作品ID>.gif`。已有目标文件默认跳过；未完成的图片保留为 `.part`，下次尝试断点续传。

队列中的「成功」按图片页或 GIF 文件计数；解析失败按作品计数。取消任务后已经写入的文件会保留。重试失败项时，已有文件默认跳过。

登录凭据保存在 Electron 用户数据目录。系统提供加密服务时，Cookie 加密后写入 `config.json`；不提供加密服务时，Cookie 仅在当前进程内保存，重启后需要重新登录。退出登录会清除应用保存的 Cookie 和专用 Pixiv 登录会话的 Cookie。`history.json` 保存下载历史。

R18/R18G 的可见性取决于 Pixiv 账号的年龄和浏览设置。本工具的过滤器只处理账号已经能够获取的作品。

## 开发

需要 Node.js、npm 和可运行的 Electron 环境。在项目根目录执行：

```bash
npm install
npm run dev
```

验证与打包：

```bash
npm test       # 本地回归测试
npm run build  # 构建主进程、预加载脚本和前端
npm run pack   # 生成 release/win-unpacked
npm run dist   # 生成 Windows 安装包到 release/
```

`npm test` 使用 Node 的实验性 VM Modules，运行时可能显示实验特性警告。测试通过与否以命令退出码为准。打包脚本主要面向 Windows。

### 代码结构

| 路径 | 职责 |
| --- | --- |
| `src/main/index.js` | Electron 窗口、IPC、登录、代理和通知 |
| `src/main/auth.js`、`store.js` | Cookie 保管、配置持久化 |
| `src/main/pixiv.js`、`net.js` | Pixiv API、请求节流、代理与下载限速 |
| `src/main/queue.js`、`job.js` | 任务队列、作品解析和下载编排 |
| `src/main/downloader.js`、`ugoira.js` | 图片续传、动图转 GIF |
| `src/main/history.js` | 下载历史 |
| `src/preload/index.js` | 前端可调用的 IPC 桥 |
| `src/renderer/src/` | React 界面和组件 |
| `tests/` | 本地回归测试 |

### 常见问题

- 预览正常但下载失败：前端图片请求使用 Chromium 网络栈，下载使用 Node 网络栈。若网络需要代理，请在设置中填写 HTTP 代理（例如 `127.0.0.1:7890`）并测试连接。
- Electron 安装卡住：在需要镜像的环境中可设置 `ELECTRON_MIRROR` 后重新安装 Electron。
- 启动时出现 `whenReady` 未定义：检查环境变量 `ELECTRON_RUN_AS_NODE` 是否为 `1`；若是，请清除后再启动 Electron。
- 图片无法预览：先确认登录和网络连接。原图站点需要正确的 Referer，应用会在图片请求中自动添加。

## 使用范围

请遵守 Pixiv 用户协议与作者版权要求，仅下载你有权保存的内容。不要将本工具用于未经授权的传播或商业用途。

## 后续改进

已知风险、复现条件和功能建议见 [项目改进清单](docs/IMPROVEMENTS.md)。其中的条目来自代码审查，尚未全部经过真实 Pixiv 账号和大规模下载验证。
