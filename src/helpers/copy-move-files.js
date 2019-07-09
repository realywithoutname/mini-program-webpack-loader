const { resolveDepDistPath } = require('./resolve-dist-path')
const { updateJsCode, updatePathOfCode } = require('./update-code')

module.exports.copyMoveFiles = function copyMoveFiles (movedFiles, assets, fileTree) {
  const needCheckUsedMetas = new Set()
  const distFileTree = new Map()
  /**
   * 移动依赖的普通文件
   * @param {*} fileMeta 文件基础的数据
   * @param {*} originDist 文件一开始的输出位置
   * @param {*} additionDist 文件被拷贝的位置
   * @param {String} usedFile 引起改变的文件
   */
  function moveDep (fileMeta, originDist, additionDist, usedFile) {
    if (!distFileTree.has(usedFile)) {
      // 记录依赖该文件的新的依赖的位置，移动完成后通过根据检查依赖者的这个依赖是否有新的依赖来
      // 判断这个原来的依赖文件能不能被删除
      distFileTree.set(usedFile, new Set())
    }

    const deps = distFileTree.get(usedFile)

    deps.add(
      [
        originDist, // 最初依赖的文件位置
        additionDist // 移动位置后的文件位置
      ]
    )
    // json 文件，移动所有依赖的自定义组件文件
    fileMeta.isJson && [...fileMeta.components.values()].forEach((path) => {
      // 有些抽象组件跳过
      if (!path) return
      const { files, type } = fileTree.components.get(path)

      // 插件依赖跳过
      if (type.get(path) === 'plugin') return

      files.forEach(meta => {
        const depDist = resolveDepDistPath(originDist, additionDist, meta.dist)

        moveDep(meta, meta.dist, depDist, fileMeta.source)
      })
    })

    // 移动其他依赖文件
    fileMeta.deps.forEach(meta => {
      // 计算出依赖文件新的输出路径
      const depDist = resolveDepDistPath(originDist, additionDist, meta.dist)

      moveDep(meta, meta.dist, depDist, fileMeta.source)
    })

    // 被移动的 js 文件需要检查使用了 `require` 加载器的依赖地址
    assets[additionDist] = fileMeta.isJs
      ? updateJsCode(assets[originDist], originDist, additionDist)
      : assets[originDist]

    // 文件的先后输出位置不一致，最后需要检查是不是需要删除原始的输出文件
    if (additionDist !== originDist) {
      // 把这个被移动的文件添加到集合，最后检查是不是所有使用到这个文件的文件都有自己的依赖（拷贝了这个文件）
      needCheckUsedMetas.add(fileMeta)
    }
  }

  const needBeRemove = []
  // TODO 对于 movedFiles 数组应该先按照依赖关系排序后再处理（不处理可能存在由于先后顺序出现 bug）
  movedFiles.forEach(({ dist, dists }) => {
    let distNeedBeRemove = true

    const fileMeta = fileTree.getFileByDist(dist)

    dists.forEach(({ dist: additionDist, usedFile }) => {
      // 设置标示：如果所有的输出都没有需要输出为 dist 文件的，则需要在最后把 dist 删除
      if (additionDist === dist) {
        // 有输出到原来路径的情况（如果文件就是在分包）
        // 这种情况不需要做其他操作
        distNeedBeRemove = false
        return
      }
      const userMeta = fileTree.getFile(usedFile)

      // 更新引起这个文件输出的文件的依赖路径
      assets[userMeta.dist] = updatePathOfCode(assets[userMeta.dist], userMeta, dist, additionDist)

      // 递归移动依赖的文件，
      // 因为输出文件都是使用的相对路径，所以不需要修改依赖关系
      moveDep(fileMeta, dist, additionDist, usedFile)
    })

    if (distNeedBeRemove) {
      needBeRemove.push(dist)
    }
  })

  function checkDistCanBeRemove (meta) {
    const fileHasBeDep = {}

    meta.used.forEach(user => {
      // 标识该文件是否还被这个依赖者依赖
      fileHasBeDep[user.source] = true

      // 依赖者已经移动位置的依赖
      let deps = distFileTree.get(user.source)

      // 表示依赖还是在原来的位置，也就是 meta 文件还是被他依赖，不能被删除
      if (!deps || !deps.size) {
        return
      }

      // 试图在所有已经移动位置的依赖中找到 meta 文件已经被移动，如果找到表示当前依赖者不依赖这个文件
      for (const [originDist] of deps) {
        if (originDist === meta.dist) {
          fileHasBeDep[user.source] = false
          return
        }
      }
    })

    const hasBeDepLength = Object.keys(fileHasBeDep).filter(key => fileHasBeDep[key]).length

    // 标识当前依赖关系解除
    let canBeRemove = hasBeDepLength === 0

    // 如果当前文件的依赖关系解除，需要继续依赖他的文件是否都解除了依赖
    if (canBeRemove) {
      for (const user of meta.used) {
        // 表示这个文件没有被移动，只有被移动了位置的文件才需要检查是不是还被其他没有移动的文件依赖
        if (!needCheckUsedMetas.has(user)) return canBeRemove

        canBeRemove = checkDistCanBeRemove(user)
        // 如果遇到没有解除依赖的，表示这个文件不可以被删除，则他所有依赖的文件也不能被删除
        if (!canBeRemove) return canBeRemove
      }
    }

    return canBeRemove
  }
  needCheckUsedMetas.forEach(meta => {
    // 判断这个文件能不能被删除，即判断所有依赖该文件的文件对该文件的依赖还是不是原来的依赖
    // if (/base-sku\/sku-header\/index.json/.test(meta.dist)) {
    //   debugger
    // }
    // 遍历这个需要检查的文件的依赖者，然后从所有已经移动位置的依赖中查看这个这个依赖有没有被移动位置，如果移动了
    // 说明不对这个依赖着不对该文件形成依赖，如果所有的依赖者都不形成依赖，则表示没有依赖，可以删除
    if (checkDistCanBeRemove(meta)) {
      delete assets[meta.dist]
    }
  })

  needBeRemove.forEach(dist => delete assets[dist])
}
