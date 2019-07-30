module.exports.analyzeGraph = function analyzeGraph (stat, compilation) {
  let chunks = compilation.chunks

  chunks.forEach(chunk => {
    if (chunk.name === '__assets_chunk_name__0') {
      // console.log(chunk)
    }
    // console.log(chunk.name, chunk.getModules().length)
  })
}
