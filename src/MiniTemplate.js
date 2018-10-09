const { dirname, relative } = require('path')

const {
  ConcatSource,
  RawSource,
  PrefixSource,
  OriginalSource
} = require('webpack-sources')

const Template = require('webpack/lib/Template')

module.exports = class MiniTemplate {
  constructor (plugin) {
    this.$plugin = plugin
  }
  apply (compiler) {
    this.compiler = compiler

    compiler.hooks.compilation.tap('MiniTemplate', (compilation) => {
      this.compilation = compilation

      compilation.mainTemplate.hooks.localVars.tap('MiniTemplate', this.setLocalVars.bind(this))
      compilation.mainTemplate.hooks.require.tap('MiniTemplate', this.setRequire.bind(this))
      compilation.mainTemplate.hooks.render.tap('MiniTemplate', this.setRender.bind(this))
    })
  }

  setRender (bootstrapSource, chunk, hash, moduleTemplate, dependencyTemplates) {
    const mainTemplate = this.compilation.mainTemplate
    const buf = []

    const source = new ConcatSource()
    const modules = this.getDepModules(chunk)
    const globalRequire = this.$plugin.options.target === 'ali' ? 'require' : 'require'
    try {
      buf.push(
        mainTemplate.hooks.bootstrap.call(
          '',
          chunk,
          hash,
          moduleTemplate,
          dependencyTemplates
        )
      )
      buf.push(mainTemplate.hooks.localVars.call('', chunk, hash))
      buf.push('')
      buf.push('// The require function')
      buf.push(`function ${mainTemplate.requireFn}(moduleId) {`)
      buf.push(Template.indent(mainTemplate.hooks.require.call('', chunk, hash)))
      buf.push('}')
      buf.push('')
      buf.push(
        Template.asString(mainTemplate.hooks.requireExtensions.call('', chunk, hash))
      )
      buf.push('')
      buf.push(Template.asString(mainTemplate.hooks.beforeStartup.call('', chunk, hash)))
      buf.push(Template.asString(mainTemplate.hooks.startup.call('', chunk, hash)))

      source.add('/******/ (function(modules) { // webpackBootstrap\n')
      source.add(
        new PrefixSource(
          '/******/',
          new OriginalSource(
            Template.prefix(buf, ' \t') + '\n',
            'webpack/bootstrap'
          )
        )
      )
      source.add('/******/ })\n')
      source.add(
        '/************************************************************************/\n'
      )
      source.add('/******/ (')
      source.add('Object.assign(')

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
    } catch (error) {
      console.log(error)
    }

    source.add(')')
    source.add(')')

    return source
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
