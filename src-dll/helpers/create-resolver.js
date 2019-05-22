/**
 * 插件中使用的 resolver，获取真实路径
 */
const {
  NodeJsInputFileSystem,
  CachedInputFileSystem,
  ResolverFactory
} = require('enhanced-resolve')

module.exports.createResolver = function (compiler) {
  const resolver = ResolverFactory.createResolver(
    Object.assign(
      {
        fileSystem: new CachedInputFileSystem(new NodeJsInputFileSystem(), 4000),
        extensions: ['.js', '.json']
      },
      compiler.options.resolve
    )
  )

  return (context, request) => {
    return new Promise((resolve, reject) => {
      resolver.resolve({}, context, request, {}, (err, res) => err ? reject(err) : resolve(res))
    })
  }
}
