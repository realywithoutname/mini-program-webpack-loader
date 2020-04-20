const { extname } = require('path')
const CONFIG = {
  ali: {
    TWxs (path) {
      return path.replace('.wxs', '.sjs')
    },

    TWxml (path) {
      return path.replace('.wxml', '.axml')
    },

    TWxss (path) {
      return path.replace('.wxss', '.acss')
    },

    TScss (path) {
      return path.replace('.scss', '.acss')
    },

    TPcss (path) {
      return path.replace('.pcss', '.acss')
    },

    TLess (path) {
      return path.replace('.less', '.acss')
    }
  },

  wx: {
    TScss (path) {
      return path.replace('.scss', '.wxss')
    },

    TPcss (path) {
      return path.replace('.pcss', '.wxss')
    },

    TLess (path) {
      return path.replace('.less', '.wxss')
    }
  }
}

module.exports.resolveTargetPath = function (file) {
  let target = process.env.TARGET || 'wx'
  let TARGET = CONFIG[target]
  let ext = extname(file)

  if (!ext) throw new Error(`接受到一个不正常的文件${file}`)

  let method = 'T' + ext.substr(1, 1).toUpperCase() + ext.substr(2)
  return method && TARGET[method] ? TARGET[method](file) : file
}
