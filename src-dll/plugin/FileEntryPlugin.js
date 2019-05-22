const { Tapable, SyncHook } = require('tapable')
const { ConcatSource } = require('webpack-sources')
const { dirname, join, extname, basename } = require('path')
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin')
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin')

const { flattenDeep, isEmpty } = require('../utils')
const { getFiles } = require('../helpers/get-files')
const { mergeEntrys } = require('../helpers/merge-entry')
const { getAcceptPackages } = require('../helpers/parse-entry')
const { createResolver } = require('../helpers/create-resolver')
const { resolveComponentsPath } = require('../helpers/component')
const { ENTRY_ACCEPT_FILE_EXTS } = require('../config/constant')

const mainChunkNameTemplate = '__assets_chunk_name__'
let mainChunkNameIndex = 0

module.exports = class FileEntryPlugin extends Tapable {
  constructor (miniLoader, options) {
    super()
    this.miniLoader = miniLoader
    this._row = {}
    this.packages = {}
    this._usedValue = {}
    this._entrysConfig = options.entry || {}
    this._mode = options.mode
    this.options = options
    this.mainEntry = null
    this.chunkNames = ['main']

    this.hooks = {
      addPage: new SyncHook(['page', 'root']),
      addFiles: new SyncHook(['files'])
    }
  }

  apply (compiler) {
    this.compiler = compiler
    this.startTime = Date.now()
    this.context = this.compiler.context
    this.entrys = this.miniLoader.miniEntrys
    this.resolver = createResolver(compiler)

    compiler.hooks.emit.tapAsync('MiniPlugin', this.setEmitHook.bind(this))
    compiler.hooks.compilation.tap('MiniProgramPlugin', this.setCompilation.bind(this))

    this.start()
    this.loadProjectFiles()
  }

  setCompilation (compilation) {
    this.compilation = compilation
    compilation.hooks.optimizeTree.tapAsync('MiniProgramPlugin', (chunks, modules, cb) => this.optimizeTree(chunks, modules, cb))
    // 检查是否需要重新编译
    compilation.hooks.needAdditionalPass.tap('MiniProgramPlugin', () => this.needAdditionalPass)
  }
  /**
   * 处理自定义组件文件依赖
   * @param {*} chunks
   * @param {*} modules
   * @param {*} callback
   */
  optimizeTree (chunks, modules, callback) {
    let jsonLoadPromises = []
    const { lastTimestamps = new Map() } = this
    const timestamps = this.compilation.fileTimestamps

    /**
     * 获取所有 json 文件中对自定义组件的依赖
     */
    modules.forEach(module => {
      const jsonPath = module.resource

      if (jsonPath && /\.json/.test(jsonPath)) {
        if ((lastTimestamps.get(jsonPath) || this.startTime) < (timestamps.get(jsonPath) || Infinity)) {
          jsonLoadPromises.push(
            resolveComponentsPath(this.resolver, jsonPath)
          )
        }
      }
    })

    if (!jsonLoadPromises.length) return callback()

    Promise.all(jsonLoadPromises)
      .then((components) => {
        this.lastTimestamps = timestamps

        let files = []

        components.forEach(componentMap => {
          for (const [key, item] of componentMap) {
            // TODO 开口子接受替换自定义组件的路径

            // 自定义组件依赖文件收集
            const component = item.absPath
            const context = dirname(component)
            const path = basename(component, '.json')
            const componentfiles = item.type === 'normal' ? getFiles(context, path) : []

            // 只添加未被添加的文件
            files = files.concat(
              componentfiles.filter(
                file => !this.miniLoader.fileTree.has(file)
              )
            )

            // 添加文件关系
            this.miniLoader.fileTree.addComponent(item.request, key, item.origin, componentfiles, item.type)
          }
        })

        this.needAdditionalPass = files.length > 0
        this.hooks.addFiles.call(files)

        this.addEntrys(files)

        callback()
      })
  }

  setEmitHook (compilation, callback) {
    let assets = compilation.assets

    assets['app.js'] = this.getAppJsCode(assets)
    assets['app.wxss'] = this.getAppWxss(assets)
    assets['app.json'] = this.getAppJson(assets)

    if (this.options.extfile) {
      assets['ext.json'] = this.getExtJson(assets)
    }

    this.removeIgnoreAssets(assets)

    callback()
  }

  getEntryName (entry) {
    let dist = this.miniLoader.outputUtil.get(entry)

    return basename(dist, '.json')
  }

  getAppJsCode (assets) {
    const mainEntryName = this.getEntryName(this.mainEntry)
    return assets[`${mainEntryName}.js`]
  }

  getAppWxss (assets) {
    let source = new ConcatSource()
    this.entrys.forEach(entry => {
      let entryName = this.getEntryName(entry)
      source.add(`/* ${entryName}.wxss */\n`)
      source.add(
        assets[`${entryName}.wxss`]
      )
    })

    return source
  }

  getAppJson () {
    let appCode = mergeEntrys(this._row)

    appCode.subPackages = []

    for (const root in this.packages) {
      if (this.packages.hasOwnProperty(root)) {
        const element = this.packages[root]

        if (!element.root) appCode.pages = element.pages || []
        else appCode.subPackages.push(element)
      }
    }

    return new ConcatSource(JSON.stringify(appCode))
  }

  getExtJson (assets) {
    if (typeof this.options.extfile === 'string') {
      const dist = this.miniLoader.outputUtil.get(this.options.extfile)
      return assets[dist]
    }

    return assets['ext.json']
  }

  get ignoreFiles () {
    let files = this.chunkNames.map(fileName => `${fileName}.js`)

    this.entrys.forEach(entry => {
      let entryName = this.getEntryName(entry)

      if (entryName !== 'app') {
        files.push(
          ...ENTRY_ACCEPT_FILE_EXTS.map(ext => `${entryName}${ext}`)
        )
      }
    })

    return files
  }

  /**
   * 删除不需要输出的文件
   * @param {*} assets
   */
  removeIgnoreAssets (assets) {
    this.ignoreFiles.forEach(file => {
      delete assets[file]
    })
  }

  start (params, callback) {
    this.entrys.forEach(entry => {
      const context = dirname(entry)
      const pkgs = this.getEntryPackages(entry)
      this.mergePackges(context, pkgs)
    })

    const files = []

    Object.keys(this.packages).forEach((root) => {
      const { pages, isIndependent } = this.packages[root]
      pages.forEach(page => {
        // TODO 可以更改页面的路径
        const pageFiles = getFiles('', page)

        this.miniLoader.fileTree.addPage(page, pageFiles, !!root, isIndependent)

        pageFiles.forEach(file => files.push(file))
      })
    })

    this.addEntrys(files)
  }

  loadProjectFiles () {
    let files = []
    let extfile = this.options.extfile

    const context = dirname(this.mainEntry)
    if (extfile) {
      files.push(
        extfile === true
          ? getFiles(context, 'ext', ['.json'])
          : extfile
      )
    }

    files.push(
      getFiles(context, 'project.config', ['.json'])
    )

    // 对于不同平台需要单独处理
    let tabBar = this._row[this.mainEntry].tabBar

    !tabBar && Object.keys(this._row).forEach(entry => {
      const code = this._row[entry]
      if (entry !== this.mainEntry) {
        tabBar = code.tabBar
      }
    })

    tabBar && tabBar.list && tabBar.list.forEach(
      ({ selectedIconPath, iconPath }) => {
        selectedIconPath && files.push(
          join(context, selectedIconPath)
        )
        iconPath && files.push(join(context, iconPath))
      }
    )

    this.addEntrys(files)
    this.miniLoader.fileTree.setFile(
      flattenDeep(files)
    )
  }

  getEntryPackages (entry) {
    const dir = dirname(entry)
    const fileName = basename(entry, '.json')
    const exts = ['.wxss', '.scss']

    if (!this.mainEntry) {
      this.mainEntry = entry
      exts.push('.js')
    }
    const files = getFiles(dir, fileName, exts)

    this.addEntrys(files)
    // TODO 下次更新应该要清理上次的文件
    this.miniLoader.fileTree.addEntry(entry)
    this.miniLoader.fileTree.setFile(files)

    this._row[entry] = require(entry)

    return getAcceptPackages(this._entrysConfig[entry], this._row[entry])
  }

  mergePackges (context, newPackages) {
    const pkgs = this.packages
    newPackages.forEach(({ root, pages, name, isIndependent }) => {
      const pkg = pkgs[root] = pkgs[root] || {}

      pages = pages.map(page => join(context, root, page))
      console.log(pkg, pages)
      if (!isEmpty(pkg)) {
        console.assert(Boolean(pkg.isIndependent) === Boolean(isIndependent), `独立分包不支持于非独立分包合并: ${root}`)

        pkgs[root].pages = [
          ...new Set(
            ...pkgs[root].pages,
            ...pages
          )
        ]
        return
      }

      pkgs[root] = {
        pages,
        name,
        root,
        isIndependent
      }
    })
  }

  addEntrys (files) {
    let assetFiles = []
    let scriptFiles = []

    files = flattenDeep(files)

    files.forEach(file => /\.js$/.test(file) ? scriptFiles.push(file) : assetFiles.push(file))

    this.addAssetsEntry(assetFiles)
    this.addScriptEntry(scriptFiles)
  }

  addAssetsEntry (entrys) {
    let chunkName = mainChunkNameTemplate + mainChunkNameIndex
    this.chunkNames.push(chunkName)
    new MultiEntryPlugin(this.context, entrys, chunkName).apply(this.compiler)

    // 自动生成
    mainChunkNameIndex++
  }

  addScriptEntry (entrys) {
    for (const entry of entrys) {
      let fileName = this.miniLoader.outputUtil.get(entry).replace(extname(entry), '')
      new SingleEntryPlugin(this.context, entry, fileName).apply(this.compiler)
    }
  }
}
