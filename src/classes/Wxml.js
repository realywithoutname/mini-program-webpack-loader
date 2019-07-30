const target = process.env.TARGET || 'wx'
const { DomUtils, parseDOM } = require('htmlparser2')
const { ConcatSource } = require('webpack-sources')
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

  get dom () {
    if (this._dom) return this._dom

    let content = this.buff.source().toString()
    this._dom = parseDOM(content, {
      recognizeSelfClosing: true,
      lowerCaseAttributeNames: false
    })

    return this._dom
  }

  usedComponents () {
    let tags = []
    DomUtils.find((el) => {
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
    }, this.dom, true)

    return tags
  }
}
