module.exports = class WXLoaderHelper {
  TWxs (path) {
    return path
  }

  TWxml (path) {
    return path
  }

  TWxss (path) {
    return path
  }

  TScss (path) {
    return path.replace('.scss', '.wxss')
  }

  TPcss (path) {
    return path.replace('.pcss', '.wxss')
  }
}
