var _afAppx = __webpack_require__(/*! @alipay/af-appx */ '@alipay/af-appx')
var global = _afAppx.bridge.global = _afAppx.bridge.global || {}

/**
 * 支持自定义组件的 triggerEvent 方法
 */
var triggerEvent = {
  methods: {
    triggerEvent: function (eventName, detail, options) {
      eventName = eventName.replace(/[^a-zA-Z]/, '')
      /**
       * 事件处理还有问题，js 和 wxml 处理不一致
       */
      this.props[eventName] && this.props[eventName]({ detail })
    },
    /**
     * 支持 tap 冒泡
     * @param {*} e
     */
    $_tap: function (e) {
      this.props.onTap && this.props.onTap(e)
    },
    $_merge: function (prevProps, prevData) {
      if (prevProps !== this.props) {
        let observers = this.$_observers
        Object.keys(this.props).forEach(prop => {
          this.data[prop] = this.props[prop]

          if (!observers[prop]) return
          let fn = observers[prop]

          if (typeof observers[prop] === 'string') {
            fn = this[fn]
          }

          if (typeof fn !== 'function') throw new Error('找不到 observer 对应的方法', prop)

          if (!prevProps || prevProps[prop] !== this.props[prop]) {
            console.log(this.is, prop, 'change call:', fn.name)
            fn.call(this, this.props[prop])
          }
        })
      }

      this.properties = this.data
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
    /**
     * 第一次把所有的 props 都传给 data
     */
    this.$_observers = observers
    this.$_merge(null, this.data)
    com.attached && com.attached.call(this)
    com.ready && com.ready.call(this)
  }

  com.didUpdate = function (prevProps, prevData) {
    /**
     * prevData !== this.data
     */

    this.$_merge(prevProps, prevData)
  }
  com.didUnmount = com.detached

  Component(com)
}
