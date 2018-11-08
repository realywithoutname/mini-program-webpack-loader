function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const { existsSync } = require('fs');
const {
  dirname,
  join,
  relative,
  extname,
  basename,
  isAbsolute
} = require('path');
const { ConcatSource, RawSource } = require('webpack-sources');
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin');
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin');

const {
  flattenDeep,
  getFiles,
  componentFiles
} = require('./utils');

const mainChunkNameTemplate = '__assets_chunk_name__';
let mainChunkNameIndex = 0;

module.exports = class MiniProgam {
  constructor(options) {
    this.chunkNames = ['main'];

    this.options = Object.assign({
      extfile: true,
      commonSubPackages: true,
      analyze: false,
      resources: [],
      compilationFinish: null
    }, options);

    this.appJsonCode = {
      pages: [],
      subPackages: [],
      plugins: {},
      preloadRule: {},
      usingComponents: {}
    };

    this.filesSet = new Set();
    this.pagesSet = new Set();
    this.componentSet = new Set();
    this.subpackageMap = new Map();
  }

  getAppJson() {
    /**
     *  合并所有 .json 的代码到 app.json
     */
    let code = Object.assign({}, this.appJsonCode);

    this.entrys.forEach(entry => {
      code.pages = code.pages.concat(code[entry].pages);
      code.subPackages = code.subPackages.concat(code[entry].subPackages);

      Object.assign(code.preloadRule, code[entry].preloadRule);
      Object.assign(code.usingComponents, code[entry].usingComponents);
      delete code[entry];
    });

    let subPackages = code.subPackages || [];
    let copy = {};
    subPackages.forEach(pack => {
      if (copy[pack.root]) copy[pack.root].pages = copy[pack.root].pages.concat(pack.pages);else copy[pack.root] = pack;
    });

    subPackages = code.subPackages = [];

    Object.keys(copy).forEach(root => {
      let pack = copy[root];
      pack.pages = [...new Set(pack.pages)];
      subPackages.push(pack);
    });

    code.pages = [...new Set(code.pages)];
    Object.keys(code).forEach(() => {
      if (!code.key) delete code.key;
    });

    return code;
  }

  getAppJsonCode() {
    return new ConcatSource(JSON.stringify(this.getAppJson(), null, 2));
  }

  getExtJson() {
    if (!existsSync(this.options.extfile)) {
      console.warn(`${this.options.extfile} 文件找不到`);
      return new ConcatSource(JSON.stringify({}, null, 2));
    }

    let ext = require(this.options.extfile);
    return new ConcatSource(JSON.stringify(ext, null, 2));
  }

  setAppJson(config, resourcePath) {
    const {
      pages = [],
      subPackages = [],
      preloadRule = {},
      usingComponents = {},
      tabBar,
      window,
      networkTimeout,
      debug,
      functionalPages,
      plugins = {}
    } = config;

    let appJson = this.appJsonCode[resourcePath] = {};

    /**
     * 保存 app.json 中的内容
     */
    appJson.pages = pages;
    appJson.subPackages = subPackages;
    appJson.preloadRule = preloadRule;
    appJson.usingComponents = usingComponents;
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
    this.appJsonCode.functionalPages = this.appJsonCode.functionalPages || functionalPages;
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
      if (name === 'app') return [];
      return ['.json', '.wxss', '.js'].map(ext => name + ext);
    });

    entryNames = flattenDeep(entryNames);

    /**
     * 静态资源的主文件
     */
    entryNames = entryNames.concat(this.chunkNames.map(chunkName => chunkName + '.js'));

    return entryNames;
  }

  addEntrys(context, files) {
    let assetFiles = [];
    let scriptFiles = files.filter(file => {
      if (this.filesSet.has(file)) return false;
      if (!this.filesSet.has(file)) this.filesSet.add(file);
      return (/\.js$/.test(file) ? true : assetFiles.push(file) && false
      );
    });
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
    let chunkName = mainChunkNameTemplate + mainChunkNameIndex;
    this.chunkNames.push(chunkName);
    new MultiEntryPlugin(context, entrys, chunkName).apply(this.compiler);

    // 自动生成
    mainChunkNameIndex++;
  }

  addScriptEntry(context, entrys) {
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
    var _this = this;

    return _asyncToGenerator(function* () {
      _this.entrys = entry = typeof entry === typeof '' ? [entry] : entry;
      _this.checkEntry(entry);
      let index = 0;

      _this.entryContexts = [];
      _this.entryNames = [];

      let promiseSet = new Set();

      for (const item of entry) {
        const entryPath = isAbsolute(item) ? item : join(context, item);

        _this.checkEntry(entryPath);

        const itemContext = dirname(entryPath);
        const fileName = basename(entryPath, '.json');

        _this.entryContexts.push(itemContext);
        _this.entryNames.push(fileName);

        /**
         * 主入口
         */
        if (index === 0) {
          _this.mainEntry = item;
          _this.mainContext = itemContext;
          _this.mainName = fileName;
          index++;
        }

        /**
         * 获取配置信息，并设置
         */
        const config = require(item);
        _this.setAppJson(config, item);

        /**
         * 添加页面
         */
        let pageFiles = _this.getPagesEntry(config, itemContext);

        let componentSet = new Set();

        pageFiles.push(entryPath);

        promiseSet.add(_this.loadComponentsFiles(pageFiles, componentSet).then(function () {
          let files = flattenDeep(Array.from(componentSet));
          _this.addEntrys(itemContext, files);
        }));

        _this.addEntrys(itemContext, pageFiles);

        /**
         * 入口文件只打包对应的 wxss 文件
         */
        let entryFiles = getFiles(itemContext, fileName, ['.wxss']);
        _this.addEntrys(itemContext, entryFiles);
      }

      let tabBar = _this.appJsonCode.tabBar;
      let extfile = _this.options.extfile;

      let entrys = [getFiles(_this.mainContext, 'project.config', ['.json']), // project.config.json
      extfile === true ? getFiles(_this.mainContext, 'ext', ['.json']) : [], // ext.json 只有 extfile 为 true 的时候才加载主包的 ext.json
      getFiles(_this.mainContext, _this.mainName, ['.js'])];

      // tabBar icons
      entrys.concat(tabBar && tabBar.list && _this.getTabBarIcons(_this.mainContext, tabBar.list) || []);

      _this.addEntrys(_this.mainContext, flattenDeep(entrys));
      return yield Promise.all(Array.from(promiseSet));
    })();
  }

  loadComponentsFiles(pageFiles, componentSet) {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      let jsons = pageFiles.filter(function (file) {
        return (/\.json/.test(file)
        );
      });

      for (const json of jsons) {
        let files = yield componentFiles(_this2.resolver, json);
        files = flattenDeep(files);
        componentSet.add(files);
        yield _this2.loadComponentsFiles(flattenDeep(files), componentSet);
      }
    })();
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
    let files = getFiles(page);
    if (files.length < 2) {
      console.log('⚠️ ', `页面 ${page} 目录必要文件不全`.yellow, '\n');
      return [];
    }

    // 只有必要文件齐全的文件才会添加到集合
    files.length >= 2 && this.pagesSet.add(page);

    return files;
  }

  getNewPages({ pages = [], subPackages = [] }, context) {
    const _newPages = [];
    const isNewPage = page => {
      if (!this.pagesSet.has(page)) {
        return true;
      }
      return false;
    };

    subPackages.forEach(({ root, pages }) => {
      let _pages = [];

      pages.map(page => {
        _pages.push(join(root, page));
        page = join(context, root, page);
        isNewPage(page) && _newPages.push(page);
      });

      this.subpackageMap.set(root, _pages);
    });

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

  moduleOnlyUsedBySubpackages(module) {
    if (!/\.js$/.test(module.resource) || module.isEntryModule()) return false;
    if (!module._usedModules) throw new Error('非插件提供的 module，不能调用这个方法');

    let { subPackages } = this.getAppJson();
    let subRoots = subPackages.map(({ root }) => root) || [];
    let subReg = new RegExp(subRoots.join('|'));
    let usedFiles = Array.from(module._usedModules);

    return !usedFiles.some(moduleName => !subReg.test(moduleName));
  }

  moduleUsedBySubpackage(module, root) {
    if (!/\.js$/.test(module.resource) || module.isEntryModule()) return false;
    if (!module._usedModules) throw new Error('非插件提供的 module，不能调用这个方法');

    let reg = new RegExp(root);

    let usedFiles = Array.from(module._usedModules);

    return usedFiles.some(moduleName => reg.test(moduleName));
  }

  moduleOnlyUsedBySubPackage(module, root) {
    if (!/\.js$/.test(module.resource) || module.isEntryModule()) return false;

    let usedFiles = module._usedModules;

    if (!usedFiles) return false;

    let reg = new RegExp(root);

    return !Array.from(usedFiles).some(moduleName => !reg.test(moduleName));
  }

  /**
   * 判断所给的路径在不在自定义组件内
   * @param {String} path 任意路径
   */
  pathInSubpackage(path) {
    let { subPackages } = this.getAppJson();

    for (const { root } of subPackages) {
      let match = path.match(root);

      if (match !== null && match.index === 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * 判断所给的路径集合是不是在同一个包内
   * @param {Array} paths 路径列表
   */
  pathsInSamePackage(paths) {
    // 取第一个路径，获取子包 root，然后和其他路径对比
    let firstPath = paths[0];
    let root = this.getPathRoot(firstPath);

    // 路径不在子包内
    if (!root) {
      return '';
    }

    let reg = new RegExp(`^${root}`);
    for (const path of paths) {
      if (!reg.test(path)) return '';
    }

    return root;
  }

  /**
   * 判断列表内数据是不是在同一个目录下
   * @param {*} paths 
   */
  pathsInSameFolder(paths) {
    let firstPath = paths[0];
    let folder = firstPath.split('/')[0];
    let reg = new RegExp(`^${folder}`);

    for (const path of paths) {
      if (!reg.test(path)) return '';
    }

    return folder;
  }

  /**
   * 获取路径所在的 package root
   * @param {String} path 
   */
  getPathRoot(path) {
    let { subPackages } = this.getAppJson();

    for (const { root } of subPackages) {
      let match = path.match(root);

      if (match !== null && match.index === 0) {
        return root;
      }
    }

    return '';
  }

  /**
   * 
   * @param {*} root 
   * @param {*} files 
   */
  otherPackageFiles(root, files) {
    return files.filter(file => file.indexOf(root) === -1);
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
};