// const fs = require('fs')
const path = require('path')
const utils = require('./utils')
const { resolveFilesForLoader } = require('./helpers/component')
const WXLoaderHelper = require('./wx/loader')
const AliLoaderHelper = require('./ali/loader')
const FileTree = require('./FileTree')
const tree = new FileTree()

const isWxml = src => /.wxml$/.test(src)
const isWxss = src => /.wxss$/.test(src)
const isWxs = src => /.wxs$/.test(src)
const isJson = src => /.json$/.test(src)
const isScss = src => /.scss$/.test(src)
const isPcss = src => /.pcss$/.test(src)
const isLess = src => /.less$/.test(src)
const isInvaild = src => isWxml(src) || isWxss(src) || isWxs(src) || isJson(src) || isScss(src) || isPcss(src) || isLess(src)

/* eslint-disable */
String.prototype.replaceAll = function (str, replacement) {
  return this.replace(new RegExp(str, 'gm'), replacement)
}

class MiniLoader {
  constructor (loader, code) {
    this.loader = loader
    this.source = code
    this.resourcePath = loader.resourcePath
    this.callback = loader.async()
    this.context = loader.context

    this.resolveDistPath = this.$plugin && this.$plugin.getDistFilePath

    this.targetHelper = this.$plugin.options.target === 'ali'
      ? new AliLoaderHelper(this, this.$plugin)
      : new WXLoaderHelper(this)

    this.resolve = (context, request) => new Promise((resolve, reject) => {
      loader.resolve(context, request, (err, result) => err ? reject(err) : resolve(result))
    })

    this.parser()
  }

  get DepReg () {
    const wxmlDepsReg = /src=('|")([^"]*)('|")/g
    const wxssDepsReg = /@import ('|")([^"].+?)('|");/g
    const wxsDepsReg = /require\(('|")([^)]*.wxs)('|")\)/g
    let resourcePath = this.resourcePath
    return isWxml(resourcePath) ? wxmlDepsReg : isWxss(resourcePath) ? wxssDepsReg : isWxs(resourcePath) ? wxsDepsReg : false
  }

  parser () {
    const parserPromise = !isJson(this.resourcePath)
      ? this.customParser(this.DepReg)
      : this.jsonParser()

    parserPromise
      .then(code => {
        this.callback(null, code)
      })
      .catch(this.callback)
  }

  async customParser (reg) {
    return this.loadDeps(reg)
      .then(map => {
        let depsPromise = []
        let deps = []
        let code = this.source
        for (const value of map.values()) {
          code = code.replaceAll(value.origin, value.replace)

          /**
           * 动态添加依赖，使用 promise 是为了在所有依赖添加完成后
           * 再调用 callback，否则后添加的依赖不会被监听
           */
          depsPromise.push(
            this.addDepsModule(value.sourcePath)
          )

          deps.push(value.sourcePath)
        }
        code = isWxml(this.resourcePath) && this.targetHelper.transformWxml
          ? this.targetHelper.transformWxml(code)
          : code

        if (isWxml(this.resourcePath)) {
          this.$plugin.addWxmlDeps(this.resourcePath, deps)
        }
        
        this.$plugin.addListenFiles(deps)

        return Promise.all(depsPromise)
          .catch((err) => {
            throw err
          })
          .then(() => {
            return code
          })
      })
  }

  async jsonParser () {
    let json = JSON.parse(this.source)
    let { componentGenerics, usingComponents, pages = [], subPackages = [] } = json

    if (pages.length || subPackages.length) {
      this.$plugin.appJsonChange(json, this.resourcePath)
    }

    if (!usingComponents && !componentGenerics) return this.source

    let assets = await resolveFilesForLoader(
      this.resolve, 
      this.resourcePath, 
      json, 
      this.getRelativePath.bind(this), 
      this.$plugin.componentSet
    )

    /**
     * 通知插件，下次编译的时候要把这些文件加到编译中
     */
    await this.$plugin.addNewConponentFiles(this.resourcePath, assets)

    return JSON.stringify(json, null, 2)
  }

  addDepsModule (request) {
    return new Promise((resolve, reject) => {
      // this.loader.addDependency(request)
      this.loader.loadModule(request, (err, src) => {
        err ? reject(err) : resolve(src)
      })
    })
  }

  async loadDeps (reg) {
    let matched = null
    let map = new Map()
    let deps = []
    while ((matched = reg.exec(this.source)) !== null) {
      let dep = matched[2]

      /**
       * 检查文件引用的文件是否有效
       * wxs 只能引用 wxs
       * wxss 可以引用 wxss，scss, pcss
       * wxml 只能引用 wxml
       */
      if (!isInvaild(dep)) {
        continue
      }

      // 依赖文件的绝对路径
      let absPath = await this.getAbsolutePath(this.context, dep)
      let relPath = this.getRelativePath(absPath)
      
      deps.push(absPath)

      if (!map.has(dep)) {
        map.set(dep, {
          origin: dep, // 原来代码中的依赖路径
          replace: this.getDepReplacePath(relPath), // 替换路径
          sourcePath: absPath // 依赖文件，用于动态添加依赖
        })
      }
    }

    tree.addDeps(this.resourcePath, deps)

    return map
  }

  getDepReplacePath (path) {
    return isWxss(path)
      ? this.targetHelper.TWxss(path)
      : isWxml(path)
        ? this.targetHelper.TWxml(path)
        : isScss(path)
          ? this.targetHelper.TScss(path)
          : isPcss(path)
            ? this.targetHelper.TPcss(path)
            : isLess(path)
              ?  this.targetHelper.TPcss(path)
              : isWxs(path)
                ? this.targetHelper.TWxs(path)
                : path
  }
  /**
   * 根据当前文件打包后的路径以及依赖文件的路径打包路径计算依赖的相对路径
   * @param {*} dep
   */
  getRelativePath (dep) {
    let originPath = this.resolveDistPath(this.resourcePath)
    let depPath = this.resolveDistPath(dep)

    return './' + path.relative(path.dirname(originPath), depPath)
  }

  async getAbsolutePath (context, dep) {
    /**
     * 绝对路径则把前面的 / 去掉，需要在 resolve.alias 中做相应配置，主要是兼容有赞小程序历史写法
     * 相对路径则使用相对路径
     */
    dep = path.isAbsolute(dep) ? dep.substr(1) : dep

    let absPath = await this.resolve(context, dep)
    return absPath
  }
}

module.exports = function (content) {
  this.cacheable && this.cacheable()
  const resourcePath = this.resourcePath

  if (!isWxml(resourcePath) && !isWxss(resourcePath) && !isWxs(resourcePath) && !isJson(this.resourcePath)) return this.callback('Loader 不支持的文件类型', content)

  return new MiniLoader(this, content)
}

module.exports.$applyPluginInstance = function (plugin) {
  MiniLoader.prototype.$plugin = plugin
}
