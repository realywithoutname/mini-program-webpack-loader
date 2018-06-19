const {
  dirname,
  relative
} = require('path');

const {
  ConcatSource,
  RawSource
} = require("webpack-sources");
const {
  Tapable,
  SyncHook,
  SyncBailHook,
  SyncWaterfallHook,
  AsyncSeriesHook
} = require("tapable");

const Template = require("webpack/lib/Template");

module.exports = class MiniTemplate {
  constructor(plugin) {
    this.$plugin = plugin;
  }
  apply(compiler) {
    this.compiler = compiler;

    compiler.hooks.compilation.tap('MiniTemplate', compilation => {
      this.compilation = compilation;

      compilation.mainTemplate.hooks.localVars.tap('MiniTemplate', this.setLocalVars.bind(this));
      compilation.mainTemplate.hooks.require.tap('MiniTemplate', this.setRequire.bind(this));
    });
  }

  setLocalVars(source, chunk, hash) {
    try {
      let groups = chunk.groupsIterable;
      let modules = new Set();

      if (chunk.hasEntryModule()) {
        // 当前 chunk 最后被打包的位置
        let file = this.$plugin.getDistFilePath(`${chunk.name}.js`);
        let dir = dirname(file);

        for (const chunkGroup of groups) {
          for (const { name } of chunkGroup.chunks) {
            if (name !== chunk.name) {
              // 依赖 chunk 最后被打包的位置
              let depFile = this.$plugin.getDistFilePath(`${name}.js`);
              modules.add(relative(dir, depFile));
            }
          }
        }
      }

      let depChunks = '';
      for (const item of modules) {
        depChunks += `modules = Object.assign(require('${item}').modules, modules);\n`;
      }

      return Template.asString(['// 使用缓存中加载过的模块作为默认加载过的模块，否则公共模块会被调用多次', 'var installedModules = wx.__installedModules = wx.__installedModules || {}', '// 当前模块依赖的模块', depChunks]);
    } catch (e) {
      console.log(e);
    }
  }

  setRequire(source, chunk, hash) {
    try {
      return Template.asString(["// Check if module is in cache", "if(installedModules[moduleId]) {", Template.indent("return installedModules[moduleId].exports;"), "}", "// Create a new module (and put it into the cache)", "var module = wx.__installedModules[moduleId] = installedModules[moduleId] = {", Template.indent(this.compilation.mainTemplate.hooks.moduleObj.call("", chunk, hash, "moduleId")), "};", "", Template.asString(["// Execute the module function", `modules[moduleId].call(module.exports, module, module.exports, ${this.compilation.mainTemplate.renderRequireFunctionForModule(hash, chunk, "moduleId")});`]), "", "// Flag the module as loaded", "module.l = true;", "", "// Return the exports of the module", "return module.exports;"]);
    } catch (error) {
      console.log(error);
    }
  }
};