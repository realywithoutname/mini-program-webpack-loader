const Wxml = require('../classes/Wxml')

module.exports = class ComponentPlugin {
  constructor (miniLoader) {
    this.miniLoader = miniLoader
  }

  apply (compiler) {
    this.miniLoader.hooks.emitWxml.tap('ComponentPlugin', (request, compilation, dist) => {
      const meta = this.miniLoader.fileTree.getFile(request)

      if (meta.isTemplate) return

      const wxml = new Wxml(this.miniLoader, compilation, request, dist)

      const canUseComponents = this.miniLoader.fileTree.getCanUseComponents(request, dist)
      // 检查自定义组件以及自动写入自定义组件
      wxml.formatComponent(canUseComponents)
    })
  }
}
