const target = process.env.TARGET || 'wx'
const { DomUtils } = require('htmlparser2')
const { ConcatSource } = require('webpack-sources')
const { find } = require('../helpers/wxml-parser')
const { resolveTargetPath } = require('../helpers/resolve-target-path')
const { resolveAssetContent } = require('../helpers/resolve-asset-content')
const { loadWxmlContent, isNativeTag } = require(`../platform/${target}/wxml`)

module.exports = class Xml {
  constructor (miniLoader, compilation, request, dist) {
    this.dist = dist // 如果支持修改输出路径后，dist 就不能通过通过内部计算
    this.request = request
    this.compilation = compilation
    this.miniLoader = miniLoader

    this.getDistPath = src => miniLoader.outputUtil.get(
      resolveTargetPath(src)
    )

    this.buff = loadWxmlContent(compilation, miniLoader.fileTree.getFile.bind(miniLoader.fileTree), request)
  }

  writeToComponent (tags, components) {
    const jsonFile = this.request.replace('.wxml', '.json')
    const jsonFileDist = this.getDistPath(jsonFile)
    const jsonStr = resolveAssetContent(jsonFile, jsonFileDist, this.compilation)
    const undfnTags = []

    if (!jsonStr) {
      return this.compilation.errors.push(
        new Error(`文件${jsonFile.red}不存在，或者内容为空`)
      )
    }

    const jsonCode = JSON.parse(jsonStr)

    const usingComponents = jsonCode.usingComponents = jsonCode.usingComponents || {}
    const genericComponents = Object.keys(jsonCode.componentGenerics || {})

    let hasChange = false
    // 所有在 view 中用到的组件写到 json 文件
    for (const tag of new Set(tags)) {
      /**
       * 抽象组件不处理
       */
      if (genericComponents.indexOf(tag) !== -1) {
        continue
      }

      if (!components.has(tag)) {
        undfnTags.push(tag)
        continue
      }

      // 使用到的自定义组件写入到 json 文件
      if (!usingComponents[tag]) {
        const depComponent = components.get(tag)
        const normalComponent = typeof depComponent !== 'string'
        const componentPath = normalComponent ? depComponent.distPath : depComponent
        normalComponent && this.miniLoader.fileTree.addGlobalComponent(
          jsonFile,
          tag,
          depComponent.originPath
        )
        usingComponents[tag] = componentPath
        hasChange = true
      }
    }

    if (hasChange) {
      this.compilation.assets[jsonFileDist] = new ConcatSource(
        JSON.stringify(jsonCode, null, 2)
      )
    }

    this.miniLoader.pushUndefinedTag(this.request, Array.from(new Set(undfnTags)))
  }

  formatComponent (components, handle) {
    let content = this.buff.source().toString()
    let tags = []

    const dom = find(content, (el) => {
      let { name, attribs = {} } = el

      // 记录所有非原生组件名
      if (name && !isNativeTag(name)) {
        tags.push(name)
      }

      let attrKeys = Object.keys(attribs)

      /**
       * 使用自定义组件是抽象组件
       */
      if (/generic:/.test(attrKeys.join(';'))) {
        attrKeys.forEach(key => {
          /generic:/.test(key) && tags.push(attribs[key])
        })
      }

      handle && handle(components, el, components.has(name), this)
    })

    content = DomUtils.getInnerHTML({ children: dom })

    tags.length && this.writeToComponent(tags, components)

    return new ConcatSource(content)
  }
}
