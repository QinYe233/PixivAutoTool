# Pixiv 批量下载工具 (PixivAutoTool)

一个基于 **Electron + React + Vite** 的桌面应用：搜索 Pixiv 作品、在线预览、批量下载原图到本地。

## 功能

- 🔍 **六种入口**：作者名称 / 作者 ID / 关键字 / 作品 ID / **排行榜** / **我的收藏**
  - 排行榜支持 日/周/月/新人/原创/男女性向 及各 R18 榜，内容可选 综合/插画/动图/漫画
  - 收藏夹自动获取你自己的用户 ID，支持公开 / 不公开收藏
- 👤 作者名搜索会列出候选作者，点击即可加载其全部作品
- 🖼 **在线网格预览**（自动绕过 Pixiv 防盗链）
- 🔞 **R18 过滤器**：全部 / 隐藏 R18 / 仅 R18 一键切换（切换后会自动补齐当前页数量）
- 📥 **下载队列**：下载任务排队执行，下载过程中可继续搜索、勾选、追加新任务
- 🎞 **动图(ugoira)自动转 GIF** 下载
- ☑️ 多选勾选、全选/清空
- ⬇️ **批量下载原图**（多图作品自动下载全部分页）
- ⏯ **断点续传**：中断的文件用 `.part` 临时文件 + HTTP Range 续传，已存在文件自动跳过
- 🕘 **下载历史记录**：记录每次下载，可回看、打开文件、清空
- 📁 默认保存到 `图片/PixivAutoTool/<作者ID>/`，也可自选文件夹
- 🔐 **一键登录**：弹出 Pixiv 官方登录窗口，登录后自动抓取 Cookie，无需手动复制

## 目录结构

```
src/
  main/            Electron 主进程（Node）
    index.js       窗口/IPC/Referer 注入/登录窗口
    pixiv.js       Pixiv AJAX API 客户端
    downloader.js  并发批量下载器
    store.js       本地配置存储
  preload/
    index.js       安全的 IPC 桥（contextBridge）
  renderer/        React 前端
    index.html
    src/
      App.jsx      主逻辑
      api.js       调用主进程的封装
      components/   TopBar / SearchBar / UserList / WorkGrid / DownloadBar
      index.css
```

下载的文件命名：
- 普通/多图作品：`<作品ID>_p<页码>.<扩展名>`，例如 `123456_p0.jpg`
- 动图：`<作品ID>.gif`

主进程新增模块：`job.js`（下载任务编排）、`ugoira.js`（动图转 GIF）、`history.js`（历史记录）。

## 开发运行

```bash
npm install
npm run dev      # 启动开发模式（热更新）
```

## 打包成 exe

```bash
npm run dist     # 生成安装包到 release/ 目录
# 或
npm run pack     # 仅生成免安装目录（release/win-unpacked/）
```

## 使用步骤

1. 打开应用，点击右上角 **「登录 Pixiv」**，在弹窗中正常登录（程序自动保存登录态）
2. 选择搜索类型，输入内容，点击 **搜索**
3. 在网格中勾选想要的作品
4. （可选）点击 **⚙ 设置** 选择下载目录、调整并发数
5. 点击 **⬇ 下载所选**，完成后可点 **打开文件夹**

## 常见问题 / 环境说明

- **首次安装 Electron 卡住 / `Error: Electron uninstall`**
  Electron 二进制默认从 GitHub 下载，国内易失败。用国内镜像重装：
  ```bash
  # PowerShell
  $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
  node node_modules/electron/install.js
  ```

- **`TypeError: Cannot read properties of undefined (reading 'whenReady')`**
  说明环境里设置了 `ELECTRON_RUN_AS_NODE=1`（某些开发工具/终端会注入），
  它会让 Electron 以纯 Node 模式启动。启动前清除该变量：
  ```bash
  # PowerShell
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  npm run dev
  ```
  普通终端一般没有这个变量，可忽略。

- **图片预览不显示**：确认已登录；Pixiv 图片有防盗链，本工具已在主进程注入
  `Referer` 头处理，若仍不显示多为网络问题（Pixiv 需科学上网）。

## 关于 R18 / R18G 内容

**能否浏览与下载 R18 / R18G，完全取决于你登录的 Pixiv 账号本身的设置，本工具无法绕过。**

要看到 R18 内容，登录账号必须满足：

1. 账号出生日期为**成年**（满 18 岁）；
2. 在 Pixiv 网页版 **设置 → 浏览限制** 中开启「显示 R-18 作品」（R-18G 为独立开关）。

若账号未开启，Pixiv 服务端在响应中**就不会返回** R18 作品：R18 排行榜会报错或为空，
搜索/作者页里的 R18 作品也会被服务端过滤掉。此时本工具里的「仅 R18 / 隐藏 R18」
过滤器自然也筛不出内容。

可在 **⚙ 设置 → 账号信息** 中查看当前账号是否具备 R18 / R18G 浏览权限（程序会实时探测）。

## 免责声明

本工具仅供个人学习与备份自己收藏的作品使用。请遵守 Pixiv 用户协议，
尊重作者版权，不要用于商业用途或大规模抓取。R18 内容的可见性由用户自己的账号决定，
使用者需自行确认已达法定年龄并对下载内容负责。
