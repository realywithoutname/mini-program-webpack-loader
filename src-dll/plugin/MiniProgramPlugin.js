const { Tapable, SyncHook, SyncWaterfallHook } = require('tapable')
const fs = require('fs')
const { ConcatSource } = require('webpack-sources')
const { dirname, join } = require('path')

const Loader = require('../classes/Loader')
const FileTree = require('../classes/FileTree')
const OutPutPath = require('../classes/OutPutPath')
const AssetsParser = require('../classes/AssetsParser')
const FileEntryPlugin = require('./FileEntryPlugin')
const MiniTemplatePlugin = require('./MiniTemplatePlugin')
const WeixinProgramPlugin = require('./WeixinProgramPlugin')

const { noop } = require('../utils')
const { normalEntry } = require('../helpers/normal-entrys')
const { calcCodeDep } = require('../helpers/calc-code-dep')

const defaultOptions = {
  extfile: true,
  commonSubPackages: true,
  analyze: false,
  resources: [],
  beforeEmit: noop,
  compilationFinish: null,
  forPlugin: false,
  entry: {
    // 入口文件的配置
    // ignore
    // accept
  }
}

module.exports = class MiniProgramPlugin extends Tapable {
  constructor (options) {
    super()

    this.options = Object.assign(
      defaultOptions,
      options
    )

    this.hooks = {
      beforeCompile: new SyncHook(['file'])

    }

    this.fileTree = new FileTree(this)
    this.startTime = Date.now()

    Loader.$applyPluginInstance(this)
  }

  apply (compiler) {
    this.compiler = compiler
    this.compiler.miniLoader = this
    this.outputPath = compiler.options.output.path
    this.inputFileSystem = compiler.inputFileSystem

    this.miniEntrys = normalEntry(compiler.context, compiler.options.entry)

    const entryDirs = this.miniEntrys.map(entry => dirname(entry))

    // 设置计算打包后路径需要的参数（在很多地方需要使用）
    this.outputUtil = new OutPutPath(
      compiler.context,
      [
        ...entryDirs,
        ...this.options.resources
      ],
      this.outputPath
    )

    this.FileEntryPlugin = new FileEntryPlugin(this, this.options)
    this.FileEntryPlugin.apply(compiler)

    new MiniTemplatePlugin(this).apply(compiler)
    new WeixinProgramPlugin(this).apply(compiler)

    compiler.hooks.environment.tap('MiniPlugin', this.setEnvHook.bind(this))
    compiler.hooks.compilation.tap('MiniProgramPlugin', this.setCompilation.bind(this))
    compiler.hooks.emit.tapAsync('MiniPlugin', this.setEmitHook.bind(this))
  }

  setEnvHook () {
    let watch = this.compiler.watch
    let run = this.compiler.run
    // 下面两个地方都在使用 thisMessageOutPut, 先存起来
    const thisMessageOutPut = this.messageOutPut.bind(this)
    this.compiler.watch = options => watch.call(this.compiler, this.compiler.options, thisMessageOutPut)
    this.compiler.run = (customFunc) => {
      return run.call(this.compiler, function () {
        // 可能有自定义的回调方法，应该继承下
        customFunc && customFunc.apply(null, arguments)
        // 按照原有的箭头函数代码，还是返回 messageOutPut 的绑定
        return thisMessageOutPut.apply(null, arguments)
      })
    }
  }

  setCompilation (compilation) {
    this.compilation = compilation

    // 统一输出路径
    compilation.mainTemplate.hooks.assetPath.tap('MiniPlugin', path => this.outputUtil.get(path))
    // 添加额外文件
    compilation.hooks.additionalAssets.tapAsync('MiniPlugin', callback => this.additionalAssets(compilation, callback))
  }

  additionalAssets (compilation, callback) {
    compilation.assets['webpack-require.js'] = new ConcatSource(
      fs.readFileSync(join(__dirname, '../lib/require.js'), 'utf8')
    )
    callback()
  }

  setEmitHook (compilation, callback) {
    const assets = compilation.assets
    const parser = new AssetsParser(this, compilation)
    Object.keys(assets).forEach(dist => calcCodeDep(this, dist, assets[dist]))
    callback()
  }

  messageOutPut () {
    console.log('Build success')
  }
}
