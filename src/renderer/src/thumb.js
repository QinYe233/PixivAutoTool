// 把 Pixiv 列表缩略图 URL 升级到更高分辨率模板，缓解小图放大导致的模糊。
// 例：/c/250x250_80_a2/ 或 /c/240x480/ -> /c/540x540_70/
export function bigThumb(url) {
  if (!url) return url
  return url.replace(/\/c\/\d+x\d+(?:_[a-z0-9]+)*\//i, '/c/540x540_70/')
}
