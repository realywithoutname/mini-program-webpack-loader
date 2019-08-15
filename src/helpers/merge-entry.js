module.exports.mergeEntrys = function (entrysCode, mainEntry) {
  let code = {
    preloadRule: {},
    plugins: {},
    subPackages: []
  }

  for (const key in entrysCode) {
    if (entrysCode.hasOwnProperty(key)) {
      const rowCode = entrysCode[key]
      const isMain = key === mainEntry
      const { preloadRule, plugins = {} } = rowCode

      Object.assign(code.preloadRule, preloadRule)

      /**
       * 插件
       */
      Object.keys(plugins).forEach((key) => {
        if (code.plugins[key]) {
          if (code.plugins[key].version !== plugins[key].version) {
            console.log(`插件 ${key} 在 ${key} 中使用了和其他入口不同的版本`.yellow)
          }
          return
        }
        code.plugins[key] = plugins[key]
      })

      /**
       * 保证优先使用主入口文件的配置
       */
      Object.keys(rowCode).forEach(key => {
        if (['preloadRule', 'plugins'].indexOf(key) === -1) {
          code[key] = isMain ? rowCode[key] : code[key] || rowCode[key]
        }
      })
    }
  }

  return code
}
