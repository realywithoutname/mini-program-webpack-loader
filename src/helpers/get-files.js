/**
 * 获取小程序路径对应的文件列表
 * @param {*} base
 * @param {*} path
 * @param {*} exts
 */
const { dirname, join, basename } = require('path')
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

exports.getScriptDepFile = function getScriptDepFile (component, getNamespace, constructorNames) {
  const deps = [...component.children].reduce((res, item) => {
    if (!item.beTemplate) return res

    const depFile = getScriptDepFile(item, getNamespace, constructorNames)

    res.push({
      tag: item.tag,
      name: getNamespace(item.component.absPath),
      path: depFile
    })
    return res
  }, [])

  const componentPath = component.component.absPath

  const context = dirname(componentPath)
  const path = basename(componentPath, '.json')
  const file = exports.getFiles(context, path, ['.js'])[0]

  // 用 ??? 来表示loader，如果直接用 ! 会导致webpack 识别出错
  return `${require.resolve('../loaders/merge-js-loader')}???${file}?deps=${encodeURIComponent(
    JSON.stringify(deps)
  )}&namespace=${getNamespace(componentPath)}&constructors=${
    encodeURIComponent(JSON.stringify(constructorNames))
  }`
}
