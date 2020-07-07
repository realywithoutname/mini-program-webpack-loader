const target = process.env.TARGET || 'wx'
const { existsSync, readFileSync } = require('fs')
const { Tapable, SyncHook, SyncWaterfallHook } = require('tapable')
const { ConcatSource, RawSource } = require('webpack-sources')
const { dirname, join, extname, basename } = require('path')
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin')
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin')

const { flattenDeep, isEmpty, relative } = require('../utils')
const { getFiles, getFile, getScriptDepFile } = require('../helpers/get-files')
const { mergeEntrys } = require('../helpers/merge-entry')
const { getAcceptPackages } = require('../helpers/parse-entry')
const { createResolver } = require('../helpers/create-resolver')
const { resolveComponentsFiles } = require('../helpers/resolve-component-path')
const { ENTRY_ACCEPT_FILE_EXTS } = require('../config/constant')
const { getEmptyFileSource } = require(`../platform/${target}/get-empty-file-source`)

const mainChunkNameTemplate = '__assets_chunk_name__'
let mainChunkNameIndex = 0

const IS_WIN32 = process.platform === 'win32'

function replacePathSep (ppath) {
  return IS_WIN32 ? ppath.replace(/\\/g, '/') : ppath
}

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
    this.chunkNames = ['main', 'miniapp-entry']

    this.hooks = {
      addPage: new SyncHook(['page', 'root']),
      addFiles: new SyncHook(['files']),
      getAppJsonCode: new SyncWaterfallHook(['code'])
    }
  }

  apply (compiler) {
    this.compiler = compiler
    this.startTime = Date.now()
    this.context = this.compiler.context
    this.entrys = this.miniLoader.miniEntrys
    this.resolver = createResolver(compiler)

    compiler.hooks.beforeCompile.tapAsync('FileEntryPlugin', this.beforeCompile.bind(this))
    compiler.hooks.emit.tapAsync('FileEntryPlugin', this.setEmitHook.bind(this))
    compiler.hooks.compilation.tap('FileEntryPlugin', this.setCompilation.bind(this))

    this.isFirstCompile = true

    // 根据已有的入口文件准备好最基础的 app.json 内容，并添加这些文件到 webpack 打包程序
    this.start()
    // 添加一些项目相关的额外文件到 webpack 打包程序
    this.loadProjectFiles()
  }

  setCompilation (compilation) {
    this.compilation = compilation
    compilation.hooks.optimizeTree.tapAsync('FileEntryPlugin', (chunks, modules, cb) => this.optimizeTree(chunks, modules, cb))
    // 检查是否需要重新编译
    compilation.hooks.needAdditionalPass.tap('FileEntryPlugin', () => this.needAdditionalPass ? true : undefined)
  }

  /**
   * 添加项目依赖的自定义组件到编译
   * @param {*} prarams
   * @param {*} callback
   */
  beforeCompile (prarams, callback) {
    // 不是第一次处理的时候不需要进入这个逻辑
    if (!this.isFirstCompile) return callback()

    const jsons = [...this.entrys]
    Object.keys(this.packages).forEach((root) => {
      const { pages } = this.packages[root]

      pages.forEach(page => {
        const pageJson = `${page}.json`

        if (existsSync(pageJson)) {
          jsons.push(pageJson)
        }
      })
    })

    /**
     * 添加依赖的自定义组件
     */
    this.loadComponentsFiles(jsons)
      .then(() => callback())
  }
  /**
   * 处理自定义组件文件依赖
   * @param {*} chunks
   * @param {*} modules
   * @param {*} callback
   */
  optimizeTree (chunks, modules, callback) {
    if (this.isFirstCompile) {
      this.isFirstCompile = false
      return callback()
    }

    const { lastTimestamps = new Map() } = this
    const timestamps = this.compilation.fileTimestamps

    const jsons = []
    let files = []
    /**
     * 获取所有 json 文件中对自定义组件的依赖
     */
    modules.forEach(module => {
      const jsonPath = module.resource && getFile(module.resource)

      if (jsonPath && /\.json/.test(jsonPath)) {
        if ((lastTimestamps.get(jsonPath) || this.startTime) < (timestamps.get(jsonPath) || Infinity)) {
          // 如果是入口文件改变，因为涉及到最后计算输出 json 内容需要更新
          // 新页面需要添加到编译
          if (this._row[jsonPath]) {
            const newPageFiles = this.start()

            files = files.concat(newPageFiles)
          }

          jsons.push(getFile(jsonPath))
        }
      }
    })

    if (!jsons.length) return callback()

    this.loadComponentsFiles(jsons)
      .then((comFiles) => {
        files = files.concat(comFiles)
        this.needAdditionalPass = files.length > 0
        this.hooks.addFiles.call(files)

        callback()
      })
  }

  setEmitHook (compilation, callback) {
    let assets = compilation.assets

    assets['app.js'] = this.getAppJsCode(assets)
    if (!assets['app.js']) {
      delete assets['app.js']
      assets['app.js'] = new ConcatSource('App({});')
      this.compilation.warnings.push('没有对应的 app.js 文件')
    }

    assets['app.wxss'] = this.getAppWxss(assets)
    if (!assets['app.wxss']) {
      delete assets['app.wxss']
      this.compilation.warnings.push('没有对应的 app.wxss 文件')
    }

    assets['app.json'] = this.getAppJsonCode()

    if (this.options.extfile) {
      assets['ext.json'] = this.getExtJson(assets)
    }

    const { emptyComponent } = this.options
    if (emptyComponent) {
      Object.keys(assets).forEach(file => {
        if (emptyComponent.test(file)) {
          const fileMeta = this.miniLoader.fileTree.getFileByDist(file)

          assets[file] = getEmptyFileSource(fileMeta)
        }
      })
    }

    [...this.miniLoader.fileTree.relations.values()].forEach(fileMeta => {
      assets[fileMeta.dist] = new RawSource(`
module.exports = ${
  JSON.stringify([
    ...fileMeta.data.values()
  ], null, 2)
}
      `)
    })

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
      if (!assets[`${entryName}.wxss`]) return

      source.add(`/* ${entryName}.wxss */\n`)
      source.add(
        assets[`${entryName}.wxss`]
      )
    })

    return source
  }

  getAppJson () {
    let appCode = mergeEntrys(this._row)

    // 需要考虑到 this.packages 包括了主包（主包单独作为一个特殊分包进入编译流程），所以 if 需要 +1
    // 如果有过滤条件的，那么直接删除 preloadRule
    if (appCode.subPackages.length > Object.keys(this.packages).length + 1) {
      delete appCode.preloadRule
    }

    delete appCode.pages
    delete appCode.subPackages
    delete appCode.usingComponents
    appCode.subPackages = []

    for (const root in this.packages) {
      if (this.packages.hasOwnProperty(root)) {
        const element = this.packages[root]

        if (!element.root) {
          appCode.pages = (element.pages || []).map((page) => replacePathSep(this.miniLoader.outputUtil.get(page)))
        } else {
          const { pages: subPages, root } = element

          const distPages = subPages.map((page) => {
            const dist = replacePathSep(this.miniLoader.outputUtil.get(page))

            return dist.replace(`${root}/`, '')
          })

          appCode.subPackages.push({
            ...element,
            pages: distPages
          })
        }
      }
    }

    return appCode
  }

  getAppJsonCode () {
    const code = this.hooks.getAppJsonCode.call(this.getAppJson())

    return new ConcatSource(JSON.stringify(code))
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
      this._row[entry] && this.clearEntryPackages(entry)
      const pkgs = this.getEntryPackages(entry)
      this.mergePackges(entry, pkgs)
    })

    const files = []
    const noJSONPageFiles = [] // 页面没有json文件的，直接添加到编译，有 json 文件的在 addComponent 时添加到编译

    Object.keys(this.packages).forEach((root) => {
      const { pages, independent, entry } = this.packages[root]
      pages.forEach(page => {
        // TODO 可以更改页面的路径
        const pageFiles = getFiles('', page)

        if (!pageFiles.filter(i => /\.json/.test(i)).length) {
          noJSONPageFiles.push(...pageFiles)
        }

        pageFiles.forEach(file => !this.miniLoader.fileTree.has(file) && files.push(file))

        this.miniLoader.fileTree.addPage(page, pageFiles, !!root, independent, entry)
      })
    })

    this.addEntrys(noJSONPageFiles)

    return files
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

    if (!this.options.ignoreTabbar) {
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
    }

    this.miniLoader.fileTree.setFile(
      flattenDeep(files)
    )
    this.addEntrys(files)
  }

  getEntryPackages (entry) {
    const dir = dirname(entry)
    const fileName = basename(entry, '.json')
    const exts = ['.wxss', '.scss', '.less']

    if (!this.mainEntry) {
      this.mainEntry = entry
      exts.push('.js', '.ts')
    }
    const files = getFiles(dir, fileName, exts)

    this.miniLoader.fileTree.addEntry(entry, files)
    this.addEntrys(files)

    this._row[entry] = JSON.parse(
      readFileSync(entry, { encoding: 'utf8' })
    )

    return getAcceptPackages(this._entrysConfig[entry], this._row[entry])
  }

  mergePackges (entry, newPackages) {
    const context = dirname(entry)
    const pkgs = this.packages
    newPackages.forEach(({ root, pages, name, independent, plugins }) => {
      const pkg = pkgs[root] = pkgs[root] || { }

      pages = pages.map(page => join(context, root, page))
      if (!isEmpty(pkg)) {
        console.assert(Boolean(pkg.independent) === Boolean(independent), `独立分包不支持于非独立分包合并: ${root}`)

        pkgs[root].pages = [
          ...new Set([
            ...pkgs[root].pages,
            ...pages
          ])
        ]
        return
      }

      pkgs[root] = {
        pages,
        name,
        root,
        context,
        entry,
        independent,
        plugins
      }
    })
  }

  clearEntryPackages (entry) {
    const context = dirname(entry)
    const { pages = [], subPackages = [] } = this._row[entry] || {}
    const pkgs = this.packages

    ;[
      {
        root: '',
        pages
      },
      ...subPackages
    ].forEach(({ root, pages }) => {
      let cachePages = pkgs[root].pages

      pages.forEach(page => {
        let index = cachePages.indexOf(join(context, root, page))

        if (index !== -1) {
          cachePages.splice(index, 1)
        }
      })
    })
  }

  isTemplateMain (path) {
    const { mergeComponents = {} } = this.options
    const { componentBlackList = {} } = mergeComponents

    return Object.keys(componentBlackList).some(key => {
      const keyReg = new RegExp(key)

      return keyReg.test(path)
    })
  }

  getComponentBlackList (path) {
    const { mergeComponents = {} } = this.options
    const { componentBlackList = {} } = mergeComponents
    const keys = Object.keys(componentBlackList)

    for (let index = 0; index < keys.length; index++) {
      const key = keys[index]
      const keyReg = new RegExp(key)

      if (keyReg.test(path)) return componentBlackList[key]
    }

    return []
  }

  loadComponentsFiles (jsons) {
    const componentSet = new Set()
    const files = []
    /**
     * 第一次加载时，一次性把所以文件都添加到编译，减少编译时间
     */

    jsons.forEach((json) => {
      componentSet.add({
        tag: '',
        component: {
          request: 'app',
          origin: '',
          absPath: json,
          type: 'page'
        },
        children: new Set()
      })
    })

    return resolveComponentsFiles(jsons, componentSet, this.resolver, this.options.emptyComponent, this.options.mergeComponents.test.bind(this))
      .then(() => {
        const jsons = Array.from(componentSet)
        jsons.forEach((component) => {
          files.push(
            ...this.addConponent(component)
          )
        })

        this.addEntrys(files)

        return files
      })
  }

  addConponent ({ tag, component: item, parent = {}, children, useTemplate, beTemplate, mainComponentPath }) {
    // TODO 开口子接受替换自定义组件的路径

    // 自定义组件依赖文件收集
    const component = item.absPath
    const context = dirname(component)
    const path = basename(component, '.json')
    let componentfiles = []
    let entryFiles = []

    // 自身是模版，但是父组件不是模版，也没有使用模版
    beTemplate && console.assert(parent.beTemplate || parent.useTemplate, tag, '不能独立作为模版，父组件是', parent.tag)

    if (item.type === 'normal' || item.type === 'page' || (item.type === 'generics' && component)) {
      componentfiles = getFiles(context, path)
    }

    // 模版不需要把 js 和 json 添加到依赖
    if (beTemplate) {
      componentfiles = componentfiles.filter(file => ['.json', '.js'].indexOf(extname(file)) === -1) // 模版不加载json文件
    }

    let request = parent.beTemplate // 父组件是模版
      ? beTemplate // 父组件是模版
        ? mainComponentPath // 自身也是模版，则用自身的 mainComponentPath
        : parent.mainComponentPath // 自身是组件，用 parent.mainComponentPath
      : item.request // 普通自定义组件用 request

    // 添加文件关系，对于页面和被转为模版的组件不需要添加到自定义组件中
    ;(item.type !== 'page' && !beTemplate) && this.miniLoader.fileTree.addComponent(
      request,
      tag, component,
      componentfiles,
      item.type
    )

    entryFiles = componentfiles.filter(
      // 页面和模版只是添加了文件，但是没有添加到编译
      file => !this.miniLoader.fileTree.getFile(getFile(file)).inCompiler
    )

    const isMergeComponent = beTemplate || useTemplate

    // 合并的自定义组件建立依赖关系
    if (isMergeComponent) {
      const { componentCtrPath, constructorNames } = this.options.mergeComponents

      entryFiles = entryFiles.map((entry) => {
        const ext = extname(entry)
        const depFileList = []
        const depFiles = []

        function getNamespace (file) {
          const relativePath = relative(mainComponentPath, file)
          const namespace = dirname(relativePath)
            // @ts-ignore
            .replaceAll(/\./, '_')
            .replaceAll(/-/, '_')
            .replaceAll(/\//, '_') +
           basename(relativePath, '.json')

          return namespace
        }

        children.forEach(child => {
          if (!child.beTemplate) return

          const { absPath } = child.component

          const context = dirname(absPath)
          const path = basename(absPath, '.json')

          let depFile = ''
          if (ext === '.wxml') {
            depFile = getFiles(context, path, ['.wxml'])[0]
          }

          if (ext === '.wxss' || ext === '.scss') {
            depFile = getFiles(context, path, ['.wxss', '.scss'])[0]
          }

          if (ext === '.js') {
            depFile = getScriptDepFile(child, getNamespace, constructorNames)
          }

          if (depFile) {
            depFiles.push(depFile)

            depFileList.push({
              tag: child.tag,
              name: getNamespace(absPath),
              path: depFile
            })
          }
        })

        if (ext === '.json') {} // 先不管 json

        if (['.wxml', '.wxss', '.scss'].indexOf(ext) !== -1) {
          this.miniLoader.fileTree.addDeps(entry, depFiles.map(i => ({ sourcePath: i })))
        }

        const depDirname = dirname(mainComponentPath)
        const depbasename = basename(mainComponentPath, '.json')
        let depTreeFile = join(depDirname, `${depbasename}-dep-tree.js`)

        if (ext === '.js') {
          entry = `${require.resolve('../loaders/merge-js-loader')}!${entry}`
        }

        if (ext === '.scss') {
          entry = `${require.resolve('../loaders/merge-scss-loader')}!${entry}`
        }

        return `${entry}?deps=${
          encodeURIComponent(JSON.stringify(depFileList))
        }&isEntry=${useTemplate}&mergeScript=${componentCtrPath}&constructors=${
          encodeURIComponent(JSON.stringify(constructorNames))
        }&isPage=${
          item.type === 'page' ? true : ''
        }&depTree=${depTreeFile}&namespace=${getNamespace(component)}`
      })
    }

    return entryFiles
  }

  addEntrys (files) {
    let assetFiles = []
    let scriptFiles = []

    files = flattenDeep(files)

    files.forEach(file => {
      this.miniLoader.fileTree.addCompiler(getFile(file))
      return /\.[j|t]s$/.test(getFile(file)) ? scriptFiles.push(file) : assetFiles.push(file)
    })

    assetFiles.length && this.addAssetsEntry(assetFiles)
    scriptFiles.length && this.addScriptEntry(scriptFiles)
  }

  addAssetsEntry (entrys) {
    let chunkName = mainChunkNameTemplate + mainChunkNameIndex
    this.chunkNames.push(chunkName)
    new MultiEntryPlugin(this.context, entrys, chunkName).apply(this.compiler)
    // 自动生成
    mainChunkNameIndex++
  }

  addScriptEntry (entrys) {
    for (let entry of entrys) {
      const file = getFile(entry)
      let fileName = this.miniLoader.outputUtil.get(file).replace(extname(file), '')
      new SingleEntryPlugin(this.context, entry, fileName).apply(this.compiler)
    }
  }
}
