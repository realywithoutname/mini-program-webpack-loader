function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const fs = require('fs');
const path = require('path');
const utils = require('./utils');

const isWxml = src => /.wxml$/.test(src);
const isWxss = src => /.wxss$/.test(src);
const isWxs = src => /.wxs$/.test(src);
const isJson = src => /.json$/.test(src);
const isScss = src => /.scss$/.test(src);
const isInvaild = src => isWxml(src) || isWxss(src) || isWxs(src) || isJson(src) || isScss(src);

String.prototype.replaceAll = function (str, replacement) {
  return this.replace(new RegExp(str, 'gm'), replacement);
};

class MiniLoader {
  constructor(loader, code) {
    this.loader = loader;
    this.source = code;
    this.resourcePath = loader.resourcePath;
    this.callback = loader.async();
    this.context = loader.context;
    this.resolveDistPath = this.$plugin && this.$plugin.getDistFilePath;

    this.resolve = (context, request) => new Promise((resolve, reject) => {
      loader.resolve(context, request, (err, result) => err ? reject(err) : resolve(result));
    });

    this.parser();
  }

  parser() {
    const wxmlDepsReg = /src=('|")([^"]*)('|")/g;
    const wxssDepsReg = /@import ('|")([^"].+?)('|");/g;
    const wxsDepsReg = /require\(('|")([^)]*.wxs)('|")\)/g;
    let resourcePath = this.loader.resourcePath;
    let code = this.source;
    let reg = isWxml(resourcePath) ? wxmlDepsReg : isWxss(resourcePath) ? wxssDepsReg : isWxs(resourcePath) ? wxsDepsReg : false;

    const parserPromise = reg ? this.customParser(reg) : this.jsonParser();

    parserPromise.then(code => {
      this.callback(null, code);
    }).catch(this.callback);
  }

  customParser(reg) {
    var _this = this;

    return _asyncToGenerator(function* () {
      return _this.loadDeps(reg).then(function (map) {
        let depsPromise = [];
        let code = _this.source;
        for (const value of map.values()) {
          code = code.replaceAll(value.origin, value.replace);

          /**
           * 动态添加依赖，使用 promise 是为了在所有依赖添加完成后
           * 再调用 callback，否则后添加的依赖不会被监听
           */
          depsPromise.push(_this.addDepsModule(value.sourcePath));
        }

        return Promise.all(depsPromise).catch(function (err) {
          throw err;
        }).then(function () {
          return code;
        });
      });
    })();
  }

  jsonParser() {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      let json = JSON.parse(_this2.source);
      let usingComponents = json.usingComponents;
      if (!usingComponents) return _this2.source;

      let assets = [];
      for (const key in usingComponents) {
        let component = usingComponents[key] + '.json';

        // 获取自定义组件的绝对路径
        let absPath = yield _this2.resolve(_this2.context, component);

        // 获取依赖的实际文件列表
        let dir = path.dirname(absPath);
        let name = path.basename(absPath, '.json');

        let files = utils.getPagePaths(dir, name);
        assets.push(...utils.getPagePaths(dir, name));

        // 获取相对路径，返回到 json 文件中
        let relPath = _this2.getRelativePath(absPath);
        usingComponents[key] = relPath.substr(0, relPath.length - 5);
      }

      _this2.$plugin.newFileEntry(assets);
      return JSON.stringify(json, null, 2);
    })();
  }

  addDepsModule(request) {
    return new Promise((resolve, reject) => {
      // this.loader.addDependency(request)
      this.loader.loadModule(request, (err, src) => {
        err ? reject(err) : resolve(src);
      });
    });
  }

  loadDeps(reg) {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      let matched = null;
      let map = new Map();

      while ((matched = reg.exec(_this3.source)) !== null) {
        let dep = matched[2];

        /**
         * 检查文件引用的文件是否有效
         * wxs 只能引用 wxs
         * wxss 可以引用 wxss，scss
         * wxml 只能引用 wxml
         */
        if (!isInvaild(dep)) {
          continue;
        }

        // 依赖文件的绝对路径
        let absPath = yield _this3.getAbsolutePath(_this3.context, dep);
        let relPath = _this3.getRelativePath(absPath);

        if (!map.has(dep)) {
          map.set(dep, {
            origin: dep, // 原来代码中的依赖路径
            replace: isScss(relPath) ? relPath.replace('.scss', '.wxss') /* wxss 文件支持 scss 文件的引用，打包后需要换后缀 */ : relPath, // 替换路径
            sourcePath: absPath // 依赖文件，用于动态添加依赖
          });
        }
      }

      return map;
    })();
  }

  /**
   * 根据当前文件打包后的路径以及依赖文件的路径打包路径计算依赖的相对路径
   * @param {*} dep 
   */
  getRelativePath(dep) {
    let originPath = this.resolveDistPath(this.resourcePath);
    let depPath = this.resolveDistPath(dep);

    return path.relative(path.dirname(originPath), depPath);
  }

  getAbsolutePath(context, dep) {
    var _this4 = this;

    return _asyncToGenerator(function* () {
      /**
       * 绝对路径则把前面的 / 去掉，需要在 resolve.alias 中做相应配置，主要是兼容有赞小程序历史写法
       * 相对路径则使用相对路径
       */
      dep = path.isAbsolute(dep) ? dep.substr(1) : dep;

      let absPath = yield _this4.resolve(context, dep);
      return absPath;
    })();
  }

}

module.exports = function (content) {
  this.cacheable && this.cacheable();
  const resourcePath = this.resourcePath;

  if (!isWxml(resourcePath) && !isWxss(resourcePath) && !isWxs(resourcePath) && !isJson(this.resourcePath)) return this.callback('Loader 不支持的文件类型', content);

  new MiniLoader(this, content);
};

module.exports.$applyPluginInstance = function (plugin) {
  MiniLoader.prototype.$plugin = plugin;
};