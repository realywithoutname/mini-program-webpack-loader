const MiniPlugin = require('./MiniPlugin')
const { getFiles, flattenDeep, getDistPath } = require('./utils')
const { isAbsolute, join, dirname, basename } = require('path')
const loader = require('./loader');
const MiniTemplate = require('./MiniTemplate');

class TransformPlugin extends MiniPlugin {
  constructor () {
    super()
    this._appending = []
    this.options.commonSubPackages = false
  }

  apply (compiler) {
    let options = compiler.options
    this.miniEntrys = utils.formatEntry(options.entry, this.chunkNames)
    let entry = this.miniEntrys

    if (entry.length === 0 || !Array.isArray(entry)) {
      return console.error('没能获取到正确的 entry', entry)
    }
    
    let { components } = require(entry[0])
    
    this.context = compiler.context
    this.entryDir = dirname(entry[0])
    this.entryName = basename(entry[0])
    this.compiler = compiler
    this.compilerContext = join(compiler.context, 'src');
    
    let componentFiles = this.loadComponents(components);
    
    new MiniTemplate(this).apply(compiler);

    this.addEntrys(this.entryDir, componentFiles)
    loader.$applyPluginInstance(this);
    this.getDistFilePath = getDistPath(this.compilerContext, [this.entryDir]);

    this.compiler.hooks.environment.tap('MiniPlugin', this.setEnvHook.bind(this));
    this.compiler.hooks.compilation.tap('MiniPlugin', this.setCompilation.bind(this));
    this.compiler.hooks.emit.tapAsync('MiniPlugin', this.setEmitHook.bind(this));
    this.compiler.hooks.additionalPass.tapAsync('MiniPlugin', this.setAdditionalPassHook.bind(this));
  }

  setCompilation(compilation) {
    /**
     * 标准输出文件名称
     */
    compilation.mainTemplate.hooks.assetPath.tap('MiniPlugin', this.getAesstPathHook.bind(this));

    /**
     * 检查是否有需要动态添加的入口文件，如果有需要重新编译
     */
    compilation.hooks.needAdditionalPass.tap('MiniPlugin', () => {
      return this._appending.length > 0;
    });
  }

  setEmitHook(compilation, callback) {
    let ignoreFiles = this.getIgnoreEntrys()
    let assets = compilation.assets;

    ignoreFiles.push(this.entryName)
    
    for (const file in assets) {
      let tempFile = this.getDistFilePath(file);

      if (tempFile !== file) {
        assets[tempFile] = assets[file];
        delete assets[file];
      }

      if (ignoreFiles.indexOf(file) > -1 || /node_modules/.test(file)) {
        delete assets[file];
      }
    }
    callback()
  }

  loadComponents (components) {
    let assets = []
    for (let component of components) {
      component = isAbsolute(component) ? component : join(this.entryDir, component)
      assets.push(getFiles(component))
    }

    return flattenDeep(assets)
  }
}

module.exports = TransformPlugin