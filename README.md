# namespace-style-link

> 在 Vue 单文件组件里，从 `<template>` 中的 BEM 调用直接跳到 `<style>` 里对应的 `@include` 混入。

## 1 是什么

Vue 项目里常见这种拆成两处的 BEM 写法：脚本侧声明命名空间，样式侧用 SCSS 混入生成类名。

```vue
<script setup lang="ts">
const bem = useBEM('card')        // 或 useNamespace('card')
</script>

<template>
  <div :class="bem.b('wrap')" />  <!-- b / e / m -->
</template>

<style lang="scss">
@include block('wrap') { }        <!-- ← 改类名时你要找的就是这里 -->
</style>
```

改一个类名，得在两处之间来回搜。这个扩展把这段跳转补上：

- **定义跳转**：光标放进 `bem.e('wrap')` 的字符串里，按 `F12` / `Ctrl+Click` 直接跳到 `<style>` 中匹配的 `@include` 行。
- **悬停预览**：鼠标停在同一处，浮层里直接给出命中的样式片段，并附一个 `go to style >` 命令链接，不用离开当前行。
- **零命令**：打开 `.vue` 文件即生效（`activationEvents: onLanguage:vue`），不需要记快捷键或手动触发。

## 2 怎么用

前置条件（缺一条就不生效）：

1. 文件是 `.vue`；
2. 脚本里有一行 `const xx = useBEM('ns')` 或 `const xx = useNamespace('ns')` —— 扩展靠它知道命名空间和变量名；带类型标注的写法（`const bem: BEM = useBEM('ns')`）同样识别；
3. 样式用 SCSS 混入写法：`useBEM` 对应 `@include block/element/modifier(...)`，`useNamespace` 对应 `@include b/e/m(...)`。

安装：

```bash
# 方式一：本地 vsix（当前版本 0.0.4）
code --install-extension namespace-style-link-0.0.4.vsix
```

```bash
# 方式二：源码调试
pnpm i
pnpm compile   # 类型检查 + lint + esbuild 打包
# 在 VS Code 中按 F5 启动扩展宿主窗口，打开任意 .vue 文件
```

## 3 实现要点

| 环节 | 做法 |
| --- | --- |
| 命名空间识别 | 正则抓 `变量名 = useBEM('ns')` / `useNamespace('ns')`，记录变量名、模块类型与根命名空间 |
| 文档级缓存 | 以 `document.uri` 为键缓存 BEM 声明；激活时扫描已打开文档，并在 `onDidOpenTextDocument` 时增量更新，避免每次悬停都全文跑正则 |
| 取词 | 不依赖 `wordRange`，而是从光标向两侧找最近的成对引号 —— BEM 参数常出现在 `:class="bem.e('wrap')"` 这种嵌套引号里，用单词边界会取错 |
| 调用形态还原 | 支持 `b` / `e` / `m`，以及复合调用 `be(...)` / `bm(...)` / `bem(...)` 的多参数形式，还原光标处究竟是 block、element 还是 modifier |
| 跳转与预览 | 同时注册 `DefinitionProvider` 与 `HoverProvider`；悬停内容用 `command:revealLine` 生成可点击链接，并把命中的混入块渲染成 css 代码块 |

命名空间识别用的正则：

```ts
/(\w+)\s*(=|:)\s*(useBEM|useNamespace)\s*\(\s*['"]([^'"]+)['"]\s*\)/gi
```

`(=|:)` 那一段是为了同时吃下 `const bem = useBEM('ns')` 与 `const bem: BEM = useBEM('ns')` 两种声明。

样式匹配的正则（`func` 由上面还原出的 block/element/modifier 决定）：

```ts
new RegExp(`@include\\s+${func}\\(\\s*(?:['"]?)${className}(?:['"]?)\\s*\\)`, "g")
```

设计取舍：**不做 AST 解析**，只用正则 + 引号定位。理由是它运行在每一次悬停里，AST 解析的启动成本对单文件场景不划算；代价是只认这一种混入写法（见下）。

已知限制：

- 只匹配**单行** `@include`，跨行书写识别不到；
- 同一类名有多处混入时，跳转只到第一处（悬停会列出全部命中）；
- 缓存随文档打开建立，未打开过的文件不做全量索引；
- 目前只覆盖 `.vue` + SCSS 混入，不支持 CSS Modules、Tailwind 等其它类名生成方式。

## 4 开发

```bash
pnpm i
pnpm check-types   # tsc --noEmit
pnpm lint          # eslint src
pnpm compile       # 以上两项 + esbuild 打包到 dist
pnpm test          # @vscode/test-cli 跑集成测试
pnpm package       # 生产打包
```

## License

MIT
