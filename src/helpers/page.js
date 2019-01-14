const { join } = require('path')
const { getFiles } = require('../utils')
const FileTree = require('../FileTree')

let tree = new FileTree()

function filterPackages (packages, returnTure) {
  let result = []

  packages.forEach(({ root, pages }) => {
    pages.forEach(page => {
      page = join(root, page)
      if (returnTure(page)) {
        result.push({ page, isSubPkg: !!root })
      }
    })
  })

  return result
}

/**
 * 根据 app.json 配置获取页面文件路径
 * 如果多个入口中有相同 page 则优先处理（第一个）的入口的 page 生效
 * @param {*} entry
 */
module.exports.reslovePagesFiles = function ({ pages = [], subPackages = [] }, context, options = {}) {
  const { replaceFile } = options
  const packages = [...subPackages, { root: '', pages }]

  const newPages = filterPackages(packages, page => !tree.hasPage(page))

  const result = []

  newPages.forEach(({ page, isSubPkg }) => {
    let files = getFiles(context, page)

    if (Array.isArray(replaceFile) && typeof replaceFile[0] === 'function') {
      files = files.map(replaceFile[0])
    }

    files.forEach(file => !tree.has(file) && result.push(file))

    tree.addPage(page, files, isSubPkg)
  })

  return result
}
