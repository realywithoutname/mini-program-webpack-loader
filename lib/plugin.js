const colors = require('colors');
const loader = require('./loader');
const utils = require('./utils');
require('console.table');

const {
  existsSync
} = require('fs');

const {
  dirname,
  join,
  relative,
  extname,
  basename,
  isAbsolute
} = require('path');
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin');
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin');

const {
  ConcatSource,
  RawSource
} = require('webpack-sources');

const Template = require('webpack/lib/Template');

const MiniTemplate = require('./MiniTemplate');

const flattenDeep = arr => {
  while (arr.some(item => Array.isArray(item))) {
    arr = [].concat(...arr);
  }
  return arr;
};

class MiniPlugin {
  constructor(options) {
    this.options = Object.assign({
      chuksName: '__assets_chunk_name__',
      extfile: true
    }, options);

    this.appJsonCode = {
      pages: [],
      subPackages: [],
      plugins: {}
    };

    this.filesSet = new Set();
    this.pagesSet = new Set();
    this.componentSet = new Set();
  }
  apply(compiler) {
    this.compiler = compiler;
    this.outputPath = compiler.options.output.path;
    this.compilerContext = join(compiler.context, 'src');
    this.loadedEntrys = false;

    this.getDistFilePath = null; // 在加载完入口文件后设置
    this.getFiles = utils.getFiles;
    this._appending = [];

    this.compiler.hooks.environment.tap('MiniPlugin', this.setEnvHook.bind(this));
    this.compiler.hooks.compilation.tap('MiniPlugin', this.setCompilation.bind(this));
    this.compiler.hooks.emit.tapAsync('MiniPlugin', this.setEmitHook.bind(this));
    this.compiler.hooks.additionalPass.tapAsync('MiniPlugin', this.setAdditionalPassHook.bind(this));

    loader.$applyPluginInstance(this);
    new MiniTemplate(this).apply(compiler);

    this.loadEntrys(this.compiler.options.entry);

    this.getDistFilePath = utils.getDistPath(this.compilerContext, this.entryContexts);
  }

  setEnvHook() {
    let watch = this.compiler.watch;
    this.compiler.watch = options => watch.call(this.compiler, this.compiler.options, this.watchCallBack.bind(this));
  }

  setAesstPathHook(path) {
    return this.getDistFilePath(path);
  }

  /**
   * compilation 事件处理
   * @param {*} compilation
   */
  setCompilation(compilation) {
    /**
     * 标准输出文件名称
     */
    compilation.mainTemplate.hooks.assetPath.tap('MiniPlugin', this.setAesstPathHook.bind(this));

    /**
     * 去掉自动生成的入口
     */
    compilation.hooks.optimizeChunksBasic.tap('MiniPlugin', chunks => {
      chunks.forEach(({
        name
      }, index) => {
        if (name === this.options.chuksName || name === 'main') {
          return chunks.splice(index, 1);
        }
      });
    });

    /**
     * 动态添加入口文件
     */
    compilation.hooks.needAdditionalPass.tap('MiniPlugin', () => {
      // 在新的编译开始时检查 app json
      return this._appending.length > 0;
    });
  }

  setAdditionalPassHook(callback) {
    if (this._appending.length > 0) {
      this.addEntrys(this.compilerContext, this._appending);
    }
    this._appending = [];
    callback();
  }

  setEmitHook(compilation, callback) {
    let ignoreEntrys = this.getIgnoreEntrys();
    let assets = compilation.assets;

    /**
     * 合并 app.json
     */
    assets['app.json'] = this.getAppJson();

    /**
     * 直接替换 js 代码
     */
    assets['app.js'] = assets[this.mainName + '.js'];

    /**
     * 合并 .wxss 代码到 app.wxss
     */
    assets['app.wxss'] = this.getAppWxss(compilation);

    /**
     * 检查一些 js 文件路径
     */
    for (const file in assets) {
      let tempFile = this.getDistFilePath(file);

      if (tempFile !== file) {
        assets[tempFile] = assets[file];
        delete assets[file];
      }

      if (ignoreEntrys.indexOf(file) > -1 || /node_modules/.test(file)) {
        delete assets[file];
      }
    }
    callback();
  }

  getAppJson() {
    /**
     *  合并所有 .json 的代码到 app.json
     */
    let code = Object.assign({}, this.appJsonCode);

    this.entrys.forEach(entry => {
      code.pages = code.pages.concat(code[entry].pages);
      code.subPackages = code.subPackages.concat(code[entry].subPackages);
      delete code[entry];
    });

    code.pages = [...new Set(code.pages)];
    Object.keys(code).forEach(() => {
      if (!code.key) delete code.key;
    });

    return new ConcatSource(JSON.stringify(code, null, 2));
  }

  setAppJson(config, resourcePath) {
    const {
      pages = [],
      subPackages = [],
      tabBar,
      window,
      networkTimeout,
      debug,
      plugins = {}
    } = config;

    let appJson = this.appJsonCode[resourcePath] = {};

    /**
     * 保存 app.json 中的内容
     */
    appJson.pages = pages;
    appJson.subPackages = subPackages;
    this.appJsonCode.tabBar = this.appJsonCode.tabBar || tabBar;

    /**
     * 插件
     */
    Object.keys(plugins).forEach(key => {
      if (this.appJsonCode.plugins[key]) {
        if (plugins.version !== plugins[key].version) {
          console.log(`插件 ${key} 在 ${resourcePath} 中使用了和其他入口不同的版本`.yellow);
        }
        return;
      }
      this.appJsonCode.plugins[key] = plugins[key];
    });

    /**
     * 其他配置使用最前面的配置
     */
    this.appJsonCode.window = this.appJsonCode.window || window;
    this.appJsonCode.networkTimeout = this.appJsonCode.networkTimeout || networkTimeout;
    this.appJsonCode.debug = this.appJsonCode.debug || debug;
  }

  getAppWxss(compilation) {
    let entryNames = [...new Set(this.entryNames)];
    let wxssCode = '';
    entryNames.forEach(name => {
      let code = compilation.assets[name + '.wxss'];
      if (code) {
        wxssCode + `/************ ${name + '.wxss'} *************/\n`;
        wxssCode += code.source().toString();
      }
    });
    return new RawSource(wxssCode);
  }

  getIgnoreEntrys() {
    /**
     * 多个入口，所有文件对应的原始文件将被丢弃
     */
    let entryNames = [...new Set(this.entryNames)];

    entryNames = entryNames.map(name => {
      if (name !== 'app') {
        return ['.json', '.wxss', '.js'].map(ext => name + ext);
      }
      return [];
    });

    entryNames = flattenDeep(entryNames);
    entryNames.push(this.options.chuksName + '.js');
    return entryNames;
  }

  addEntrys(context, files) {
    let assetFiles = [];
    let scriptFiles = files.filter(file => /\.js$/.test(file) ? true : assetFiles.push(file) && false);
    this.addAssetsEntry(context, assetFiles);
    this.addScriptEntry(context, scriptFiles);
  }

  addListenFiles(files) {
    /**
     * 添加所有已经监听的文件
     */
    files.forEach(file => {
      if (!this.filesSet.has(file)) this.filesSet.add(file);
    });
  }

  addAssetsEntry(context, entrys) {
    this.addListenFiles(entrys);

    new MultiEntryPlugin(context, entrys, this.options.chuksName).apply(this.compiler);
  }

  addScriptEntry(context, entrys) {
    this.addListenFiles(entrys);

    for (const entry of entrys) {
      let fileName = relative(context, entry).replace(extname(entry), '');
      new SingleEntryPlugin(context, entry, fileName).apply(this.compiler);
    }
  }

  checkEntry(entry) {
    if (!entry) throw new Error('entry 配置错误，可以是一个字符串和数组');

    const tempEntrys = typeof entry === typeof '' ? [entry] : entry;

    if (!Array.isArray(tempEntrys) || tempEntrys.length < 1) throw new Error('entry 配置错误，必须是一个字符串和数组');

    tempEntrys.forEach(entry => {
      if (!/\.json/.test(entry)) throw new Error('entry 配置错误，必须是 json 文件路径');
    });
  }

  loadEntrys(entry) {
    this.entrys = entry = typeof entry === typeof '' ? [entry] : entry;
    this.checkEntry(entry);
    let index = 0;

    this.entryContexts = [];
    this.entryNames = [];

    for (const item of entry) {
      const entryPath = isAbsolute(item) ? item : join(context, item);

      this.checkEntry(entryPath);

      const itemContext = dirname(entryPath);
      const fileName = basename(entryPath, '.json');

      this.entryContexts.push(itemContext);
      this.entryNames.push(fileName);

      /**
       * 主入口
       */
      if (index === 0) {
        this.mainEntry = item;
        this.mainContext = itemContext;
        this.mainName = fileName;
        index++;
      }

      /**
       * 获取配置信息，并设置
       */
      const config = require(item);
      this.setAppJson(config, item);

      /**
       * 添加页面
       */
      let pageFiles = this.getPagesEntry(config, itemContext);

      this.addEntrys(itemContext, pageFiles);

      /**
       * 入口文件只打包对应的 wxss 文件
       */
      let entryFiles = this.getFiles(itemContext, fileName, ['.wxss']);
      this.addEntrys(itemContext, entryFiles);
    }

    let tabBar = this.appJsonCode.tabBar;
    let entrys = [this.getFiles(this.mainContext, 'project.config', ['.json']), // project.config.json
    this.options.extfile ? this.getFiles(this.mainContext, 'ext', ['.json']) : [], // ext.json
    this.getFiles(this.mainContext, this.mainName, ['.js'])];

    // tabBar icons
    entrys.concat(tabBar && tabBar.list && this.getTabBarIcons(this.mainContext, tabBar.list) || []);

    this.addEntrys(this.mainContext, flattenDeep(entrys));
  }

  /**
   * 根据 app.json 配置获取页面文件路径
   * @param {*} entry
   */
  getPagesEntry(config, context) {
    const pages = this.getNewPages(config, context);
    const files = pages.map(page => {
      const files = this.getPageFiles(page);

      return files;
    });

    return flattenDeep(files);
  }

  getPageFiles(page) {
    let files = this.getFiles(page);
    if (files.length < 2) {
      console.log('⚠️ ', `页面 ${page} 目录必要文件不全`.yellow, '\n');
      return [];
    }

    // 只有必要文件齐全的文件才会添加到集合
    files.length >= 2 && this.pagesSet.add(page);

    return files;
  }

  getNewPages({
    pages = [],
    subPackages = []
  }, context) {
    const _newPages = [];
    const isNewPage = page => {
      if (!this.pagesSet.has(page)) {
        return true;
      }
      return false;
    };

    subPackages.forEach(({
      root,
      pages
    }) => pages.map(page => {
      page = join(context, root, page);
      isNewPage(page) && _newPages.push(page);
    }));

    pages.forEach(page => {
      page = join(context, page);
      isNewPage(page) && _newPages.push(page);
    });

    return _newPages;
  }

  /**
   * 获取 icon 路径
   * @param {*} context
   * @param {*} tabs
   */
  getTabBarIcons(context, tabs) {
    let files = [];
    for (const tab of tabs) {
      let file = join(context, tab.iconPath);
      if (existsSync(file)) files.push(file);

      file = join(context, tab.selectedIconPath);

      if (existsSync(file)) files.push(file);
    }

    return files;
  }

  /**
   * 输出
   * @param {*} err
   * @param {*} stat
   */
  watchCallBack(err, stat) {
    let {
      hash,
      startTime,
      endTime
    } = stat;
    const {
      warnings = [], errors = []
    } = stat.compilation;
    const status = warnings.length ? ('WARN: ' + warnings.length).yellow : errors.length ? ('ERROR: ' + errors.length).red : 'SUCCESS'.green;

    let ot = [{
      time: new Date().toLocaleTimeString().gray,
      status,
      watch: this.filesSet.size,
      page: this.pagesSet.size,
      component: this.componentSet.size,
      duration: (endTime - startTime + 'ms').red,
      hash
    }];

    if (warnings.length) {
      console.log(warnings);
    }

    if (errors.length) {
      errors.forEach(err => {
        let message = err.message.split(/\n\n|\n/);
        let mainMessage = message[0] || '';
        let lc = mainMessage.match(/\((\d+:\d+)\)/);
        lc = lc ? lc[1] : '1:1';

        console.log('Error in file', (err.module && err.module.id + ':' + lc).red);
        console.log(mainMessage.gray);
        message[1] && console.log(message[1].gray);
        message[2] && console.log(message[2].gray);
        console.log('');
      });
    }

    console.table(ot);
  }

  /**
   * loader 中传递需要添加为入口文件的 js 文件
   * @param {*} param0
   */
  addNewConponentFiles(assets, components) {
    components.forEach(component => !this.componentSet.has(component) && this.componentSet.add(component));
    this._appending = this._appending.concat(assets.filter(file => !this.filesSet.has(file)));
  }

  /**
   * loader 中传递被修改的 app.json
   */
  appJsonChange(config, appPath) {
    this.setAppJson(config, appPath);

    let newPages = this.getNewPages(config, dirname(appPath));
    let pageFiles = newPages.map(this.getPageFiles.bind(this));

    pageFiles = flattenDeep(pageFiles).filter(file => !this.filesSet.has(file));
    this._appending = this._appending.concat(pageFiles);
  }
}

module.exports = MiniPlugin;