var _afAppx = __webpack_require__(/*! @alipay/af-appx */ '@alipay/af-appx')
var global = _afAppx.bridge.global = _afAppx.bridge.global || {}

/**
 * 支持自定义组件的 triggerEvent 方法
 */
var triggerEvent = {
  methods: {
    triggerEvent: function (eventName, detail, options) {
      eventName = eventName.replace(/[^a-zA-Z]/, '')
      this.props[eventName] && this.props[eventName]({ detail })
    },
    /**
     * 支持 tap 冒泡
     * @param {*} e
     */
    $_tap: function (e) {
      this.props.onTap && this.props.onTap(e)
    },
    $_merge: function (isDataUpdate) {
      this.data = this.properties = this.props = isDataUpdate ? Object.assign(this.props, this.data) : Object.assign(this.data, this.props)
    }
  }
}

module.exports = global.Component = function (com) {
  const props = {}
  const Component = (_afAppx.WorkerComponent || function () {})
  const observers = Object.keys(com.properties || {}).reduce((res, key) => {
    const prop = com.properties[key] || {}
    if (prop !== null && typeof prop === 'object' && prop.observer) {
      res[key] = prop.observer
    }

    props[key] = [Array, String, Boolean, Object, Number].indexOf(prop) === -1 ? prop.value || null : prop === Array ? [] : prop('')
    return res
  }, {})

  com.mixins = [global._mixins, triggerEvent].concat(com.behaviors || [])
  com.props = props || {}

  com.props.rootClass = String

  com.didMount = function () {
    this.$_merge(false)
    com.attached && com.attached.call(this)
    com.ready && com.ready.call(this)
  }
  com.didUpdate = function (prevProps, prevData) {
    // console.log(prevProps === this.props, prevData === this.data)
    // console.log(this.props.list, prevData === this.data)
    this.$_merge(prevData === this.data)
    if (prevData !== this.data) {
      let props = Object.keys(prevProps)
      props.forEach((prop) => {
        if (!observers[prop]) return

        let fn = observers[prop]

        if (typeof observers[prop] === 'string') {
          fn = this[prop]
        }

        if (typeof fn !== 'function') throw new Error('找不到 observer 对应的方法', prop)

        fn.call(this, prevProps[prop])
      })
    }
  }
  com.didUnmount = com.detached

  Component(com)
}
