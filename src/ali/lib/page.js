const _afAppx = __webpack_require__(/*! @alipay/af-appx */ '@alipay/af-appx')
const global = _afAppx.bridge.MNTG = _afAppx.bridge.global || {}

let { componentEntry } = require('./relation')

module.exports = global.Page = function (page) {
  const Page = (_afAppx.Page || function () {})

  page.componentMounted = function (com) {
    this._coms = this._coms || []
    componentEntry(com, this)
  }

  page.selectComponent = function (id) {
    return this._coms.filter(com => `#${com.id}` === id)
  }

  page.getComponents = function (is) {
    return this._coms.filter(com => com.is === is)
  }
  Page(page)
}
