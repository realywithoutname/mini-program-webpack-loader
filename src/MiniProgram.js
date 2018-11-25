const { existsSync, readFileSync } = require('fs')
const {
  dirname,
  join,
  relative,
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
  getFiles
} = require('./utils')
const { reslovePagesFiles } = require('./helpers/page')
const { update: setAppJson, get: getAppJson } = require('./helpers/app')
const { resolveFilesForPlugin: resolveComponentsFiles } = require('./helpers/component')
const defaultOptions = {
  extfile: true,
  commonSubPackages: true,
  analyze: false,
  resources: [],
  compilationFinish: null
}

const mainChunkNameTemplate = '__assets_chunk_name__'
let mainChunkNameIndex = 0

module.exports = class MiniProgam {
  constructor (options) {
    this.chunkNames = ['main']

    this.options = Object.assign(
      defaultOptions,
      options
    )

    this.fileTree = new FileTree()

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
      let fileName = relative(context, entry).replace(extname(entry), '')
      new SingleEntryPlugin(context, entry, fileName).apply(this.compiler)
    }
  }

  async loadEntrys (entry) {
    console.log('-=====')
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
      const config = require(entryPath)
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

      this.fileTree.setFile(entryFiles)
      this.fileTree.addEntry(entryPath)

      pageFiles.push(entryPath)

      componentFiles[itemContext] = pageFiles.filter((file) => this.fileTree.getFile(file).isJson)
    }

    let tabBar = getAppJson().tabBar
    let extfile = this.options.extfile

    let entrys = [
      getFiles(this.mainContext, 'project.config', ['.json']), // project.config.json
      extfile === true ? getFiles(this.mainContext, 'ext', ['.json']) : [], // ext.json 只有 extfile 为 true 的时候才加载主包的 ext.json
      getFiles(this.mainContext, this.mainName, ['.js']) // 打包主入口对应的 js 文件
    ]

    // tabBar icons
    entrys.concat((tabBar && tabBar.list && this.getTabBarIcons(this.mainContext, tabBar.list)) || [])

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
   * 获取 icon 路径
   * @param {*} context
   * @param {*} tabs
   */
  getTabBarIcons (context, tabs) {
    let files = []
    for (const tab of tabs) {
      let file = join(context, tab.iconPath)
      if (existsSync(file)) files.push(file)

      file = join(context, tab.selectedIconPath)

      if (existsSync(file)) files.push(file)
    }

    return files
  }

  moduleOnlyUsedBySubpackages (module) {
    if (!/\.js$/.test(module.resource) || module.isEntryModule()) return false
    if (!module._usedModules) throw new Error('非插件提供的 module，不能调用这个方法')

    let { subPackages } = getAppJson()
    let subRoots = subPackages.map(({ root }) => root) || []
    let subReg = new RegExp(subRoots.join('|'))
    let usedFiles = Array.from(module._usedModules)

    return !usedFiles.some(moduleName => !subReg.test(moduleName))
  }

  moduleUsedBySubpackage (module, root) {
    if (!/\.js$/.test(module.resource) || module.isEntryModule()) return false
    if (!module._usedModules) throw new Error('非插件提供的 module，不能调用这个方法')

    let reg = new RegExp(root)

    let usedFiles = Array.from(module._usedModules)

    return usedFiles.some(moduleName => reg.test(moduleName))
  }

  moduleOnlyUsedBySubPackage (module, root) {
    if (!/\.js$/.test(module.resource) || module.isEntryModule()) return false

    let usedFiles = module._usedModules

    if (!usedFiles) return false

    let reg = new RegExp(`^${root}`)

    return !Array.from(usedFiles).some(moduleName => !reg.test(moduleName))
  }

  /**
   * 判断所给的路径在不在自定义组件内
   * @param {String} path 任意路径
   */
  pathInSubpackage (path) {
    let { subPackages } = getAppJson()

    for (const { root } of subPackages) {
      let match = path.match(root)

      if (match !== null && match.index === 0) {
        return true
      }
    }

    return false
  }

  /**
   * 判断所给的路径集合是不是在同一个包内
   * @param {Array} paths 路径列表
   */
  pathsInSamePackage (paths) {
    // 取第一个路径，获取子包 root，然后和其他路径对比
    let firstPath = paths[0]
    let root = this.getPathRoot(firstPath)

    // 路径不在子包内
    if (!root) {
      return ''
    }

    let reg = new RegExp(`^${root}`)
    for (const path of paths) {
      if (!reg.test(path)) return ''
    }

    return root
  }

  /**
   * 判断列表内数据是不是在同一个目录下
   * @param {*} paths
   */
  pathsInSameFolder (paths) {
    let firstPath = paths[0]
    let folder = firstPath.split('/')[0]
    let reg = new RegExp(`^${folder}`)

    for (const path of paths) {
      if (!reg.test(path)) return ''
    }

    return folder
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
