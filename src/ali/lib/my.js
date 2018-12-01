function noop () {}

const _afAppx = __webpack_require__(/*! @alipay/af-appx */ '@alipay/af-appx')

// debugger
const origin = Object.assign({}, _afAppx.bridge)

Object.assign(
  _afAppx.bridge,
  {
    test: () => {
      console.log('FUCK 小程序')
    },

    request (options) {
      let success = options.success || noop
      let fail = options.fail || noop
      options.success = function (response) {
        response.statusCode = response.status
        success(response)
      }
      options.fail = function (error) {
        fail(error)
      }

      // console.log(JSON.stringify(options))
      if (options.method === 'POST') {
        options.data = JSON.stringify(options.data)
      }

      options.headers = options.header || {}

      origin.httpRequest(options)
    },
    // setStorage(key, data) {
    //   return origin.setStorage({})
    // },

    login (options) {
      return origin.getAuthCode(
        Object.assign({
          scopes: 'auth_user'
        }, options)
      )
    },

    checkSession (options) {
      options.fail()
    },

    getStorageSync (key) {
      return origin.getStorageSync({ key }).data || ''
    },

    setStorageSync (key, data) {
      return origin.setStorageSync({ key, data })
    },

    showTabBar () {},

    showModal () {},
    startPullDownRefresh () {

    },

    setNavigationBarTitle (title) {
      // return origin.setNavigationBar({
      //   title
      // })
    },
    /**
     * TODO
     */
    createIntersectionObserver () {},
    createSelectorQuery () {
      /**
       * 先乱起八糟写吧
       */
      let query = origin.createSelectorQuery()
      query.in = (params) => {
        return query
      }
      return query
    }
  }
)
