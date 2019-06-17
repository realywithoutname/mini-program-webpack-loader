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

const { noop, relative, removeExt } = require('../utils')
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

    this.moduleHelper = new ModuleHelper(this)

    new MiniTemplatePlugin(this).apply(compiler)
    new WeixinProgramPlugin(this).apply(compiler)
    new ComponentPlugin(this).apply(compiler)
    new ProgressPlugin({ handler: this.progress }).apply(compiler)

    compiler.hooks.environment.tap('MiniProgramPlugin', this.setEnvHook.bind(this))
    compiler.hooks.compilation.tap('MiniProgramPlugin', this.setCompilation.bind(this))
    this.compiler.hooks.beforeCompile.tap('MiniPlugin', this.beforeCompile.bind(this))
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

  beforeCompile () {
    let appJson = this.FileEntryPlugin.getAppJson()
    let cachegroups = this.compiler.options.optimization.splitChunks.cacheGroups

    if (this.options.setSubPackageCacheGroup) {
      let groups = this.options.setSubPackageCacheGroup(this, appJson)
      Object.assign(cachegroups, groups)
    }

    // if (appJson.subPackages) {
    //   for (const { root } of appJson.subPackages) {
    //     let name = root.replace('/', '')

    //     cachegroups[`${name}Commons`] = {
    //       name: `${root}/commonchunks`,
    //       chunks: 'initial',
    //       minSize: 0,
    //       minChunks: 1,
    //       test: module => moduleOnlyUsedBySubPackage(module, root + '/'),
    //       priority: 3
    //     }
    //   }
    // }
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

  optimizeChunks (chunks) {
    const ignoreEntrys = this.FileEntryPlugin.ignoreFiles
    const fileUsedTemp = {}

    for (const chunk of chunks) {
      if (chunk.hasEntryModule() && ignoreEntrys.indexOf(`${chunk.name}.js`) === -1) {
        // 记录模块之间依赖关系
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
        this.fileTree.getFileByDist(dist).isWxml &&
        this.hooks.emitWxml.call(origin, compilation, dist)
        /**
         * 获取要输出的路径列表
         * [
         *  '${root}/sm/path'
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

    function depDistPath (originDist, additionDist, depdist) {
      const relPath = relative(originDist, depdist)
      const depDist = join(dirname(additionDist), relPath)

      return depDist
    }

    function updateJsCode (codeSource, originDist, additionDist) {
      const reg = /require\(['"](.+?)["']\)/g
      const files = []
      let code = codeSource.source().toString()
      let matched = null

      while ((matched = reg.exec(code)) !== null) {
        let file = matched[1]

        file && files.push(file)
      }

      files.forEach(file => {
        const fileDist = join(dirname(originDist), file)
        const relPath = relative(additionDist, fileDist)

        code = code.replaceAll(file, relPath)
      })

      //  有点危险，为了解决 webpack require 如果已经加载模块就不执行导致报 Component 为定义的问题
      code = code.replaceAll(originDist, additionDist)

      return new ConcatSource(code)
    }
    /**
     * 替换依赖文件中被依赖文件的位置
     * @param {*} file
     * @param {*} dist
     * @param {*} additionDist
     */
    function updateCode (file, dist, additionDist) {
      const fileMeta = this.fileTree.getFile(file)
      // 最原始的依赖关系：相对路径
      const relPath = relative(fileMeta.dist, dist)
      // 新的依赖关系
      const depPath = relative(fileMeta.dist, additionDist)

      let code = assets[fileMeta.dist].source().toString()

      code = code.replaceAll(
        removeExt(relPath),
        removeExt(depPath)
      )

      assets[fileMeta.dist] = new ConcatSource(code)
    }

    const needCheckUsedMetas = new Set()
    const distFileTree = new Map()
    /**
     * 移动依赖的普通文件
     * @param {*} fileMeta 文件基础的数据
     * @param {*} originDist 文件一开始的输出位置
     * @param {*} additionDist 文件被拷贝的位置
     * @param {String} usedFile 引起改变的文件
     */
    function moveDep (fileMeta, originDist, additionDist, usedFile) {
      if (!distFileTree.has(usedFile)) {
        // 记录依赖该文件的新的依赖的位置，移动完成后通过根据检查依赖者的这个依赖是否有新的依赖来
        // 判断这个原来的依赖文件能不能被删除
        distFileTree.set(usedFile, new Set())
      }

      const deps = distFileTree.get(usedFile)

      deps.add(
        [
          originDist, // 最初依赖的文件位置
          additionDist // 移动位置后的文件位置
        ]
      )
      // json 文件，移动所有依赖的自定义组件文件
      fileMeta.isJson && [...fileMeta.components.values()].forEach((path) => {
        // 有些抽象组件跳过
        if (!path) return
        const { files, type } = this.fileTree.components.get(path)

        // 插件依赖跳过
        if (type.get(path) === 'plugin') return

        files.forEach(meta => {
          const depDist = depDistPath(originDist, additionDist, meta.dist)

          moveDep.call(this, meta, meta.dist, depDist, fileMeta.source)
        })
      })

      // 移动其他依赖文件
      fileMeta.deps.forEach(meta => {
        // 计算出依赖文件新的输出路径
        const depDist = depDistPath(originDist, additionDist, meta.dist)

        moveDep.call(this, meta, meta.dist, depDist, fileMeta.source)
      })

      assets[additionDist] = fileMeta.isJs ? updateJsCode(assets[originDist], originDist, additionDist) : assets[originDist]

      // 文件的先后输出位置不一致，最后需要检查是不是需要删除原始的输出文件
      if (additionDist !== originDist) {
        // 把这个被移动的文件添加到集合，最后检查是不是所有使用到这个文件的文件都有自己的依赖（拷贝了这个文件）
        needCheckUsedMetas.add(fileMeta)
      }
    }

    // TODO 对于 movedFiles 数组应该先按照依赖关系排序后再处理（不处理可能存在由于先后顺序出现 bug）
    movedFiles.forEach(({ dist, dists }) => {
      let distNeedBeRemove = true

      const fileMeta = this.fileTree.getFileByDist(dist)

      dists.forEach(({ dist: additionDist, usedFile }) => {
        // 设置标示：如果所有的输出都没有需要输出为 dist 文件的，则需要在最后把 dist 删除
        if (additionDist === dist) {
          // 有输出到原来路径的情况（如果文件就是在分包）
          // 这种情况不需要做其他操作
          distNeedBeRemove = false
          return
        }

        updateCode.call(this, usedFile, dist, additionDist)

        // 递归移动依赖的文件，
        // 因为输出文件都是使用的相对路径，所以不需要修改依赖关系
        moveDep.call(this, fileMeta, dist, additionDist, usedFile)
      })

      if (distNeedBeRemove) {
        delete assets[dist]
      }
    })

    function checkDistCanBeRemove (meta) {
      const fileHasBeDep = {}

      meta.used.forEach(user => {
        // 标识该文件是否还被这个依赖者依赖
        fileHasBeDep[user.source] = true

        // 依赖者已经移动位置的依赖
        let deps = distFileTree.get(user.source)

        // 表示依赖还是在原来的位置，也就是 meta 文件还是被他依赖，不能被删除
        if (!deps || !deps.size) {
          return
        }

        // 试图在所有已经移动位置的依赖中找到 meta 文件已经被移动，如果找到表示当前依赖者不依赖这个文件
        for (const [originDist] of deps) {
          if (originDist === meta.dist) {
            fileHasBeDep[user.source] = false
            return
          }
        }
      })

      const hasBeDepLength = Object.keys(fileHasBeDep).filter(key => fileHasBeDep[key]).length

      // 标识当前依赖关系解除
      let canBeRemove = hasBeDepLength === 0

      // 如果当前文件的依赖关系解除，需要继续依赖他的文件是否都解除了依赖
      if (canBeRemove) {
        for (const user of meta.used) {
          // 表示这个文件没有被移动，只有被移动了位置的文件才需要检查是不是还被其他没有移动的文件依赖
          if (!needCheckUsedMetas.has(user)) return canBeRemove

          canBeRemove = checkDistCanBeRemove(user)
          // 如果遇到没有解除依赖的，表示这个文件不可以被删除，则他所有依赖的文件也不能被删除
          if (!canBeRemove) return canBeRemove
        }
      }

      return canBeRemove
    }
    needCheckUsedMetas.forEach(meta => {
      // 判断这个文件能不能被删除，即判断所有依赖该文件的文件对该文件的依赖还是不是原来的依赖
      // if (/base-sku\/sku-header\/index.json/.test(meta.dist)) {
      //   debugger
      // }
      // 遍历这个需要检查的文件的依赖者，然后从所有已经移动位置的依赖中查看这个这个依赖有没有被移动位置，如果移动了
      // 说明不对这个依赖着不对该文件形成依赖，如果所有的依赖者都不形成依赖，则表示没有依赖，可以删除
      if (checkDistCanBeRemove(meta)) {
        delete assets[meta.dist]
      }
    })

    this.lastTimestamps = timestamps
    console.log('==== MiniProgramPlugin =====')

    callback()
  }

  messageOutPut (err, assets) {
    const { startTime, endTime } = assets

    console.log('Build success', err, (endTime - startTime) / 1000)
  }
}
