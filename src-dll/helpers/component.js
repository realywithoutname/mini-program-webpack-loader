const { dirname } = require('path')

async function resolveComponent (resolver, context, component) {
  component = component + '.json'
  // 获取自定义组件的绝对路径
  return await resolver(context, component)
}

function forEachUsingComponent (usingComponents, fn) {
  let ps = []

  for (const key in usingComponents || {}) {
    let element = usingComponents[key]

    ps.push(fn(key, element))
  }

  return ps
}

function forEachComponentGenerics (componentGenerics, fn) {
  let ps = []

  for (const key in componentGenerics) {
    if (typeof componentGenerics[key] === 'object') {
      for (const _key in componentGenerics[key]) {
        ps.push(fn(_key, key))
      }
    } else if (componentGenerics[key]) {
      fn(key, key)
    }
  }

  return ps
}

module.exports.resolveComponentsPath = async function (resolver, request) {
  const content = require(request)
  const context = dirname(request)
  const components = new Map()
  const { componentGenerics, usingComponents, publicComponents } = content

  if (!usingComponents && !componentGenerics && !publicComponents) return components

  /**
   * 自定义组件
   */
  let normalPromises = forEachUsingComponent(usingComponents, async (key, item) => {
    if (/^plugin:\/\//.test(item)) {
      components.set(key, {
        request,
        origin: item,
        absPath: '',
        type: 'plugin'
      })
      return
    }
    let component = await resolveComponent(resolver, context, item)

    components.set(key, {
      request,
      origin: item,
      absPath: component,
      type: 'normal'
    })
  })

  /**
  * 插件组件处理和普通插件处理一样
  */
  let pluginPromises = forEachUsingComponent(publicComponents, async (key, item) => {
    let component = await resolveComponent(resolver, context, item)
    components.set(key, {
      request,
      origin: item,
      absPath: component,
      type: 'normal'
    })
  })

  /**
   * 抽象组件
   */
  let genericesPromises = forEachComponentGenerics(componentGenerics, async (key, element) => {
    if (componentGenerics[element] === true) {
      return components.set(key, {
        request,
        origin: '',
        absPath: '',
        type: 'generics'
      })
    }
    let relPath = componentGenerics[element].default
    let component = await resolveComponent(resolver, context, relPath)
    components.set(key, {
      request,
      origin: relPath,
      absPath: component,
      type: 'normal'
    })
  })

  await Promise.all([
    ...normalPromises,
    ...pluginPromises,
    ...genericesPromises
  ])

  return components
}
