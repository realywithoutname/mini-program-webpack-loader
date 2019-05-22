module.exports = class WeixinProgramPlugin {
  constructor (miniLoader) {
    this.miniLoader = miniLoader
  }

  apply (compiler) {
    compiler.hooks.emit.tapAsync('MiniPlugin', this.setEmitHook.bind(this))
  }

  setEmitHook (compilation, callBack) {
    console.log('=========')
    callBack()
  }
}
