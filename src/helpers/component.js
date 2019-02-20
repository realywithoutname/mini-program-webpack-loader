const { getFiles, flattenDeep } = require('../utils')
const { dirname, basename } = require('path')
const FileTree = require('../FileTree')

let tree = new FileTree()

async function resolveComponent (resolver, context, component) {
  component = component + '.json'

  // 获取自定义组件的绝对路径
  return await resolver(context, component)
}

function forEachUsingComponent (usingComponents, fn) {
  let ps = []

  for (const key in usingComponents || {}) {
    let element = usingComponents[key]

    if (/^plugin:\/\//.test(element)) {
      continue
    }

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
    }
  }

  return ps
}

function getConponentFiles (absPath) {
  // 获取依赖的实际文件列表
  let dir = dirname(absPath)
  let name = basename(absPath, '.json')

  let files = getFiles(dir, name)

  // 新增到编译的组件以及组件对应的文件
  return files
}

async function componentFiles (resolver, request, content, normalCallBack, genericsCallBack) {
  let context = dirname(request)
  let { componentGenerics, usingComponents, publicComponents } = content

  tree.clearDepComponents(request)

  if (!usingComponents && !componentGenerics && !publicComponents) return []

  let asserts = []

  const handelComponent = async (key, component) => {
    /**
     * 这里可以优化，如果文件中已经有了依赖列表，则可以直接用，不用异步取
     */
    let componentPath = await resolveComponent(resolver, context, component)
    let files = getConponentFiles(componentPath)

    /**
     * 这里实际上是不能确定文件是不是成功添加到编译中的
     */
    files.forEach(file => {
      if (!tree.has(file)) asserts.push(file)
    })

    tree.addComponent(request, key, componentPath, files)

    return componentPath
  }

  /**
   * 自定义组件
   */
  let normalPromises = forEachUsingComponent(usingComponents, async (key, item) => {
    let componentPath = await handelComponent(key, item)
    normalCallBack && normalCallBack(componentPath, key, usingComponents)
  })

  /**
   * 插件组件处理和普通插件处理一样
   */
  let pluginPromises = forEachUsingComponent(publicComponents, async (key, item) => {
    let componentPath = await handelComponent(key, item)
    normalCallBack && normalCallBack(componentPath, key, publicComponents)
  })

  /**
   * 抽象组件
   */
  let genericesPromises = forEachComponentGenerics(componentGenerics, async (key, element) => {
    let componentPath = await handelComponent(key, componentGenerics[element][key])

    genericsCallBack && genericsCallBack(componentPath, key, componentGenerics[element])
  })

  await Promise.all([
    ...normalPromises,
    ...pluginPromises,
    ...genericesPromises
  ])

  return asserts
}

/**
 * 提供给 插件 使用来获取自定义组件或者页面依赖的自定义组件文件列表
 */
module.exports.resolveFilesForPlugin = async function (resolver, jsonFiles, componentSet) {
  for (const request of jsonFiles) {
    const content = require(request)
    let files = await componentFiles(resolver, request, content)

    files = flattenDeep(files)

    componentSet.add(files)

    await module.exports.resolveFilesForPlugin(
      resolver,
      files.filter(file => tree.getFile(file).isJson),
      componentSet
    )
  }
}

/**
 * 提供给 loader 使用来获取自定义组件或者页面依赖的自定义组件文件列表
 */
module.exports.resolveFilesForLoader = async function (resolver, request, content, getRelativePath) {
  /**
   * 写回组件的相对路径
   * @param {*} componentPath 组件的绝对路径
   * @param {*} key 组件的 key
   * @param {*} obj json 中的组件列表，普通组件和抽象组件传入不一致
   */
  let setRelComponent = (componentPath, key, obj) => {
    let relPath = getRelativePath(componentPath)
    obj[key] = relPath.substr(0, relPath.length - 5)
  }

  return await componentFiles(
    resolver,
    request,
    content,
    setRelComponent,
    setRelComponent
  )
}
