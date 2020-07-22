const fs = require('fs')
const readline = require('readline')
const { Tapable, SyncHook } = require('tapable')
const { dirname, basename, join } = require('path')
const { ProgressPlugin } = require('webpack')
const { ConcatSource } = require('webpack-sources')

const { relative, removeExt } = require('../utils')

const Wxml = require('../classes/Wxml')
const Loader = require('../classes/Loader')
const FileTree = require('../classes/FileTree')
const OutPutPath = require('../classes/OutPutPath')
const ModuleHelper = require('../classes/ModuleHelper')

const FileEntryPlugin = require('./FileEntryPlugin')
const MiniTemplatePlugin = require('./MiniTemplatePlugin')

const { normalEntry } = require('../helpers/normal-entrys')
const { calcCodeDep } = require('../helpers/calc-code-dep')
const { analyzeGraph } = require('../helpers/analyze-graph')
const { getContentHash } = require('../helpers/calc-content-hash')

const defaultOptions = {
  extfile: true,
  // commonSubPackages: true,
  analyze: false,
  silently: false,
  resources: [],
  useFinalCallback: false,
  compilationFinish: null,
  // forPlugin: false,
  ignoreTabbar: false,
  optimizeIgnoreDirs: [],
  optimizeMainPackage: true,
  setSubPackageCacheGroup: null,
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
    this.undefinedTagTable = new Map()
    this.definedNotUsedTable = new Map()
    this.unDeclareComponentTable = new Map()
    this.options = Object.assign(
      defaultOptions,
      options
    )

    this.buildId = 0

    this.fileTree = new FileTree(this)

    this.startTime = Date.now()

    this.hooks = {
      apply: new SyncHook(['self'])
    }

    Loader.$applyPluginInstance(this)
  }

  apply (compiler) {
    this.compiler = compiler
    this.compiler.miniLoader = this
    this.outputPath = compiler.options.output.path

    this.miniEntrys = normalEntry(compiler.context, compiler.options.entry)
    compiler.options.entry = { main: this.miniEntrys }

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
    !this.options.silently && new ProgressPlugin({ handler: this.progress }).apply(compiler)

    compiler.hooks.environment.tap('MiniProgramPlugin', this.setEnvHook.bind(this))
    compiler.hooks.compilation.tap('MiniProgramPlugin', this.setCompilation.bind(this))
    compiler.hooks.beforeCompile.tap('MiniProgramPlugin', this.beforeCompile.bind(this))
    compiler.hooks.emit.tapAsync('MiniProgramPlugin', this.setEmitHook.bind(this))
  }

  setEnvHook () {
    let watch = this.compiler.watch
    let run = this.compiler.run
    // 下面两个地方都在使用 thisMessageOutPut, 先存起来
    const thisMessageOutPut = finalCallback => {
      const that = this

      return function () {
        return that.options.useFinalCallback && typeof finalCallback === 'function'
          ? finalCallback.apply(null, arguments)
          : that.messageOutPut.apply(that, arguments)
      }
    }

    this.compiler.watch = (options, finalCallback) => watch.call(
      this.compiler,
      this.compiler.options,
      thisMessageOutPut(finalCallback)
    )

    this.compiler.run = (finalCallback) => {
      return run.call(this.compiler, thisMessageOutPut(finalCallback))
    }
  }

  /**
   * 根据 app.json 设置 cacheGroup
   */
  beforeCompile () {
    this.undefinedTagTable.clear()
    this.definedNotUsedTable.clear()
    this.unDeclareComponentTable.clear()

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
    compilation.hooks.optimizeChunks.tap('MiniProgramPlugin', this.optimizeChunks.bind(this, compilation))
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
  optimizeChunks (compilation, chunks) {
    const ignoreChunkNames = this.FileEntryPlugin.chunkNames
    const fileUsedTemp = {}

    for (const chunk of chunks) {
      // 记录模块之间依赖关系
      if (chunk.hasEntryModule() && ignoreChunkNames.indexOf(`${chunk.name}.js`) === -1) {
        for (const module of chunk.getModules()) {
          if (!module.isEntryModule()) {
            const resourcePath = module.resource
            if (!resourcePath) {
              compilation.warnings.push(
                new Error('请不要动态 require 一个模块，或者使用内置模块')
              )
              continue
            }
            let chunkName = chunk.name + '.js'

            const fileUsed = fileUsedTemp[resourcePath] = fileUsedTemp[resourcePath] || new Set()

            fileUsed.add(chunkName)

            module._usedModules = fileUsed

            this.moduleHelper.addDep(chunkName, this.outputUtil.get(resourcePath))
          }
        }
      }
    }
  }

  hasChange (fileMeta, source) {
    const contentHash = getContentHash(this.compilation, source)
    if (fileMeta.hash === contentHash) {
      return false
    }

    fileMeta.updateHash(contentHash)

    return true
  }
  /**
   * 获取 wxml 文件中使用到的自定义组件
   * @param {*} compilation
   * @param {*} callback
   */
  setEmitHook (chunks, callback) {
    const { compilation } = this
    const { assets, fileTimestamps } = compilation
    const cantBeRemoveJsonFiles = []
    const cacheRemovedJsonFiles = {}
    const getJsonFile = (file) => join(
      dirname(file),
      `${basename(file, '.wxml')}.json`
    )

    const changeFiles = []
    Object.keys(assets).forEach(file => {
      const fileMeta = this.fileTree.getFileByDist(file)

      const hasChange = this.hasChange(fileMeta, assets[file])

      if (!hasChange) {
        // 删除的自定义组件 json 文件先暂存，在 wxml 改变后需要恢复
        fileMeta.isJson &&
        (fileMeta.isComponentFile || fileMeta.isPageFile) &&
        (cacheRemovedJsonFiles[file] = assets[file])

        cantBeRemoveJsonFiles.indexOf(file) === -1 && delete assets[file]
        return
      }

      // wxml 文件改变有可能会引起 json 文件中自定义组件的重新计算
      if (fileMeta.isWxml && (fileMeta.isComponentFile || fileMeta.isPageFile)) {
        const jsonFile = getJsonFile(file)
        // 首先去要确认 json 文件没有在之前被删除，删除了需要恢复
        if (cacheRemovedJsonFiles[jsonFile]) {
          assets[jsonFile] = cacheRemovedJsonFiles[jsonFile]
          changeFiles.push(jsonFile)
        }

        cantBeRemoveJsonFiles.push(jsonFile)
      }

      // 没有修改的文件直接不输出，减少计算
      hasChange && changeFiles.push(file)
    })

    changeFiles.forEach(file => {
      const { isTemplate, isWxml, source: filePath } = this.fileTree.getFileByDist(file)

      /**
         * 收集 wxml 文件中使用到的自定义组件
         */
      if (!isTemplate && isWxml) {
        const wxml = new Wxml(this, compilation, filePath, file)

        const usedComponents = wxml.usedComponents()

        const jsonFile = getJsonFile(filePath)

        if (fs.existsSync(jsonFile)) {
          this.fileTree.addFullComponent(jsonFile, usedComponents)
        }
      }
    })

    changeFiles.forEach(dist => {
      const meta = this.fileTree.getFileByDist(dist)
      const { source: filePath } = meta

      const sourceCode = assets[dist]
      // 文件在哪些分包使用
      const usedPkgs = this.moduleHelper.onlyUsedInSubPackagesReturnRoots(filePath)
      const subRoot = this.moduleHelper.fileIsInSubPackage(filePath)
      const ignoreOptimizeFile = this.options.optimizeIgnoreDirs.filter(dirName => dist.match(dirName)).length > 0
      /**
         * 文件在主包，并且没有被分包文件依赖，直接计算输出
         * 否则表示文件只被分包使用，需要移动到分包内
         */
      if ((!subRoot && (!usedPkgs || !usedPkgs.length)) || !this.options.optimizeMainPackage || ignoreOptimizeFile) {
        /**
         * 计算出真实代码
         */
        const source = calcCodeDep(this, dist, meta, sourceCode, depFile => {
          const distPath = this.outputUtil.get(depFile)

          this.moduleHelper.addDep(dist, distPath)
          return relative(dist, distPath)
        })

        // 删除原始的数据，以计算返回的内容为准
        assets[dist] = source

        return
      }

      /// 文件最后要输出的地址
      let outDist = []

      /**
         * 文件在分包
         */
      if (subRoot) {
        // 文件在分包，而被其他分包引用，则报错
        if (usedPkgs && usedPkgs.length && usedPkgs.some(p => p !== subRoot)) {
          throw new Error(`文件 ${dist} 在所属分包外引用，决不允许: [${usedPkgs.join(', ')}]`)
        }

        // 只需要计算依赖的文件的路径，输出路径不会被改变
        outDist.push({
          root: subRoot,
          dist
        })
      } else {
        // 在主包的，并且只被分包使用
        outDist = usedPkgs.map((root) => {
          let to = join(root, dist)
          // 如果输出文件原本就存在
          if (assets[to]) {
            throw new Error(`分包 ${root} 内存在和 ${dist} 移动后一样的文件，需要修改其中一处后才能构建`)
          }
          return {
            root,
            dist: to
          }
        })
      }

      // 删除源文件的输出
      delete assets[dist]

      outDist.forEach(({ dist, root }) => {
        /**
           * 计算出真实代码
           */
        const source = calcCodeDep(this, dist, meta, sourceCode, (depFile) => {
          const distPath = this.outputUtil.get(depFile)
          const usedPkgs = this.moduleHelper.onlyUsedInSubPackagesReturnRoots(depFile)
          const usedInSubPackage = this.moduleHelper.fileIsInSubPackage(depFile)

          const ignoreOptimizeFile = this.options.optimizeIgnoreDirs.filter(dirName => depFile.match(dirName)).length > 0

          // 依赖文件在主包并且被主包依赖，那么最后输出的路径不会变
          if ((!usedInSubPackage && !usedPkgs) || ignoreOptimizeFile) {
            this.moduleHelper.addDep(dist, distPath)
            return relative(dist, distPath)
          }

          // 不管文件在主包还是分包，最后都会移动到这个分包
          const sub = usedPkgs.filter((subpkgRoot) => subpkgRoot === root)

          // 依赖在分包被使用，那么一定应该存在一个在这个文件所在的分包被使用
          if (sub.length === 0) {
            throw new Error('...')
          }

          const depDist = usedInSubPackage ? distPath : join(root, distPath)

          this.moduleHelper.addDep(dist, distPath)
          // 移动依赖文件到子包
          return relative(dist, depDist)
        })

        // 新增文件或者替换原文件内容
        assets[dist] = source
      })
    })

    this.lastTimestamps = fileTimestamps

    callback()
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

  pushUndefinedTag (file, tags) {
    tags.forEach(tag => {
      const tagUsed = this.undefinedTagTable.get(tag) || new Set()

      if (!this.undefinedTagTable.has(tag)) {
        this.undefinedTagTable.set(tag, tagUsed)
      }

      tagUsed.add(
        this.outputUtil.get(file)
      )
    })
  }

  pushDefinedNotUsedTag (file, tags) {
    tags.forEach(tag => {
      const tagUsed = this.definedNotUsedTable.get(tag) || new Set()

      if (!this.definedNotUsedTable.has(tag)) {
        this.definedNotUsedTable.set(tag, tagUsed)
      }

      tagUsed.add(
        this.outputUtil.get(file)
      )
    })
  }

  /**
   * 添加未申明 component: true 的组件
   * @param {string} file
   */
  pushUnDeclareComponentTag (file) {
    if (this.fileTree.hasPage(removeExt(file))) {
      return
    }
    this.unDeclareComponentTable.set(this.outputUtil.get(file), [file])
  }

  messageOutPut (err, stats) {
    const log = (...rest) => (console.log(...rest) || true)

    try {
      this.options.compilationFinish &&
      this.options.compilationFinish(err, stats, this.FileEntryPlugin.getAppJson(), this)
    } catch (e) {
      stats.compilation.errors.push(e)
    }

    if (err) return log(err)

    const { startTime, endTime } = stats

    if (!this.options.silently) {
      // @ts-ignore
      readline.clearLine(process.stdout)
      readline.cursorTo(process.stdout, 0)
      stdout.write(
        `[${(new Date()).toLocaleTimeString().gray}] [${('id ' + ++this.buildId).gray}] ` +
        ((endTime - startTime) / 1000).toFixed(2) + 's ' +
        'Build finish'.green
      )

      const {
        warnings = [],
        errors = []
      } = stats.compilation
      if (warnings.length) {
        this.logError(warnings)
      }

      if (errors.length) {
        this.logError(errors)
      }
    }

    this.logWarningTable(this.undefinedTagTable, '存在未在 json 文件中定义的组件')
    this.logWarningTable(this.definedNotUsedTable, '存在定义后未被使用的组件')
    this.logWarningTable(this.unDeclareComponentTable, '存在未申明 component: true 的组件')

    analyzeGraph(stats, this.compilation)

    this.options.analyze && fs.writeFileSync(
      join(process.cwd(), 'analyze.json'),
      JSON.stringify(this.moduleHelper.toJson(), null, 2)
    )
  }

  logWarningTable (table, title) {
    const log = (...rest) => (console.log(...rest) || true)

    if (table.size) {
      log('\n')
      log(title.red)

      table.forEach((files, tag) => {
        log(`[${tag.yellow}]`)

        files.forEach(val => log('  ', val.gray))
      })
    }
  }

  logError (messages) {
    messages.forEach((err) => {
      if (!err.module || !err.module.id) {
        return console.log(err)
      }

      let message = err.message.split(/\n\n|\n/)
      let mainMessage = message[0] || ''
      let lc = mainMessage.match(/\((\d+:\d+)\)/)
      lc = lc ? lc[1] : '1:1'

      console.log('Error in file', (err.module && err.module.id + ':' + lc).red)
      console.log(mainMessage.gray)
      message[1] && console.log(message[1].gray)
      message[2] && console.log(message[2].gray)
      console.log('')
    })
  }
}
