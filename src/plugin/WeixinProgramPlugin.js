const { join } = require('path')

module.exports = class WeixinProgramPlugin {
  constructor (miniLoader) {
    this.miniLoader = miniLoader
    this.fileTree = miniLoader.fileTree
    this.miniLoader.hooks.emitFile.tap('WeixinProgramPlugin', this.emitFile.bind(this))
    // this.miniLoader.hooks.beforeCodeEmit.tap('WeixinProgramPlugin', this.beforeCodeEmit.bind(this))
  }

  apply (compiler) {
    // compiler.hooks.emit.tapAsync('WeixinProgramPlugin', this.setEmitHook.bind(this))
  }

  emitFile (source) {
    const fileMeta = this.miniLoader.fileTree.getFile(source)

    // 文件在子包，不需要移动
    if (this.miniLoader.moduleHelper.fileIsInSubPackage(source)) {
      return [{
        dist: fileMeta.dist,
        usedFile: null
      }]
    }

    const roots = this.miniLoader.moduleHelper.onlyUsedInSubPackagesReturnRoots(source)

    // 文件在主包，并且只在分包中使用，需要输出到各个分包中
    if (roots) {
      return roots.map(({ root, usedFile }) => {
        const dist = join(root, fileMeta.dist)

        return { dist, usedFile }
      })
    }

    return [{
      dist: fileMeta.dist,
      usedFile: null
    }]
  }

  setEmitHook (compilation, callBack) {
    console.log('==== WeixinProgramPlugin =====')
    callBack()
  }
}
