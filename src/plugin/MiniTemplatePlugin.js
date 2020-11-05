const { join } = require('path')
const { ConcatSource, RawSource } = require('webpack-sources')
const requireCode = require('../lib/require')
const utils = require('../utils')
const { getFile } = require('../helpers/get-files')

module.exports = class MiniTemplate {
  constructor (miniLoader) {
    this.miniLoader = miniLoader
    this.outPath = this.miniLoader.outputPath
    this.requirePath = join(this.outPath, './webpack-require')
  }

  apply (compiler) {
    this.compiler = compiler
    this.targetIsUMD = compiler.options.output.libraryTarget === 'umd'

    compiler.hooks.compilation.tap('MiniTemplate', (compilation) => {
      this.compilation = compilation

      compilation.mainTemplate.hooks.render.tap('MiniTemplate', this.setRender.bind(this))
    })
  }

  getRequirePath (entry) {
    let entryPath = join(this.outPath, this.miniLoader.outputUtil.get(entry))
    return utils.relative(entryPath, this.requirePath)
  }

  setRender (bootstrapSource, chunk, hash, moduleTemplate, dependencyTemplates) {
    try {
      const source = new ConcatSource()

      // 抽取的公用代码，不使用这个render处理
      if (!chunk.entryModule || !chunk.entryModule.resource) {
        return bootstrapSource
      }

      const resource = getFile(chunk.entryModule.resource)

      const globalRequire = 'require'

      let webpackRequire = `${globalRequire}("${this.getRequirePath(resource)}")`
      // 支持独立分包，先这样处理，render hook 添加的不对
      if (resource && this.miniLoader.fileTree.getFile(resource).independent) {
        webpackRequire = requireCode.toString() + ';\nvar installedModules = {}'
      }

      /**
       * 计算出 webpack-require 相对改 chunk 的路径
       */
      this.targetIsUMD && source.add('(function() {\n')

      source.add(`var webpackRequire = ${webpackRequire};\n`)

      this.targetIsUMD && source.add('return ')

      source.add(`webpackRequire(\n`)

      source.add(`"${chunk.entryModule.id}",\n`)

      this.setModules(source)(chunk, hash, moduleTemplate, dependencyTemplates)

      source.add(')')

      this.targetIsUMD && source.add('\n})()')
      return source
    } catch (error) {
      console.log(error)
    }
  }

  setModules (source) {
    const globalRequire = 'require'
    const mainTemplate = this.compilation.mainTemplate

    return (chunk, hash, moduleTemplate, dependencyTemplates) => {
      const modules = this.getDepModules(chunk)
      const sourceBody = mainTemplate.hooks.modules.call(
        new RawSource(''),
        chunk,
        hash,
        moduleTemplate,
        dependencyTemplates
      )

      modules.size && source.add('Object.assign({}, ')

      for (const item of modules) {
        source.add(`${globalRequire}("./${item}").modules, `)
      }

      source.add(sourceBody)
      modules.size && source.add(')')

      return source
    }
  }

  getDepModules (chunk) {
    let groups = chunk.groupsIterable
    let modules = new Set()

    if (chunk.hasEntryModule()) {
      // 当前 chunk 最后被打包的位置
      let jsFilePath = `${chunk.name}.js`

      let file = this.miniLoader.outputUtil.get(jsFilePath)

      for (const chunkGroup of groups) {
        for (const { name } of chunkGroup.chunks) {
          if (name !== chunk.name) {
            // 依赖 chunk 最后被打包的位置
            let depFile = this.miniLoader.outputUtil.get(`${name}.js`)
            modules.add(utils.relative(file, depFile))
          }
        }
      }
    }

    return modules
  }
}
