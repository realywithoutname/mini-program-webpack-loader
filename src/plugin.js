const _ = require('lodash');
const colors = require('colors')
const loader = require('./loader')
const utils = require('./utils')
const {
  existsSync
} = require('fs');
const {
  dirname,
  join,
  relative,
  extname,
  basename,
  isAbsolute
} = require('path');
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin');
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin');
const {
  optimize,
  LoaderTargetPlugin,
  web
} = require('webpack');
const FunctionModulePlugin = require('webpack/lib/FunctionModulePlugin');
const NodeSourcePlugin = require('webpack/lib/node/NodeSourcePlugin');
const {
  NodeJsInputFileSystem,
  CachedInputFileSystem,
  ResolverFactory
} = require('enhanced-resolve');
const {
  ConcatSource,
  RawSource
} = require("webpack-sources");

const Template = require("webpack/lib/Template");

const MiniTemplate = require('./MiniTemplate')
class MiniPlugin {
  constructor(options) {
    this.options = Object.assign({
        chuksName: '__assets_chunk_name__'
      },
      options
    )

    this.appJsonCode = {
      pages: [],
      subPackages: [],
      plugins: {}
    }

    this.filesSet = new Set()
  }
  apply(compiler) {
    this.compiler = compiler
    this.outputPath = compiler.options.output.path
    this.compilerContext = join(compiler.context, 'src')
    this.loadedEntrys = false

    this.getDistFilePath = null // 在加载完入口文件后设置
    this.getPagePaths = utils.getPagePaths
    this._appending = []

    const resolver = ResolverFactory.createResolver(
      Object.assign({
        fileSystem: new CachedInputFileSystem(new NodeJsInputFileSystem(), 4000),
        extensions: []
      }, 
      compiler.options.resolve
    ));

    this.resolve = (context, file) => {
      return new Promise((resolve, reject) => {
        resolver.resolve({}, context || options.context, file, {}, (err, path) => {
          err ? reject(err) : resolve(path)
        })
      })
    }

    this.compiler.hooks.environment.tap('MiniPlugin', this.setEnvHook.bind(this))
    this.compiler.hooks.compilation.tap('MiniPlugin', this.setCompilation.bind(this))
    this.compiler.hooks.emit.tapAsync('MiniPlugin', this.setEmitHook.bind(this))
    this.compiler.hooks.additionalPass.tapAsync('MiniPlugin', this.setAdditionalPassHook.bind(this))

    loader.$applyPluginInstance(this)
    new MiniTemplate(this).apply(compiler)

    this.entrys(this.compiler.options.entry)
    this.getDistFilePath = utils.getDistPath(this.compilerContext, this.entryContexts)
  }

  setEnvHook() {
    let watch = this.compiler.watch
    this.compiler.watch = (options) => watch.call(this.compiler, this.compiler.options, this.watchCallBack.bind(this))
  }

  setAesstPathHook(path, options) {
    return this.getDistFilePath(path)
  }

  /**
   * compilation 事件处理
   * @param {*} compilation 
   */
  setCompilation(compilation) {
    /**
     * 标准输出文件名称
     */
    compilation.mainTemplate.hooks.assetPath.tap('MiniPlugin', this.setAesstPathHook.bind(this))

    /**
     * 去掉自动生成的入口
     */
    compilation.hooks.optimizeChunksBasic.tap('MiniPlugin', (chunks) => {
      chunks.forEach(({
        name
      }, index) => {
        if (name === this.options.chuksName || name === 'main') {
          return chunks.splice(index, 1);
        }
      });
    })

    /**
     * 动态添加入口文件
     */
    compilation.hooks.needAdditionalPass.tap('MiniPlugin', () => {
      return this._appending.length > 0
    })
  }

  setAdditionalPassHook(callback) {
    if (this._appending.length > 0) {
      this.addEntrys(this.compilerContext, this._appending)
    }
    this._appending = []
    callback()
  }

  setEmitHook(compilation, callback) {
    let ignoreEntrys = this.getIgnoreEntrys()

    /**
     * 合并 app.json
     */
    compilation.assets['app.json'] = this.getAppJson()

    /**
     * 直接替换 js 代码
     */
    compilation.assets['app.js'] = compilation.assets[this.mainName + '.js']

    /**
     * 合并 .wxss 代码到 app.wxss
     */
    compilation.assets['app.wxss'] = this.getAppWxss(compilation)

    /**
     * 检查一些 js 文件路径
     */
    for (const file in compilation.assets) {
      let tempFile = this.getDistFilePath(file)

      if (tempFile !== file) {
        compilation.assets[tempFile] = compilation.assets[file]
        delete compilation.assets[file]
      }

      if (ignoreEntrys.indexOf(file) > -1 || /node_modules/.test(file)) {
        delete compilation.assets[file]
      }
    }
    callback()
  }

  getAppJson() {
    /**
     *  合并所有 .json 的代码到 app.json
     */
    let code = this.appJsonCode
    code.pages = _.flattenDeep(code.pages)
    code.subPackages = _.flattenDeep(code.subPackages)

    Object.keys(code).forEach(key => {
      if (!code.key) delete code.key
    })
    return new ConcatSource(JSON.stringify(code, null, 2))
  }

  getAppWxss(compilation) {
    let entryNames = [...new Set(this.entryNames)]
    let wxssCode = ''
    entryNames.forEach(name => {
      let code = compilation.assets[name + '.wxss']
      if (code) {
        wxssCode + `/************ ${name + '.wxss'} *************/\n`
        wxssCode += code.source().toString()
      }
    })
    return new RawSource(wxssCode)
  }

  getIgnoreEntrys() {
    /**
     * 主入口为 app.json 并且只有 app.json
     */
    let entrys = this.compiler.options.entry
    if (!Array.isArray(entrys) || entrys.length === 1) {
      entrys = Array.isArray(entrys) ? entrys : [entrys]
    }

    /**
     * 多个入口，所有文件对应的原始文件将被丢弃
     */
    let entryNames = [...new Set(this.entryNames)]

    entryNames.map(name => {
      if (name !== 'app') {
        return ['.json', '.wxss', '.js'].map(ext => name + ext)
      }
      return []
    })

    entrys = _.flattenDeep(entrys)
    entrys.push(this.options.chuksName + '.js')

    return entrys
  }

  addEntrys(context, files) {
    let assetFiles = []
    let scriptFiles = files.filter(file => /\.js$/.test(file) ? true : assetFiles.push(file) && false)

    this.addAssetsEntry(context, assetFiles)
    this.addScriptEntry(context, scriptFiles)
  }

  addListenFiles(files) {
    /**
     * 添加所有已经监听的文件
     */
    files.forEach(file => {
      if (!this.filesSet.has(file)) this.filesSet.add(file)
    })
  }
  addAssetsEntry(context, entrys) {
    this.addListenFiles(entrys)

    new MultiEntryPlugin(context, entrys, this.options.chuksName).apply(this.compiler)
  }

  addScriptEntry(context, entrys) {
    this.addListenFiles(entrys)

    for (const entry of entrys) {
      let fileName = relative(context, entry).replace(extname(entry), '')
      new SingleEntryPlugin(context, entry, fileName).apply(this.compiler)
    }
  }

  checkENtry(entry) {
    if (!entry) throw new Error('entry 配置错误，可以是一个字符串和数组')

    const tempEntrys = typeof entry === typeof '' ? [entry] : entry

    if (!Array.isArray(tempEntrys) || tempEntrys.length < 1) throw new Error('entry 配置错误，必须是一个字符串和数组')

    tempEntrys.forEach((entry) => {
      if (!/\.json/.test(entry)) throw new Error('entry 配置错误，必须是 json 文件路径')
    })
  }

  entrys(entry) {
    entry = typeof entry === typeof '' ? [entry] : entry
    this.checkENtry(entry)
    let index = 0

    this.entryContexts = []
    this.entryNames = []

    for (const item of entry) {
      const entryPath = isAbsolute(item) ? item : join(context, item)

      this.checkENtry(entryPath)

      const itemContext = dirname(entryPath)
      const fileName = basename(entryPath, '.json')
      this.entryContexts.push(itemContext)
      this.entryNames.push(fileName)
      /**
       * 主入口
       */
      if (index === 0) {
        this.mainEntry = item
        this.mainContext = itemContext
        this.mainName = fileName
      }
      index++

      /**
       * 添加页面
       */
      let pageFiles = this.getPagesEntry(itemContext, entryPath)

      this.addEntrys(itemContext, pageFiles)

      /**
       * 入口文件只打包对应的 wxss 文件
       */
      let entryFiles = this.getPagePaths(itemContext, fileName, ['.wxss'])
      this.addEntrys(itemContext, entryFiles)
    }

    let mainJson = require(this.mainEntry)
    let tabBar = mainJson.tabBar

    let entrys = [
      this.getPagePaths(this.mainContext, 'project.config'),
      this.options.extfile ? this.getPagePaths(this.mainContext, 'ext') : [],
      // 打包主入口对应的 js 文件
      this.getPagePaths(this.mainContext, this.mainName, ['.js']),
    ]

    entrys.concat(
      tabBar && tabBar.list && this.getTabBarIcons(this.mainContext, tabBar.list) || []
    )

    this.addEntrys(this.mainContext, _.flattenDeep(entrys))
    /**
     * 保存主 app.json 的其他配置
     */
    delete mainJson.pages
    delete mainJson.subPackages
    delete mainJson.plugins

    this.appJsonCode = Object.assign({}, this.appJsonCode, mainJson)
  }

  /**
   * 根据 app.json 获取页面文件路径
   * @param {*} context 
   * @param {*} entry 
   */
  getPagesEntry(context, entry) {
    const {
      pages = [], subPackages = [], tabBar, window, networkTimeout, debug, plugins = {}
    } = require(entry)

    /**
     * 保存 app.json 中的内容
     */
    this.appJsonCode.pages.push(pages)
    this.appJsonCode.subPackages.push(subPackages)
    this.appJsonCode.tabBar = this.appJsonCode.tabBar || tabBar

    /**
     * 插件
     */
    Object.keys(plugins).forEach(key => {
      if (this.appJsonCode.plugins[key]) {
        if (plugins.version !== plugins[key].version) {
          console.log(`插件 ${key} 在 ${entry} 中使用了和其他入口不同的版本`.yellow)
        }
        return
      }
      this.appJsonCode.plugins[key] = plugins[key]
    })

    /**
     * 其他配置使用最前面的配置
     */
    this.appJsonCode.window = this.appJsonCode.window || window
    this.appJsonCode.networkTimeout = this.appJsonCode.networkTimeout || networkTimeout
    this.appJsonCode.debug = this.appJsonCode.debug || debug

    let pageFiles = [].concat(
      pages.map(page => this.getPagePaths(context, page)),
      subPackages && subPackages.map(
        ({
          root,
          pages
        }) => pages.map(
          page => this.getPagePaths(context, join(root, page))
        )
      ) || []
    )

    return _.flattenDeep(pageFiles)
  }

  /**
   * 获取 icon 路径
   * @param {*} context 
   * @param {*} tabs 
   */
  getTabBarIcons(context, tabs) {
    let files = []
    for (const tab of tabs) {
      let file = join(context, tab.iconPath)
      if (existsSync(file)) files.push(file)
      file = join(context, tab.selectedIconPath)
      if (existsSync(file)) files.push(file)
    }

    return files
  }


  /**
   * 输出
   * @param {*} err 
   * @param {*} stat 
   */
  watchCallBack(err, stat) {
    let {
      hash,
      startTime,
      endTime
    } = stat
    let now = (new Date()).toLocaleTimeString()

    console.log(now.green + ':' + `${this.filesSet.size}`.yellow, hash.white, (endTime - startTime + 'ms').red, '\n')
    if (stat.compilation.warnings.length) {
      console.log(stat.compilation.warnings)
    }
    if (stat.compilation.errors.length) {
      stat.compilation.errors.forEach(err => {
        let message = err.message.split('\n\n')
        let lc = message[0].match(/\((\d+:\d+)\)/)
        lc = lc ? lc[1] : '1:1'
        console.log(' ', err.name.white, (err.module && err.module.id + ':' + lc).red)
        console.log('\n' + message[1])
      })
    }
  }

  /**
   * loader 中传递需要添加为入口文件的 js 文件
   * @param {*} param0 
   */
  newFileEntry(assets) {
    // this.addListenFiles(assets)

    this._appending = this._appending.concat(assets.filter(file => !this.filesSet.has(file)))
  }
}


module.exports = MiniPlugin