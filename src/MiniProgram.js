const { existsSync, readFileSync } = require('fs')
const {
  dirname,
  join,
  extname,
  basename
} = require('path')
const utils = require('./utils')
const AliPluginHelper = require('./ali/plugin')
const WxPluginHelper = require('./wx/plugin')
const FileTree = require('./FileTree')
const { ProgressPlugin } = require('webpack')
const loader = require('./loader')
const MiniTemplate = require('./MiniTemplate')

const { ConcatSource, RawSource } = require('webpack-sources')
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin')
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin')

const {
  flattenDeep,
  getFiles,
  noop
} = require('./utils')
const { reslovePagesFiles } = require('./helpers/page')
const { getEntryConfig } = require('./helpers/entry')
const { update: setAppJson, get: getAppJson, getTabBarIcons } = require('./helpers/app')
const { resolveFilesForPlugin: resolveComponentsFiles } = require('./helpers/component')
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

const mainChunkNameTemplate = '__assets_chunk_name__'
let mainChunkNameIndex = 0

module.exports = class MiniProgam {
  constructor (options) {
    global.MINI_PROGRAM_PLUGIN = this

    this.chunkNames = ['main']

    this.options = Object.assign(
      defaultOptions,
      options
    )

    this.fileTree = new FileTree()

    process.env.TARGET = this.options.target || 'wx'

    this.helperPlugin = this.options.target === 'ali' ? new AliPluginHelper(this) : new WxPluginHelper(this)
  }

  apply (compiler) {
    this.compiler = compiler
    this.outputPath = compiler.options.output.path
    this.compilerContext = join(compiler.context, 'src')

    // 向 loader 中传递插件实例
    loader.$applyPluginInstance(this)

    // 使用模板插件，用于设置输出格式
    new MiniTemplate(this).apply(compiler)
    new ProgressPlugin({ handler: this.progress }).apply(compiler)

    this.helperPlugin.apply(compiler)

    this.resolver = utils.createResolver(compiler)

    /**
     * 小程序入口文件
     */
    this.miniEntrys = utils.formatEntry(compiler.context, compiler.options.entry, this.chunkNames)

    // 设置计算打包后路径需要的参数（在很多地方需要使用）
    utils.setDistParams(this.compilerContext, this.miniEntrys, this.options.resources, this.outputPath)
  }

  getGlobalComponents () {
    return this.appJsonCode.usingComponents || {}
  }

  getExtJson () {
    if (!existsSync(this.options.extfile)) {
      console.warn(`${this.options.extfile} 文件找不到`)
      return new ConcatSource(JSON.stringify({}, null, 2))
    }

    let ext = require(this.options.extfile)
    return new ConcatSource(JSON.stringify(ext, null, 2))
  }

  getAppWxss (compilation) {
    let ext = '.wxss'
    let entryNames = [...new Set(this.entryNames)]
    let wxssCode = ''

    if (this.options.target === 'ali') {
      ext = '.acss'
      wxssCode += `
        /* polyfill */
        ${readFileSync(join(__dirname, './ali/lib/base.acss'), 'utf8')}
      `
    }

    entryNames.forEach((name) => {
      let code = compilation.assets[name + ext]
      if (code) {
        wxssCode += `/************ ${name + ext} *************/\n`
        wxssCode += code.source().toString()
      }
    })
    return new RawSource(wxssCode)
  }

  getIgnoreEntrys () {
    /**
     * 多个入口，所有文件对应的原始文件将被丢弃
     */
    let entryNames = [...new Set(this.entryNames)]

    if (this.options.forPlugin) {
      entryNames.splice(entryNames.indexOf('plugin'))
    }

    entryNames = entryNames.map((name) => {
      if (name === 'app') return []
      return ['.json', '.wxss', '.js'].map(ext => name + ext)
    })

    entryNames = flattenDeep(entryNames)

    /**
     * 静态资源的主文件
     */
    entryNames = entryNames.concat(
      this.chunkNames.map(chunkName => chunkName + '.js')
    )

    return entryNames
  }

  addEntrys (context, files) {
    let assetFiles = []
    let scriptFiles = []

    files = flattenDeep(files)

    files.forEach(file => /\.js$/.test(file) ? scriptFiles.push(file) : assetFiles.push(file))

    this.addAssetsEntry(context, assetFiles)
    this.addScriptEntry(context, scriptFiles)
  }

  addAssetsEntry (context, entrys) {
    let chunkName = mainChunkNameTemplate + mainChunkNameIndex
    this.chunkNames.push(chunkName)
    new MultiEntryPlugin(context, entrys, chunkName).apply(this.compiler)

    // 自动生成
    mainChunkNameIndex++
  }

  addScriptEntry (context, entrys) {
    for (const entry of entrys) {
      let fileName = utils.getDistPath(entry).replace(extname(entry), '')
      new SingleEntryPlugin(context, entry, fileName).apply(this.compiler)
    }
  }

  async getEntryConfig (entry, config) {
    let entryConfig = this.options.entry[entry]
    if (!entryConfig) return config

    return await getEntryConfig(entryConfig, config)
  }

  async loadEntrys (entry) {
    let index = 0
    let componentFiles = {}

    this.entryNames = []

    for (const entryPath of entry) {
      const itemContext = dirname(entryPath)
      const fileName = basename(entryPath, '.json')

      this.entryNames.push(fileName)

      /**
       * 主入口
       */
      if (index === 0) {
        this.mainEntry = entryPath
        this.mainContext = itemContext
        this.mainName = fileName
        index++
      }

      /**
       * 获取配置信息，并设置，因为设置分包引用提取，需要先设置好
       */
      const config = await this.getEntryConfig(entryPath, require(entryPath))

      setAppJson(config, entryPath, entryPath === this.mainEntry)

      /**
       * 添加页面
       */
      let pageFiles = reslovePagesFiles(config, itemContext)

      /**
       * 入口文件只打包对应的 wxss 文件
       */
      let entryFiles = getFiles(itemContext, fileName, ['.wxss'])

      /**
       * 添加所有与这个 json 文件相关的 page 文件和 app 文件到编译中
       */
      this.addEntrys(itemContext, [pageFiles, entryFiles, entryPath])

      this.fileTree.setFile(entryFiles, true /* ignore */)
      this.fileTree.addEntry(entryPath);

      (config.usingComponents || config.publicComponents) && pageFiles.push(entryPath)

      componentFiles[itemContext] = (componentFiles[itemContext] || []).concat(
        pageFiles.filter((file) => this.fileTree.getFile(file).isJson)
      )
    }

    let tabBar = getAppJson().tabBar
    let extfile = this.options.extfile

    let entrys = [
      getFiles(this.mainContext, 'project.config', ['.json']), // project.config.json
      extfile === true ? getFiles(this.mainContext, 'ext', ['.json']) : [], // ext.json 只有 extfile 为 true 的时候才加载主包的 ext.json
      getFiles(this.mainContext, this.mainName, ['.js']) // 打包主入口对应的 js 文件
    ]

    // tabBar icons
    entrys.concat((tabBar && tabBar.list && getTabBarIcons(this.mainContext, tabBar.list)) || [])

    this.fileTree.setFile(
      flattenDeep(entrys)
    )

    this.addEntrys(this.mainContext, entrys)

    return Promise.all(
      Object.keys(componentFiles)
        .map(context => {
          let componentSet = new Set()

          return resolveComponentsFiles(
            this.resolver,
            componentFiles[context],
            componentSet
          )
            .then(() => this.addEntrys(context, Array.from(componentSet)))
        })
    )
  }

  /**
   * 获取路径所在的 package root
   * @param {String} path
   */
  getPathRoot (path) {
    let { subPackages } = getAppJson()

    for (const { root } of subPackages) {
      let match = path.match(root)

      if (match !== null && match.index === 0) {
        return root
      }
    }

    return ''
  }

  /**
   *
   * @param {*} root
   * @param {*} files
   */
  otherPackageFiles (root, files) {
    return files.filter(file => file.indexOf(root) === -1)
  }
}
