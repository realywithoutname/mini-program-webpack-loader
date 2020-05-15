const { resolveAssetContent } = require('../../helpers/resolve-asset-content')
const { ConcatSource } = require('webpack-sources')

module.exports.loadWxmlContent = function loadContent (compilation, getFileHelper, file, loaded = {}) {
  let { deps: depSet, dist } = getFileHelper(file)
  let content = resolveAssetContent(file, dist, compilation)
  let buff = new ConcatSource()

  for (let { source, isWxs } of depSet) {
    // 依赖的文件已经添加不需要再次添加
    if (loaded[source]) continue
    loaded[source] = true

    if (isWxs) continue

    let depContent = loadContent(compilation, getFileHelper, source, loaded)

    buff.add(depContent)
  }

  buff.add(content)

  return buff
}

const NATIVE_TAGS = new Set([
  'view',
  'scroll-view',
  'swiper',
  'movable-view',
  'movable-aera',
  'cover-view',
  'cover-image',
  'icon',
  'text',
  'rich-text',
  'progress',
  'button',
  'checkbox',
  'checkbox-group',
  'form',
  'input',
  'label',
  'picker',
  'picker-view',
  'picker-view-column',
  'swiper-item',
  'radio',
  'radio-group',
  'slider',
  'switch',
  'textarea',
  'navigator',
  'functional-page-navigator',
  'audio',
  'image',
  'video',
  'camera',
  'live-player',
  'live-pusher',
  'map',
  'canvas',
  'open-data',
  'web-view',
  'ad',
  'official-account',
  'template',
  'wxs',
  'import',
  'include',
  'block',
  'slot',
  'movable-area',
  'page-meta',
  'editor'
])

module.exports.isNativeTag = function isNativeTag (tag) {
  return NATIVE_TAGS.has(tag)
}
