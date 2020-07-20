const { join } = require('path')

function validateProptery (val, property) {
  if (val !== true && !Array.isArray(val)) {
    throw Error(`${property} 只接受 true 和数组`)
  }
}
function parsePackages (acceptPages = [], acceptPkg = [], ignorePages = [], config) {
  validateProptery(acceptPages, 'entry.accept.pages')
  validateProptery(acceptPkg, 'entry.accept.subPackages')

  const independentPkgs = (config.subPackages || []).filter(({ independent }) => independent)

  if (acceptPages === true) acceptPages = config.pages

  let roots = (config.subPackages || []).map(({ root }) => root)

  if (acceptPkg === true) acceptPkg = roots

  config.pages = acceptPages.filter(page => {
    if (config.pages.indexOf(page) !== -1) return true

    console.log(`page ${page} 在 pages 字段中不存在`.yellow)
  })

  config.subPackages = acceptPkg.reduce((res, root) => {
    let index = roots.indexOf(root)
    if (index === -1) {
      console.log(`subPackages root ${root} 在 subPackages 字段中不存在`.yellow)
      return res
    }

    res.push(
      config.subPackages[index]
    )

    return res
  }, [])

  console.assert(Array.isArray(ignorePages), 'entry.ignore.pages 只接受要忽略的 page 数组')

  config.pages = config.pages.filter(page => ignorePages.indexOf(page) === -1)

  const allowSubPackages = independentPkgs

  config.subPackages.forEach(({ root, pages }) => {
    let pkg = { root, pages: [] }
    pages.forEach(page => {
      if (ignorePages.indexOf(join(root, page)) === -1) {
        pkg.pages.push(page)
      }
    })

    allowSubPackages.push(pkg)
  })

  config.subPackages = allowSubPackages
}

function parseUsingComponents (acceptUsingComponents = [], ignoreUsingComponents = [], config) {
  validateProptery(acceptUsingComponents, 'entry.accept.usingComponents')

  console.assert(Array.isArray(ignoreUsingComponents), 'entry.ignore.usingComponents 必须是一个数组')

  const usingComponents = config.usingComponents || {}

  if (acceptUsingComponents === true) acceptUsingComponents = Object.keys(usingComponents)

  const copyUsingComponents = {}

  acceptUsingComponents.forEach(key => {
    console.assert(usingComponents[key], `entry.accept.usingComponents[${key}] 在 usingComponents 中不存在`.yellow)
    copyUsingComponents[key] = usingComponents[key]
  })

  ignoreUsingComponents.forEach(key => {
    delete copyUsingComponents[key]
  })

  config.usingComponents = Object.keys(copyUsingComponents).length > 0 ? copyUsingComponents : undefined
}

module.exports.getEntryConfig = async function (pluginEntryConfig, appJsonConfig) {
  const entryConfig = pluginEntryConfig
  if (!entryConfig) return appJsonConfig

  const { accept = {}, ignore = {} } = entryConfig
  const config = JSON.parse(JSON.stringify(appJsonConfig))

  // 只要是设置了当前入口的配置，所有非 accept 里面的字段都将视为 ignore 字段
  Object.keys(config).forEach(key => {
    if (accept[key]) return // 接受字段

    delete config[key]
  })

  parsePackages(accept.pages, accept.subPackages, ignore.pages, config)
  await parseUsingComponents(accept.usingComponents, ignore.usingComponents, config)

  return config
}

module.exports.getAcceptPackages = function (pluginEntryConfig, appJsonConfig) {
  const config = JSON.parse(JSON.stringify(appJsonConfig))

  if (pluginEntryConfig) {
    const { accept = {}, ignore = {} } = pluginEntryConfig

    // 只要是设置了当前入口的配置，所有非 accept 里面的字段都将视为 ignore 字段
    Object.keys(config).forEach(key => {
      if (accept[key]) return // 接受字段

      delete config[key]
    })

    parsePackages(accept.pages, accept.subPackages, ignore.pages, config)
  }

  return [
    {
      root: '',
      name: '主包页面',
      pages: config.pages || []
    },
    ...(config.subPackages || [])
  ]
}
