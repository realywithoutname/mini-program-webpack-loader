/**
 * 获取小程序路径对应的文件列表
 * @param {*} base
 * @param {*} path
 * @param {*} exts
 */
const { join } = require('path')
const { existsSync } = require('fs')
const EXTS = ['.js', '.ts', '.json', '.wxml', '.wxss', '.wxs', '.scss', '.pcss', '.less']

exports.getFiles = (base, path = '', exts) => {
  let files = []

  path = join(base, path)

  for (const ext of (exts || EXTS)) {
    let file = path + ext
    if (existsSync(file)) files.push(file)
  }

  return files
}

exports.getFile = (request) => {
  const requestIndex = request.lastIndexOf('!')

  if (requestIndex !== -1) {
    request = request.substr(requestIndex + 1)
  }
  return request.split('?')[0]
}
