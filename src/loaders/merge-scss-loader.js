const loaderUtils = require('loader-utils')
const { relative } = require('../utils')
const { parseQuery } = loaderUtils
const path = require('path')
const thisloader = path.join(__dirname, 'merge-scss-loader.js')

module.exports = function (code) {
  let { deps } = parseQuery(this.resourceQuery)
  let sources = []

  if (!deps) return code

  deps = JSON.parse(deps)

  deps.forEach(({ path }) => {
    const dep = relative(this.resourcePath, path).replace('.scss', '.wxss')

    sources.push(`@import "${dep}";`)
  })

  sources.push(code)

  return sources.join('\n')
}

module.exports.pitch = function () {
  let { hasRedirect, deps } = parseQuery(this.resourceQuery)

  if (!deps) return

  deps = JSON.parse(deps)

  if (!deps.length) return

  if (!hasRedirect) {
    const loaders = this.loaders.filter(loader => loader.path !== thisloader)
    const fileLoaderIndex = this.loaders.findIndex(loader => loader.path.indexOf('file-loader') !== -1)

    loaders.splice(fileLoaderIndex, 0, thisloader)
    const request = genRequest(loaders, this, '&hasRedirect=true')
    return `export * from ${request}`
  }
}

function genRequest (loaders, loaderContext, query = '') {
  const seen = new Map()
  const loaderStrings = []

  loaders.forEach((loader) => {
    const identifier =
      typeof loader === 'string' ? loader : loader.path + loader.query
    const request = typeof loader === 'string' ? loader : loader.request
    if (!seen.has(identifier)) {
      seen.set(identifier, true)
      // loader.request contains both the resolved loader path and its options
      // query (e.g. ??ref-0)
      loaderStrings.push(request)
    }
  })

  query = loaderContext.resourceQuery ? query : `?${query}`

  return loaderUtils.stringifyRequest(
    loaderContext,
    `-!${[
      ...loaderStrings,
      loaderContext.resourcePath + loaderContext.resourceQuery + query
    ].join('!')}`
  )
}
