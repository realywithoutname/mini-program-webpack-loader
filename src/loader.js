const fs = require('fs')
const path = require('path');
const utils = require('./utils')

const isWxml = src => /.wxml$/.test(src)
const isWxss = src => /.wxss$/.test(src)
const isWxs = src => /.wxs$/.test(src)
const isJson = src => /.json$/.test(src)
const isScss = src => /.scss$/.test(src)
const isPcss = src => /.pcss$/.test(src)
const isLess = src => /.less$/.test(src)
const isInvaild = src => isWxml(src) || isWxss(src) || isWxs(src) || isJson(src) || isScss(src) || isPcss(src) || isLess(src)

String.prototype.replaceAll = function (str, replacement) {
  return this.replace(new RegExp(str, 'gm'), replacement)
}

class MiniLoader {
  constructor(loader, code) {
    this.loader = loader
    this.source = code
    this.resourcePath = loader.resourcePath
    this.callback = loader.async()
    this.context = loader.context
    this.resolveDistPath = this.$plugin && this.$plugin.getDistFilePath

    this.resolve = (context, request) => new Promise((resolve, reject) => {
      loader.resolve(context, request, (err, result) => err ? reject(err) : resolve(result))
    });

    this.parser()
  }

  parser() {
    const wxmlDepsReg = /src=('|")([^"]*)('|")/g
    const wxssDepsReg = /@import ('|")([^"].+?)('|");/g
    const wxsDepsReg = /require\(('|")([^)]*.wxs)('|")\)/g
    let resourcePath = this.loader.resourcePath
    let code = this.source
    let reg = isWxml(resourcePath) ? wxmlDepsReg : isWxss(resourcePath) ? wxssDepsReg : isWxs(resourcePath) ? wxsDepsReg : false

    const parserPromise = reg ? this.customParser(reg) : this.jsonParser()

    parserPromise
      .then(code => {
        this.callback(null, code)
      })
      .catch(this.callback)
  }

  async customParser(reg) {
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

  async jsonParser() {
    let json = JSON.parse(this.source)
    let { componentGenerics, usingComponents, pages = [], subPackages = [] } = json
    
    if (pages.length || subPackages.length) {
      this.$plugin.appJsonChange(json, this.resourcePath)
    }

    if (!usingComponents && !componentGenerics) return this.source

    let assets = []
    let components = []

    async function setConponentFiles (component) {
      component = component + '.json'
  
      // 获取自定义组件的绝对路径
      let absPath = await this.resolve(this.context, component)
  
      // 获取依赖的实际文件列表
      let dir = path.dirname(absPath)
      let name = path.basename(absPath, '.json')
      
      // 新增到编译的组件以及组件对应的文件
      assets = assets.concat(utils.getFiles(dir, name))
      components.push(path.join(dir, name))
      // 获取相对路径，返回到 json 文件中
      let relPath = this.getRelativePath(absPath)
      return relPath.substr(0, relPath.length - 5)
    }

    /**
     * 自定义组件
     */
    for (const key in usingComponents || {}) {
      let component = usingComponents[key]
      if (/^plugin:\/\//.test(component)) {
        continue
      }
      usingComponents[key] = await setConponentFiles.call(this, component)
    }

    /**
     * 抽象组件
     */
    for (const key in componentGenerics) {
      if (typeof componentGenerics[key] === 'object') {
        for (const _key in componentGenerics[key]) {
          let element = componentGenerics[key][_key];
          componentGenerics[key][_key] = await setConponentFiles.call(this, element)
        }
      }
    }

    /**
     * 通知插件，下次编译的时候要把这些文件加到编译中
     */
    this.$plugin.addNewConponentFiles(assets, components, this.resourcePath)
    
    return JSON.stringify(json, null, 2)
  }

  addDepsModule(request) {
    return new Promise((resolve, reject) => {
      // this.loader.addDependency(request)
      this.loader.loadModule(request, (err, src) => {
        err ? reject(err) : resolve(src)
      });
    })
  }

  async loadDeps(reg) {
    let matched = null
    let map = new Map()

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

      if (!map.has(dep)) {
        map.set(dep, {
          origin: dep, // 原来代码中的依赖路径
          replace: (isScss(relPath) || isPcss(relPath)) || isLess(relPath)
            ? relPath.replace('.scss', '.wxss').replace('.pcss', '.wxss').replace('.less', '.wxss') /* wxss 文件支持 scss 文件的引用，打包后需要换后缀 */ 
            : relPath, // 替换路径
          sourcePath: absPath // 依赖文件，用于动态添加依赖
        })
      }
    }

    return map
  }

  /**
   * 根据当前文件打包后的路径以及依赖文件的路径打包路径计算依赖的相对路径
   * @param {*} dep 
   */
  getRelativePath(dep) {
    let originPath = this.resolveDistPath(this.resourcePath)
    let depPath = this.resolveDistPath(dep)

    return './' + path.relative(path.dirname(originPath), depPath)
  }

  async getAbsolutePath(context, dep) {
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
  this.cacheable && this.cacheable();
  const resourcePath = this.resourcePath


  if (!isWxml(resourcePath) && !isWxss(resourcePath) && !isWxs(resourcePath) && !isJson(this.resourcePath)) return this.callback('Loader 不支持的文件类型', content)

  new MiniLoader(this, content)
}

module.exports.$applyPluginInstance = function (plugin) {
  MiniLoader.prototype.$plugin = plugin
}