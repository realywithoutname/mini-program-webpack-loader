// const fs = require('fs')
const path = require('path')
const { LOADER_ACCEPT_FILE_EXTS } = require('../config/constant')
const minisizeWxml = require('../helpers/html-mini-loader')
const isInvaildExt = ext => LOADER_ACCEPT_FILE_EXTS.indexOf(ext) === -1

class MiniLoader {
  constructor (loader, code) {
    this.loader = loader
    this.source = code
    this.callback = loader.async()
    this.context = loader.context

    if (!this.miniLoader) throw new Error('该 loader 必须和插件配合使用')

    this.fileTree = this.miniLoader.fileTree
    // 获取文件信息
    this.fileMeta = this.fileTree.getFile(loader.resourcePath)

    this.resolve = (context, request) => new Promise((resolve, reject) => {
      loader.resolve(context, request, (err, result) => err ? reject(err) : resolve(result))
    })

    // wxml 压缩
    if (this.fileMeta.isWxml) {
      this.source = minisizeWxml(code, this.fileMeta)
    }

    /**
     * 返回最终这个文件的内容
     */
    this.normalParser().then(
      code => this.callback(null, code),
      this.callback
    )
  }

  async normalParser (reg) {
    return this.loadNormalFileDeps(reg).then(map => {
      let deps = []
      let code = this.source
      let promises = []

      for (const value of map.values()) {
        /**
         * 动态添加依赖，使用 promise 是为了在所有依赖添加完成后
         * 再调用 callback，否则后添加的依赖不会被监听
         */
        promises.push(
          this.addDepsModule(value.sourcePath)
        )

        deps.push(value)
      }

      /**
       * 依赖的文件添加到文件树中
       */
      this.fileTree.addDeps(this.fileMeta.source, deps)

      return Promise.all(promises).then(() => code)
    })
  }

  addDepsModule (request) {
    return new Promise((resolve, reject) => {
      this.loader.loadModule(request, (err, src) => {
        if (!err) return resolve(src)
        // 如果添加依赖失败，把他从文件树中去除
        reject(err)
        this.fileTree.removeFile(request)
      })
    })
  }

  async loadNormalFileDeps () {
    let map = new Map()
    let { isWxml, isWxss, isWxs } = this.fileMeta

    if (!isWxml && !isWxs && !isWxss) {
      console.log('webpack 配置不对哦，该插件只支持 wxml, wxss, wxs, json 的'.red)
      return map
    }

    /**
     * 根据文件类型获取依赖匹配的正则表达式
     */
    const wxmlDepsReg = /src=('|")([^"]*)('|")/g
    const wxssDepsReg = /@import ('|")([^"].+?)('|");/g
    const wxsDepsReg = /require\(('|")([^)]*.wxs)('|")\)/g
    const reg = isWxml ? wxmlDepsReg : isWxss ? wxssDepsReg : wxsDepsReg

    let matched = null

    /**
     * 依赖查找
     */
    while ((matched = reg.exec(this.source)) !== null) {
      let dep = matched[2]
      let ext = path.extname(dep)

      /**
       * 检查文件引用的文件是否有效
       */
      if (isInvaildExt(ext)) {
        // 可以在这里对很多东西限制，比如 base 64
        // console.log('引用了一个不认识的文件类型', ext)
        continue
      }

      // 依赖文件的绝对路径
      let depFile = await this.getAbsolutePath(this.context, dep)

      if (!map.has(dep)) {
        map.set(dep, {
          origin: dep, // 原来代码中的依赖路径
          sourcePath: depFile // 依赖文件，用于动态添加依赖
        })
      }
    }

    return map
  }

  async getAbsolutePath (context, dep) {
    /**
     * 绝对路径则把前面的 / 去掉，需要在 resolve.alias 中做相应配置，主要是兼容有赞小程序历史写法，相对路径则使用相对路径
     *
     * 如果配置的 alias 和 / 后面的第一个目录不是指向同一个目录，这里获取到的路径就是错了
     */
    dep = path.isAbsolute(dep) ? dep.substr(1) : dep

    let absPath = await this.resolve(context, dep)
    return absPath
  }
}

module.exports = MiniLoader

module.exports.$applyPluginInstance = function (plugin) {
  MiniLoader.prototype.miniLoader = plugin
}
