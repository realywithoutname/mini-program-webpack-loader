const { Tapable, SyncHook, SyncLoopHook, SyncWaterfallHook } = require('tapable')
const fs = require('fs')
const readline = require('readline')
const { ProgressPlugin } = require('webpack')
const { ConcatSource } = require('webpack-sources')
const { dirname, join } = require('path')
const Loader = require('../classes/Loader')
const FileTree = require('../classes/FileTree')
const OutPutPath = require('../classes/OutPutPath')
const ModuleHelper = require('../classes/ModuleHelper')

const FileEntryPlugin = require('./FileEntryPlugin')
const ComponentPlugin = require('./ComponentPlugin')
const MiniTemplatePlugin = require('./MiniTemplatePlugin')
const WeixinProgramPlugin = require('./WeixinProgramPlugin')

const { noop } = require('../utils')
const { normalEntry } = require('../helpers/normal-entrys')
const { calcCodeDep } = require('../helpers/calc-code-dep')
const { copyMoveFiles } = require('../helpers/copy-move-files')

const defaultOptions = {
  extfile: true,
  commonSubPackages: true,
  analyze: false,
  resources: [],
  beforeEmit: noop,
  compilationFinish: null,
  forPlugin: false,
  ignoreTabbar: false,
  entry: {
    // 入口文件的配置
    // ignore
    // accept
  }
}

const stdout = process.stdout

module.exports = class MiniProgramPlugin extends Tapable {
  constructor (options) {
    super()

    this.options = Object.assign(
      defaultOptions,
      options
    )

    this.hooks = {
      beforeCompile: new SyncHook(['file']),
      emitFile: new SyncWaterfallHook(['source', 'dists']),
      emitWxml: new SyncLoopHook(['source', 'compilation', 'dist'])
    }

    this.fileTree = new FileTree(this)

    this.startTime = Date.now()

    Loader.$applyPluginInstance(this)
  }

  apply (compiler) {
    this.compiler = compiler
    this.compiler.miniLoader = this
    this.outputPath = compiler.options.output.path

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

    this.moduleHelper = new ModuleHelper(this)

    new MiniTemplatePlugin(this).apply(compiler)
    new WeixinProgramPlugin(this).apply(compiler)
    new ComponentPlugin(this).apply(compiler)
    new ProgressPlugin({ handler: this.progress }).apply(compiler)

    compiler.hooks.environment.tap('MiniProgramPlugin', this.setEnvHook.bind(this))
    compiler.hooks.compilation.tap('MiniProgramPlugin', this.setCompilation.bind(this))
    compiler.hooks.beforeCompile.tap('MiniPlugin', this.beforeCompile.bind(this))
    compiler.hooks.emit.tapAsync('MiniProgramPlugin', this.setEmitHook.bind(this))
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

  /**
   * 根据 app.json 设置 cacheGroup
   */
  beforeCompile () {
    let appJson = this.FileEntryPlugin.getAppJson()
    let cachegroups = this.compiler.options.optimization.splitChunks.cacheGroups

    if (this.options.setSubPackageCacheGroup) {
      let groups = this.options.setSubPackageCacheGroup(this, appJson)
      Object.assign(cachegroups, groups)
    }
  }

  setCompilation (compilation) {
    this.compilation = compilation

    // 统一输出路径
    compilation.hooks.optimizeChunks.tap('MiniProgramPlugin', this.optimizeChunks.bind(this))
    compilation.mainTemplate.hooks.assetPath.tap('MiniProgramPlugin', path => this.outputUtil.get(path))
    // 添加额外文件
    compilation.hooks.additionalAssets.tapAsync('MiniProgramPlugin', callback => this.additionalAssets(compilation, callback))
  }

  /**
   * 输出打包进度
   * @param {String} progress 进度
   * @param {String} event
   * @param {*} modules
   */
  progress (progress, event, modules) {
    readline.clearLine(process.stdout)
    readline.cursorTo(process.stdout, 0)

    if (+progress === 1) return
    stdout.write(`${'正在打包: '.gray} ${`${(progress * 100).toFixed(2)}%`.green} ${event || ''} ${modules || ''}`)
  }

  /**
   * 记录 js 文件被使用次数，不添加到 fileTree 是因为添加后会导致计算 deps 复杂
   * @param {*} chunks
   */
  optimizeChunks (chunks) {
    const ignoreChunkNames = this.FileEntryPlugin.chunkNames
    const fileUsedTemp = {}

    for (const chunk of chunks) {
      // 记录模块之间依赖关系
      if (chunk.hasEntryModule() && ignoreChunkNames.indexOf(`${chunk.name}.js`) === -1) {
        for (const module of chunk.getModules()) {
          if (!module.isEntryModule()) {
            const resourcePath = module.resource
            let chunkName = chunk.name + '.js'

            const fileUsed = fileUsedTemp[resourcePath] = fileUsedTemp[resourcePath] || new Set()

            fileUsed.add(chunkName)

            module._usedModules = fileUsed
          }
        }
      }
    }
  }

  /**
   * 添加模块加载代码
   * @param {*} compilation
   * @param {*} callback
   */
  additionalAssets (compilation, callback) {
    compilation.assets['webpack-require.js'] = new ConcatSource(
      fs.readFileSync(join(__dirname, '../lib/require.js'), 'utf8')
    )
    callback()
  }

  setEmitHook (compilation, callback) {
    const assets = compilation.assets
    const { lastTimestamps = new Map() } = this
    const timestamps = this.compilation.fileTimestamps
    // 记录需要被移动的文件
    const movedFiles = []

    Object.keys(assets).forEach(dist => {
      const { source: origin } = this.fileTree.getFileByDist(dist)

      // 文件有更新，重新获取文件内容
      if ((lastTimestamps.get(origin) || this.startTime) < (timestamps.get(origin) || Infinity)) {
        const sourceCode = assets[dist]
        /**
         * 计算出真实代码
         */
        const source = calcCodeDep(this, dist, sourceCode, compilation)

        // 删除原始的数据，以计算返回的内容为准
        assets[dist] = source

        // 对于 wxml 文件，触发事件处理文件
        this.fileTree.getFileByDist(dist).isWxml &&
        this.hooks.emitWxml.call(origin, compilation, dist)
        /**
         * 获取要输出的路径列表，一个文件可能因为某些原因需要输出多份
         * [
         *  {
         *    dist: , // 文件输出的新地址
         *    usedFile: , // 引起文件被输出到新地址的文件
         *  }
         * ]
         */
        const dists = this.hooks.emitFile.call(origin)

        // 没有额外输出
        if (!dists) {
          return
        }

        // 对于输出路径和原来输出路径一致的特殊处理
        if (Array.isArray(dists) && dists.length === 1 && dists[0].dist === dist) {
          return
        }

        /**
         * 记录文件被移动的位置，最后根据依赖关系移动依赖
         * 如果 dists 为空数组，会导致这个文件直接不输出
         */
        movedFiles.push({
          dist,
          dists
        })
      }
    })

    copyMoveFiles(movedFiles, assets, this.fileTree)

    this.lastTimestamps = timestamps

    callback()
  }

  messageOutPut (err, assets) {
    const { startTime, endTime } = assets

    console.log('Build success', err, (endTime - startTime) / 1000)
  }
}
