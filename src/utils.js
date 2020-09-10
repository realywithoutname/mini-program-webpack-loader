const {
  join,
  dirname,
  extname,
  relative,
  basename
} = require('path')

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
