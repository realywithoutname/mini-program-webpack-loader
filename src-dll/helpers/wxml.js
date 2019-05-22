const { DomUtils, parseDOM } = require('htmlparser2')
const { ConcatSource } = require('webpack-sources')
const utils = require('../utils')
const { getAssetContent } = require('./compilation')

const wxNativeTags = ['view', 'scroll-view', 'swiper', 'movable-view', 'movable-aera', 'cover-view', 'cover-image', 'icon', 'text', 'rich-text', 'progress', 'button', 'checkbox', 'checkbox-group', 'form', 'input', 'label', 'picker', 'picker-view', 'picker-view-column', 'swiper-item', 'radio', 'slider', 'switch', 'textarea', 'navigator', 'functional-page-navigator', 'audio', 'image', 'video', 'camera', 'live-player', 'live-pusher', 'map', 'canvas', 'open-data', 'web-view', 'ad', 'official-account', 'template', 'wxs', 'import', 'include', 'block', 'slot']

module.exports = class Xml {
  constructor (compilation, request, platform) {
    this.request = request
    this.platform = platform
    this.compilation = compilation
    this.getDistPath = platform === 'ali'
      ? (src) => resolveDistPath(src).replace(/\.wxml$/, '.axml')
      : resolveDistPath

    this.buff = this.loadContent(request)
  }

  get content () {
    return this._content
  }

  static find (content, callback) {
    let dom = parseDOM(content, {
      recognizeSelfClosing: true,
      lowerCaseAttributeNames: false
    })
    DomUtils.find(callback, dom, true)
    return dom
  }

  /**
   * 获取一个页面或者组件所有可以使用的自定义组件列表
   * @param {*} request
   */
  static getCanUseComponents (request, useRelative = true) {
    request = request.replace('.wxml', '.json')

    let usingComponents = new Map()
    let components = null
    try {
      let fileMeta = tree.getFile(request)
      components = fileMeta.components
    } catch (e) {
      return usingComponents
    }

    const merge = (components) => {
      for (const [tag, path] of components) {
        !usingComponents.has(tag) && usingComponents.set(
          tag,
          useRelative ? utils.relative(
            resolveDistPath(request),
            resolveDistPath(path)
          ).replace('.json', '') : path
        )
      }
    }

    merge(components)

    for (const entry of tree.entry) {
      let { components } = tree.getFile(entry)

      merge(components)
    }

    return usingComponents
  }

  loadContent (entry, loaded = {}) {
    let { deps: depSet } = tree.getFile(entry)
    let content = getAssetContent(entry, this.compilation)
    let buff = new ConcatSource()

    for (let { source } of depSet) {
      // 依赖的文件已经添加不需要再次添加
      if (loaded[source]) continue

      if (/\.wxs$/.test(source)) {
        source = this.platform === 'ali' ? source.replace(/\.wxs$/, '.sjs') : source

        let originPath = utils.relative(entry, source)
        let newPath = utils.relative(this.request, source)

        content = content.replaceAll(originPath, newPath)
        continue
      }

      let depContent = this.loadContent(source)

      buff.add(depContent)

      loaded[source] = true
    }

    buff.add(content)

    return buff
  }

  hasUsingComponent (tag) {
    return wxNativeTags.indexOf(tag) === -1
  }

  writeToComponent (tags) {
    let request = this.request.replace('.wxml', '.json')
    const compoennts = Xml.getCanUseComponents(this.request)
    const undfnTags = []
    const jsonStr = getAssetContent(request, this.compilation)

    if (!jsonStr) {
      return this.compilation.errors.push(
        new Error(`文件${request.red}不存在，或者内容为空`)
      )
    }

    const jsonCode = JSON.parse(jsonStr)

    const usingComponents = jsonCode.usingComponents = jsonCode.usingComponents || {}
    const genericComponents = Object.keys(jsonCode.componentGenerics || {})

    let hasChange = false

    for (const tag of new Set(tags)) {
      if (!compoennts.has(tag)) {
        undfnTags.push(tag)
        continue
      }

      /**
       * 抽象组件不处理
       */
      if (genericComponents.indexOf(tag) !== -1) {
        continue
      }

      if (!usingComponents[tag]) {
        usingComponents[tag] = compoennts.get(tag)
        hasChange = true
      }
    }

    if (hasChange) {
      let dist = resolveDistPath(request)

      this.compilation.assets[dist] = new ConcatSource(
        JSON.stringify(jsonCode, null, 2)
      )
    }

    undfnTags.length && console.log('\n', this.getDistPath(this.request), '中使用了未定义的自定义组件:', Array.from(new Set(undfnTags)).toString().yellow)
  }

  formatComponent (handle) {
    let content = this.buff.source().toString()
    let tags = []

    const componnets = Xml.getCanUseComponents(this.request, false)

    const dom = Xml.find(content, (el) => {
      let { name, attribs = {} } = el

      if (name && this.hasUsingComponent(name)) {
        tags.push(name)
      }

      let attrKeys = Object.keys(attribs)

      /**
       * 抽象组件处理
       * 如果作死有这个鬼那就ooo了
       */
      if (/generic:/.test(attrKeys.join(';'))) {
        attrKeys.forEach(key => {
          /generic:/.test(key) && tags.push(attribs[key])
        })
      }

      handle && handle(componnets, el, componnets.has(name), this.request)
    })

    content = DomUtils.getInnerHTML({ children: dom })

    tags.length && this.writeToComponent(tags)

    return new ConcatSource(content)
  }
}
