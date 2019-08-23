const { util: { createHash } } = require('webpack')

module.exports.getContentHash = function getContentHash (compilation, source) {
  const { outputOptions } = compilation
  const {
    hashFunction,
    hashDigest,
    hashDigestLength
  } = outputOptions

  const hash = createHash(hashFunction)

  source.updateHash(hash)

  return hash
    .digest(hashDigest)
    .substring(0, hashDigestLength)
}
