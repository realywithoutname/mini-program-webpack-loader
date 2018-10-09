module.exports = class AliLoaderHelper {
  transformWxss (content) {
    return content
  }

  transformWxml (content) {
    // wx
    content = content.replace(/wx:/g, 'a:')

    // 事件
    content = content.replace(/(bind|catch)[:]?(.+?)=/g, ($0, $1, $2) => {
      return `${$1 === 'bind' ? 'on' : 'catch'}${$2[0].toUpperCase()}${$2.substr(1)}=`
    })

    return content
  }

  TWxs (path) {
    return path.replace('.wxs', '.sjs')
  }

  TWxml (path) {
    return path.replace('.wxml', '.axml')
  }

  TWxss (path) {
    return path.replace('.wxss', '.acss')
  }

  TScss (path) {
    return path.replace('.scss', '.acss')
  }

  TPcss (path) {
    return path.replace('.pcss', '.acss')
  }
}
