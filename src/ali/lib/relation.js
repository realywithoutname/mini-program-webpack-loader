function resolve (a, b) {
  let bs = b.split('/')
  let as = a.split('/')

  let c = bs.shift()

  as.pop()

  while (c === '..') {
    as.pop()
    c = bs.shift()
  }

  c && bs.unshift(c)

  return (as.concat(bs)).join('/')
}

module.exports.componentEntry = function componentEntry (com, target) {
  // destroy 需要去掉
  target._coms.push(com)
  let relations = com._relations
  let comKeys = Object.keys(relations || {})

  let $leave = function (coms) {
    return function () {
      coms.some((item, index) => {
        if (item === this) {
          coms.splice(index, 1)
          return true
        }
        return false
      })
    }
  }

  com.$leave = $leave(target._coms)

  comKeys.forEach(key => {
    let is = resolve(com.is, key) // 获取 relation 祖先节点
    let { type, linked: childLined, unlinked: childUnlinked } = relations[key]

    if (['parent', 'descendant'].indexOf(type) === -1) return
    let children = (target.getComponents(is) || []) // 获取最后进入的那个祖先节点
    let rels = com._rels[key] = com._rels[key] || []

    children.forEach(child => {
      rels.push(child)

      childLined && childLined.call(com, child)

      let { linked, unlinked } = child._relations[key] || {}
      linked && linked.call(child, com)

      // 组件销毁
      let leave = com.$leave
      child.$leave = function () {
        $leave(rels).call(this)
        leave.call(this)

        childUnlinked.call(com, this)
        unlinked && unlinked.call(this, com)
      }
    })
  })
}
