const { dirname, relative, join } = require('path')

const {
  ConcatSource,
  RawSource
} = require('webpack-sources')

const Template = require('webpack/lib/Template')

module.exports = class MiniTemplate {
  constructor (plugin) {
    this.$plugin = plugin
    this.outPath = this.$plugin.outputPath
    this.requirePath = join(this.outPath, './webpack-require')
  }
  apply (compiler) {
    this.compiler = compiler

    compiler.hooks.compilation.tap('MiniTemplate', (compilation) => {
      this.compilation = compilation
      
      compilation.mainTemplate.hooks.render.tap('MiniTemplate', this.setRender.bind(this))
    })
  }

  getRequirePath(entry) {
    let entryPath = dirname(join(this.outPath, this.$plugin.getDistFilePath(entry)))
    return relative(entryPath, this.requirePath)
  }

  setRender (bootstrapSource, chunk, hash, moduleTemplate, dependencyTemplates) {
    try {
      const mainTemplate = this.compilation.mainTemplate
      const source = new ConcatSource()
      const modules = this.getDepModules(chunk)
  
      // 抽取的公用代码，不使用这个render处理
      if (!chunk.entryModule.resource) {
        return source
      }

      const globalRequire = 'require'
      source.add(`/******/ var webpackRequire = ${globalRequire}("./${this.getRequirePath(chunk.entryModule.resource)}");\n`)
      source.add(`/******/ webpackRequire(\n`)
      source.add(`"${chunk.entryModule.id}",\n`)
      modules.size && source.add('Object.assign(')

      for (const item of modules) {
        source.add(`${globalRequire}("./${item}").modules, `)
      }

      source.add(
        mainTemplate.hooks.modules.call(
          new RawSource(''),
          chunk,
          hash,
          moduleTemplate,
          dependencyTemplates
        )
      )
      modules.size && source.add(')')
      source.add(')')
      return source
    } catch (error) {
      console.log(error)
    }
  }

  getDepModules (chunk) {
    let groups = chunk.groupsIterable
    let modules = new Set()

    if (chunk.hasEntryModule()) {
      // 当前 chunk 最后被打包的位置
      let file = this.$plugin.getDistFilePath(`${chunk.name}.js`)
      let dir = dirname(file)

      for (const chunkGroup of groups) {
        for (const { name } of chunkGroup.chunks) {
          if (name !== chunk.name) {
            // 依赖 chunk 最后被打包的位置
            let depFile = this.$plugin.getDistFilePath(`${name}.js`)
            modules.add(relative(dir, depFile))
          }
        }
      }
    }

    return modules
  }

  setLocalVars (source, chunk, hash) {
    try {
      let globalBrage = this.$plugin.options.target === 'ali' ? 'my' : 'wx'

      return Template.asString([
        '// 使用缓存中加载过的模块作为默认加载过的模块，否则公共模块会被调用多次',
        `var installedModules = ${globalBrage}.__installedModules = ${globalBrage}.__installedModules || {}`
      ])
    } catch (e) {
      console.log(e)
    }
  }

  setRequire (source, chunk, hash) {
    try {
      let globalBrage = this.$plugin.options.target === 'ali' ? 'my' : 'wx'

      return Template.asString([
        '// Check if module is in cache',
        'if(installedModules[moduleId]) {',
        Template.indent('return installedModules[moduleId].exports;'),
        '}',
        '// Create a new module (and put it into the cache)',
        `var module = ${globalBrage}.__installedModules[moduleId] = installedModules[moduleId] = {`,
        Template.indent(this.compilation.mainTemplate.hooks.moduleObj.call('', chunk, hash, 'moduleId')),
        '};',
        '',
        Template.asString(
          [
            '// Execute the module function',
            `modules[moduleId].call(module.exports, module, module.exports, ${this.compilation.mainTemplate.renderRequireFunctionForModule(
              hash,
              chunk,
              'moduleId'
            )});`
          ]
        ),
        '',
        '// Flag the module as loaded',
        'module.l = true;',
        '',
        '// Return the exports of the module',
        'return module.exports;'
      ])
    } catch (error) {
      console.log(error)
    }
  }
}
