module.exports = class OutputGraph {
  constructor () {
    this.nodes = new Map()
  }

  /**
   * 添加依赖
   * @param {*} file
   * @param {*} dep { codePath: , distPath: }
   */
  addDep (file, dep) {
    let node = this.nodes.get(file)

    if (!node) {
      node = {
        deps: []
      }
      this.nodes.set(file, node)
    }

    node.deps.push(dep)
  }
}
