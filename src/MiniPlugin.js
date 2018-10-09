require('console.table')
require('colors')
const fs = require('fs')
const readline = require('readline')
const { dirname, join } = require('path')
const { ProgressPlugin } = require('webpack')

const loader = require('./loader')
const utils = require('./utils')
const MiniTemplate = require('./MiniTemplate')
const MiniProgam = require('./MiniProgram')
const AliPluginHelper = require('./ali/plugin')
const WxPluginHelper = require('./wx/plugin')
const {
  NodeJsInputFileSystem,
  CachedInputFileSystem,
  ResolverFactory
} = require('enhanced-resolve')

const stdout = process.stdout

const DEPS_MAP = {}
const COMPONENT_DEPS_MAP = {}
const ONLY_SUBPACKAGE_USED_MODULE_MAP = {}

class MiniPlugin extends MiniProgam {
  constructor (options) {
    super(options)
    this.helperPlugin = this.options.target === 'ali' ? new AliPluginHelper(this) : new WxPluginHelper(this)
  }

  apply (compiler) {
    this.compiler = compiler
    this.outputPath = compiler.options.output.path
    this.compilerContext = join(compiler.context, 'src')

    this._appending = []

    // 向 loader 中传递插件实例
    loader.$applyPluginInstance(this)

    // 使用模板插件，用于设置输出格式
    new MiniTemplate(this).apply(compiler)
    new ProgressPlugin({ handler: this.progress }).apply(compiler)

    this.helperPlugin.apply(compiler)

    const resolver = ResolverFactory.createResolver(
      Object.assign(
        {
          fileSystem: new CachedInputFileSystem(new NodeJsInputFileSystem(), 4000),
          extensions: ['.js', '.json']
        },
        this.compiler.options.resolve
      )
    )

    this.resolver = (context, request) => {
      return new Promise((resolve, reject) => {
        resolver.resolve({}, context, request, {}, (err, res) => err ? reject(err) : resolve(res))
      })
    }

    this.miniEntrys = utils.formatEntry(compiler.options.entry, this.chunkNames)

    // 获取打包后路径（在 loader 中有使用）
    this.getDistFilePath = () => {}

    // hooks
    this.compiler.hooks.environment.tap('MiniPlugin', this.setEnvHook.bind(this))
    this.compiler.hooks.beforeCompile.tapAsync('MiniPlugin', this.beforeCompile.bind(this))
    this.compiler.hooks.compilation.tap('MiniPlugin', this.setCompilation.bind(this))
    this.compiler.hooks.emit.tapAsync('MiniPlugin', this.setEmitHook.bind(this))
    this.compiler.hooks.additionalPass.tapAsync('MiniPlugin', this.setAdditionalPassHook.bind(this))
  }

  beforeCompile (params, callback) {
    this.loadEntrys(this.miniEntrys)
      .then(() => {
        let resourcePaths = new Set(
          this.entryContexts.concat(
            this.options.resources
          )
        )

        resourcePaths.add(this.compilerContext)
        // 设置子包的 cachegroup
        this.options.commonSubPackages && this.setCacheGroup()
        this.getDistFilePath = utils.getDistPath(this.compilerContext, Array.from(resourcePaths), this.outputPath)

        callback()
      })
  }
  /**
   * 重写 webpack.watch
   */
  setEnvHook () {
    let watch = this.compiler.watch
    let run = this.compiler.run

    this.compiler.watch = options => watch.call(this.compiler, this.compiler.options, this.messageOutPut.bind(this))

    this.compiler.run = () => run.call(this.compiler, this.messageOutPut.bind(this))
  }

  /**
   * 获取文件与打包输出目录的相对路径
   * @param {String} path 文件的绝对路径
   */
  getAesstPathHook (path) {
    return this.getDistFilePath(path)
  }

  /**
   * compilation 事件处理
   * @param {*} compilation
   */
  setCompilation (compilation) {
    this.helperPlugin.setCompilation && this.helperPlugin.setCompilation(compilation)
    /**
     * 标准输出文件名称
     */
    compilation.mainTemplate.hooks.assetPath.tap('MiniPlugin', this.getAesstPathHook.bind(this))

    /**
     * 检查是否有需要动态添加的入口文件，如果有需要重新编译
     */
    compilation.hooks.needAdditionalPass.tap('MiniPlugin', () => {
      return this._appending.length > 0
    })

    compilation.hooks.optimizeChunks.tap('MiniPlugin', chunks => {
      let ignoreEntrys = this.getIgnoreEntrys()
      for (const chunk of chunks) {
        if (chunk.hasEntryModule() && !ignoreEntrys.indexOf(chunk.name) !== 0) {
          // 记录模块之间依赖关系
          for (const module of chunk.getModules()) {
            if (!module.isEntryModule()) {
              const resourcePath = module.resource
              let relPath = this.getDistFilePath(resourcePath)
              let chunkName = chunk.name + '.js'
              utils.setMapValue(DEPS_MAP, relPath, chunkName)

              module._usedModules = DEPS_MAP[relPath]
            }
          }
        }
      }
    })
  }

  /**
   * 动态添加文件，有些自定义组件，对应的 js 文件需要作为入口文件。
   * @param {Function} callback webpack compilation callback
   */
  setAdditionalPassHook (callback) {
    if (this._appending.length > 0) {
      this.addEntrys(this.compilerContext, this._appending)
    }
    this._appending = []
    callback()
  }

  setEmitHook (compilation, callback) {
    let ignoreEntrys = this.getIgnoreEntrys()
    let assets = compilation.assets

    /**
     * 合并 app.json
     */
    assets['app.json'] = this.helperPlugin.getAppJsonCode()

    console.assert(assets['app.json'], 'app.json 不应该为空')
    /**
     * 直接替换 js 代码
     */
    console.assert(assets[this.mainName + '.js'], `${join(this.mainContext, this.mainName + '.js')} 不应该不存在`)
    assets['app.js'] = this.helperPlugin.getAppJsCode(assets[this.mainName + '.js'])

    /**
     * 合并 .wxss 代码到 app.wxss
     */
    assets['app.wxss'] = this.getAppWxss(compilation)

    /**
     * ext.json 如果是字符串并且存在则读取文件
     */
    if (typeof this.options.extfile === 'string') {
      assets['ext.json'] = this.getExtJson()
    }

    /**
     * 检查一些 js 文件路径
     */
    for (const file in assets) {
      let tempFile = this.getDistFilePath(file)

      if (tempFile !== file) {
        assets[tempFile] = assets[file]
        delete assets[file]
      }

      if (ignoreEntrys.indexOf(file) > -1 || /node_modules/.test(file)) {
        delete assets[file]
      }
    }
    callback()
  }

  setCacheGroup () {
    let appJson = this.getAppJson()
    let cachegroups = this.compiler.options.optimization.splitChunks.cacheGroups

    if (this.options.setSubPackageCacheGroup) {
      let groups = this.options.setSubPackageCacheGroup(this, appJson)
      Object.assign(cachegroups, groups)
      return
    }

    for (const { root } of appJson.subPackages) {
      let name = root.replace('/', '')

      cachegroups[`${name}Commons`] = {
        name: `${root}/commonchunks`,
        chunks: 'initial',
        minSize: 0,
        minChunks: 1,
        test: module => this.moduleOnlyUsedBySubPackage(module, root),
        priority: 3
      }
    }
  }

  /**
   * loader 中传递需要添加为入口文件的 js 文件
   * @param {Array} assets 组件文件数组
   * @param {Array} components 组件数组
   */
  addNewConponentFiles (assets, components, resourcePath) {
    this.options.analyze && this.setComponentDeps(components, resourcePath)
    components.forEach(component => !this.componentSet.has(component) && this.componentSet.add(component))
    this._appending = this._appending.concat(assets.filter(file => !this.filesSet.has(file)))
  }

  /**
   * 设置组件被依赖的关系
   * @param {*} components
   * @param {*} resourcePath
   */
  setComponentDeps (components, resourcePath) {
    let pagePath = this.getDistFilePath(resourcePath).replace(/\.json$/, '')

    for (let component of components) {
      component = this.getDistFilePath(component)
      utils.setMapValue(COMPONENT_DEPS_MAP, component, pagePath)
    }
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
   * 输出
   * @param {*} err
   * @param {*} stat
   */
  messageOutPut (err, stat) {
    const { hash, startTime, endTime } = stat
    const {
      warnings = [],
      errors = [],
      assets
    } = stat.compilation
    let subPackagePages = 0

    for (const [pages] of this.subpackageMap) {
      subPackagePages += pages.length
    }

    let size = 0

    for (const key in assets) {
      size += assets[key].size()
    }

    let ot = [{
      time: (new Date()).toLocaleTimeString().gray,
      status: !errors.length ? 'success'.green : 'fail'.red,
      watch: this.filesSet.size,
      page: this.pagesSet.size,
      component: this.componentSet.size,
      subpackage: this.subpackageMap.size + '/' + subPackagePages,
      duration: ((endTime - startTime) / 1000 + 's').green,
      size: ((size / 1024).toFixed(2) + ' k').green,
      hash
    }]

    if (warnings.length) {
      ot[0].warning = (warnings.length + '').yellow
      this.consoleMsg(warnings)
    }

    if (errors.length) {
      ot[0].error = (errors.length + '').red
      this.consoleMsg(errors)
    }

    if (this.options.analyze) {
      let analyzeMap = {
        fileUsed: {},
        componentUsed: {},
        onlySubPackageUsed: {}
      }
      let fileWarnings = []
      let componentWarnings = []
      let compare = (a, b) => {
        if (a.length <= b.length) {
          return -1
        }

        return 1
      }

      let commonWarnings = []
      for (const key in ONLY_SUBPACKAGE_USED_MODULE_MAP) {
        const commons = analyzeMap.onlySubPackageUsed[key] = Array.from(ONLY_SUBPACKAGE_USED_MODULE_MAP[key])

        let otherPackageFiles = this.otherPackageFiles(key, commons)
        if (otherPackageFiles.length) {
          commonWarnings.push(`子包 ${key.blue} 单独使用了 ${(otherPackageFiles.length + '').red} 个其他非子包内的文件`)
        }
      }
      commonWarnings = commonWarnings.sort(compare)

      for (const key in DEPS_MAP) {
        const files = analyzeMap.fileUsed[key] = Array.from(DEPS_MAP[key])

        if (files.length >= 20) {
          fileWarnings.push(`文件 ${key.blue} 被引用 ${(files.length + '').red} 次`)
        }
      }

      fileWarnings = fileWarnings.sort(compare)

      for (const key in COMPONENT_DEPS_MAP) {
        const components = analyzeMap.componentUsed[key] = Array.from(COMPONENT_DEPS_MAP[key])
        const packageRoot = this.pathsInSamePackage(components)

        // 组件只在子包或者某个目录下的文件中使用，提示
        if (packageRoot) { // 使用组件的文件在同一个子包内
          let isInPackage = this.pathsInSamePackage([key, components[0]])
          !isInPackage && componentWarnings.push(`自定义组件 ${key.blue} 建议移动到子包 ${packageRoot.red} 内`)
        } else if (components.length === 1 && !this.pathsInSameFolder([key, ...components])) {
          // 只有一个页面（组件）使用了该自定义组件
          componentWarnings.push(`自定义组件 ${key.blue} 建议移动到 ${dirname(components[0]).red} 目录内`)
        }
      }

      componentWarnings = componentWarnings.sort(compare)

      fileWarnings.forEach(message => console.log('提示'.yellow, message))

      console.log('')

      componentWarnings.forEach(message => console.log('提示'.yellow, message))

      console.log('')
      commonWarnings.length > 0 && console.log('建议检查以下子包，并移动独用文件到子包内'.red)
      commonWarnings.forEach(message => console.log('提示'.yellow, message))

      if (fileWarnings.length || commonWarnings.length || componentWarnings.length) {
        console.log('')
        console.log(`你可以在 ${join(this.compiler.context, 'analyze.json')} 中查看详细信息`.yellow)
        console.log('')
        console.log('  fileUsed'.green, '——'.gray, '文件被依赖关系。键为被依赖文件，值为依赖该文件的文件列表')
        console.log('  componentUsed'.green, '——'.gray, '自定义组件被依赖关系。键为被依赖的组件名，值为依赖该组件的组件(页面)列表')
        console.log('  onlySubPackageUsed'.green, '——'.gray, '子包单独使用的文件列表。键为子包名，值为该子包单独依赖的文件列表')
        console.log('')
      }
      fs.writeFileSync(join(this.compiler.context, 'analyze.json'), JSON.stringify(analyzeMap, null, 2), 'utf-8')
    }

    console.log('')
    console.table(ot)

    this.options.compilationFinish && this.options.compilationFinish(err, stat, this.getAppJson())
  }

  consoleMsg (messages) {
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

module.exports = MiniPlugin
