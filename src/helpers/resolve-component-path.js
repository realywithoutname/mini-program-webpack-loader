const { dirname } = require('path')
const { readFileSync } = require('fs')

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

async function resolveComponentsPath (resolver, request) {
  let content = {}

  try {
    content = JSON.parse(
      readFileSync(request, { encoding: 'utf8' })
    )
  } catch (error) {
    console.log(error)
  }

  const context = dirname(request)
  const components = new Map()
  const { componentGenerics, usingComponents, publicComponents } = content

  if (!usingComponents && !componentGenerics && !publicComponents) return components

  /**
   * 自定义组件
   */
  let normalPromises = forEachUsingComponent(usingComponents, async (key, item) => {
    if (/^plugin:\/\//.test(item) || /^plugin-private:\/\//.test(item)) {
      components.set(key, {
        request,
        origin: item,
        absPath: item,
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
      return components.set(element, {
        request,
        origin: '',
        absPath: '',
        type: 'generics'
      })
    }
    let relPath = componentGenerics[element].default
    let component = await resolveComponent(resolver, context, relPath)
    components.set(element, {
      request,
      origin: relPath,
      absPath: component,
      type: 'generics'
    })
  })

  await Promise.all([
    ...normalPromises,
    ...pluginPromises,
    ...genericesPromises
  ])

  return components
}

module.exports.resolveComponentsFiles = async function (jsons, componentSet, resolver, emptyComponent) {
  let nextJsons = []
  for (const json of jsons) {
    if (emptyComponent && emptyComponent.test(json)) {
      continue // 对于需要处理为空组件的不再加载其子组件
    }

    let components = await resolveComponentsPath(resolver, json)

    for (const [key, component] of components) {
      componentSet.add({ tag: key, component })
      if (component.type === 'normal' || (component.type === 'generics' && component.absPath)) {
        nextJsons.push(component.absPath)
      }
    }
  }

  nextJsons.length && await module.exports.resolveComponentsFiles(nextJsons, componentSet, resolver, emptyComponent)
}
