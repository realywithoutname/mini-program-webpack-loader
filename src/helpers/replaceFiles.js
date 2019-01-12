const { getDistPath } = require('../utils')

/**
 * @param {Array} files 文件
 * @param {Array} replaceFiles 替换文件
 */
module.exports = (files, replaceFiles = []) => {
  if (replaceFiles.length > 0) {
    files = files.map(file => {
      replaceFiles = replaceFiles.filter(rFile => {
        // 如果有相对路径一样的文件
        if (rFile.endsWith(getDistPath(file))) {
          // 替换文件
          file = rFile
          return false
        }
        return true
      })

      return file
    })
  }

  return files
}
