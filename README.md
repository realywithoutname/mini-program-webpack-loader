## 小程序打包工具

- webpack 4.0

### 插件
- MiniPlugin

### 合并规则
1. 以数组中第一个元素为主入口
2. 结果的 app.json 中 pages 内容为多个入口合并的结果（不去重）
3. 结果的 app.json 中 subPackages 内容为多个入口合并的结果（不去重）
4. 结果的 app.json 中 plugins 内容为多个入口合并的结果
5. 结果的 app.json 中其他属性以入口中顺序取，如果取到值就不会取后面入口内容
6. 结果的 app.js 内容为主入口对应 js 文件，如果不存在，将打包失败
7. 结果的 app.wxss 内容为多个入口对应 wxss 文件内容，可以没有相应 wxss 文件

### Loader
- mini-loader 

  - 支持 wxss，wxml，wxs 小程序格式文件的转换
  - 支持 wxss，wxml，wxs 文件中以项目根目录为绝对路径根目录查找依赖
  - 支持 wxss，wxml，wxs 中使用 webpack resolve
  - 为了减小包体积，使用 css 预处理的脚本必须以 `.scss` 结尾，如果同时需要引入其他 wxss 文件，最好在 wxss 文件内 `import` wxss 和 scss(.scss 文件不会支持 webpack resolve)

  如：
  ~~~ css
    /* a.wxss */
    @import "a/b.wxss";
    @import "a/c.scss"; /* 这里 a/c.scss 将被转换为 a/c.wxss */

    /* a/c.scss 使用 sass-loader 处理后需要使用 file-loader 处理文件名为 [name].wxss */
    @import "./variables.scss"
    .class {
      border: $border solid #000;
    }
  ~~~


**使用绝对路径将不能使用 sass-loader 这样的其他需要解析依赖路径的 loader**