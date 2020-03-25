const { util: { createHash } } = require('webpack')
const { RawSource } = require('webpack-sources')

module.exports.getContentHash = function getContentHash (compilation, source) {
  const { outputOptions } = compilation
  const {
    hashFunction,
    hashDigest,
    hashDigestLength
  } = outputOptions

  const hash = createHash(hashFunction)

  if (source && typeof source.source) {
    source = new RawSource(source.source())
  }

  source.updateHash(hash)

  return hash
    .digest(hashDigest)
    .substring(0, hashDigestLength)
}
