const appCode = {
  // path: config
}

module.exports.update = function (config, filePath, isMain) {
  appCode[filePath] = { config, isMain }
}

module.exports.get = function () {
  let code = {
    pages: [],
    subPackages: [],
    plugins: {},
    preloadRule: {},
    usingComponents: {}
  }

  for (const key in appCode) {
    let { config: appJson, isMain } = appCode[key]

    const {
      pages = [],
      subPackages = [],
      preloadRule = {},
      usingComponents = {},
      plugins = {}
    } = appJson

    // 有先后顺序
    code.pages = isMain ? pages.concat(code.pages) : code.pages.concat(pages)

    code.subPackages = code.subPackages.concat(subPackages)

    Object.assign(code.preloadRule, preloadRule)
    Object.assign(code.usingComponents, usingComponents)

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
    Object.keys(appJson).forEach(key => {
      if (['pages', 'subPackages', 'preloadRule', 'usingComponents', 'plugins'].indexOf(key) === -1) {
        code[key] = isMain ? appJson[key] : code[key] || appJson[key]
      }
    })
  }

  /**
   * 去除重复的 page
   */
  code.pages = [...new Set(code.pages)]

  let copy = {}
  let subPackages = code.subPackages || []

  // 合并相同 root 的分包
  subPackages.forEach(pack => {
    let root = pack.root
    if (copy[root]) {
      copy[root].pages = copy[root].pages.concat(pack.pages)
    } else copy[root] = pack
  })

  subPackages = code.subPackages = []

  // 去除重复路径
  Object.keys(copy).forEach(root => {
    let pack = copy[root]
    pack.pages = [...new Set(pack.pages)]
    subPackages.push(pack)
  })

  return code
}
