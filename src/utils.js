const {
  join,
  dirname,
  extname,
  relative,
  basename
} = require('path')
const { existsSync } = require('fs')

exports.camelCase = (str) => {
  let words = str.split(/[^a-zA-Z]/)

  return words.reduce((str, val) => {
    str += (val[0].toUpperCase() + val.substr(1))
    return str
  }, words.shift())
}

/**
 * 扁平数组
 * @param {Array} arr 输入数组
 */
exports.flattenDeep = (arr) => {
  while (arr.some(item => Array.isArray(item))) {
    arr = [].concat(...arr)
  }
  return arr
}

exports.isObject = function (val) {
  return typeof val === 'object' && val !== null
}

exports.relative = (from, to) => {
  return './' + relative(dirname(from), to).replace(/\\/g, '/')
}

exports.join = function (...rest) {
  return require('path').posix.join(...rest)
}

exports.removeExt = (file) => {
  return join(
    dirname(file),
    basename(file, extname(file))
  )
}

exports.isEmpty = (obj) => {
  return (Array.isArray(obj) && obj.length === 0) || (exports.isObject(obj) && Object.keys(obj).length === 0)
}

exports.noop = () => {}

exports.forEachValue = (obj, cb) => {
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => cb(index, item))
  } else if (exports.isObject(obj)) {
    Object.keys(obj).forEach(key => {
      cb(key, obj[key])
    })
  } else {
    throw Error('参数错误')
  }
}

/**
 * @description 获取 app.json plugins 的 export 字段
 */
exports.getExportFilePath = function (appCode, context) {
  let filePaths = []
  if (!appCode.plugins) {
    return filePaths
  }

  Object.keys(appCode.plugins).forEach(fileName => {
    if (appCode.plugins[fileName] && appCode.plugins[fileName].export) {
      const file = join(context, appCode.plugins[fileName].export)
      if (existsSync(file)) {
        filePaths.push(file)
      } else {
        throw new Error(`${file} 不存在，请检查 plugins 中的 export 字段在 ${context} 是否存在`)
      }
    }
  })

  return filePaths
}

/**
 * 
 * @param {*} extfile ext 配置
 * @param {*} context 执行上下文
 * @description 获取 ext.json
 */
exports.getExtPath = function (extfile, context) {
  if (extfile === false) {
    return ''
  }
  if (extfile === true) {
    return join(context, 'ext.json')
  }
  if (typeof extfile === 'string') {
    // options.extfile 是绝对路径，不需要 join
    return extfile
  }
}

