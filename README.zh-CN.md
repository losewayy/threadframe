# Intelligence UI

[English](README.md)

用声明式 JSON 在 AI 对话里呈现可交互的小界面。项目提供流式渲染器和 MCP Apps 服务：兼容的宿主加载单文件 HTML，参数和公式在本地计算，纯文本客户端收到 Markdown 回退内容。

![真实录制的上线向导：指标、图表、步骤流和命令预览联动](docs/demo.gif)

## 定位与同类项目

这是独立实现，不修改聊天客户端，也不复刻闭源 ChatGPT UI 协议。模型只提交数据、公式和有限嵌套的组件树，运行时负责 DOM、SVG、样式和交互，不需要 React，也不执行模型生成的前端代码。

| 项目 | 接入方式 | 本项目的区别 |
| --- | --- | --- |
| [OpenUI](https://www.openui.com/docs) | 在应用前端注册组件库并渲染 OpenUI Lang，官方文档包含 [React 渲染器](https://www.openui.com/docs/openui-lang/renderer)。 | 采用固定 UiSpec 组件目录，以 MCP Apps 单文件资源交付，不需要 OpenUI Lang 渲染器。 |
| [A2UI](https://developers.googleblog.com/en/introducing-a2ui-an-open-project-for-agent-driven-interfaces/) | 智能体发送声明式界面描述，由客户端的可信组件目录渲染。 | 提供自己的有限 Schema、本地公式和 Markdown 回退，不实现 A2UI 协议。 |
| Intelligence UI | MCP 工具同时返回 JSON 和 Markdown，由兼容宿主内嵌资源。 | 适合紧凑的计算器、方案对比、规划面板和配置预览，也可独立导出 HTML。 |

这些区别描述接入方式，不代表性能排名或协议可以互换。系统架构图见英文主文档；调用从 MCP 服务经过宿主、薄渲染入口、注册表进入独立积木，积木依赖 DOM/状态基座和纯计算模块，禁止反向依赖及积木横向互引。

## 组件目录

完整目录为 **12 个叶子积木＋3 个布局容器，共 15 种**。

| 类别 | 积木 | 用途 |
| --- | --- | --- |
| 决策与输入 | `choices`、`controls` | 决策卡片、滑块、开关和分段选择，定义共享变量。 |
| 指标与可视化 | `stats`、`chart`、`plot`、`svg` | KPI、分解条、折线/柱状/圆环图和安全矢量图解。 |
| 对比与进度 | `compare`、`checklist`、`timeline`、`architecture` | 对比矩阵、交互清单、可选步骤流和分层架构。 |
| 说明与配置 | `callout`、`code` | 语义提示及可插值、可复制的配置预览。 |
| 布局 | `grid`、`tabs`、`accordion` | 响应式组合、持久页签选择和折叠状态。 |

嵌套深度固定：grid 只放叶子积木；tabs 和 accordion 的每项可放叶子或一层 grid，不能继续嵌套 tabs/accordion。隐藏的面板保持挂载，因此不同面板里的控件、图表和指标可以持续联动。

## 从源码运行

需要 Node.js 22 或更新版本、pnpm 10.15.1。将仓库地址替换为实际地址：

```sh
git clone <repository-url> intelligence-ui
cd intelligence-ui
pnpm install --frozen-lockfile
pnpm run check
pnpm dev
```

Playground 位于 `http://127.0.0.1:3001/`，Streamable HTTP MCP 位于 `http://127.0.0.1:3001/mcp`。可以在启动前设置 `PORT` 环境变量。`pnpm dev` 运行源码服务端，但仍需要已构建的 UI；修改 UI 后重新构建并刷新，修改预设或服务端后重新启动服务。

```sh
pnpm run typecheck
pnpm run build
pnpm test
```

`pnpm run check` 包括类型检查、服务端编译、Vite 单文件打包和测试。CI 在 Ubuntu、Node 22 上执行冻结依赖安装、构建、测试和导出冒烟检查。

## Playground 调试

七个场景分别是 `gpu-vram-tuner`、`runtime-compare`、`deploy-checklist`、`mcp-architecture`、`composable-workbench`、`svg-visual-lab`、`agent-launch-kit`。

- 重放半截输入，观察合法积木逐步挂载。
- 切换宿主明暗主题，以及 Wide/Compact 预览宽度。
- 展开 Custom JSON Spec，粘贴 JSON 后全量运行或按块模拟流式输入；服务端用同一份 Zod Schema 返回校验字段路径。
- 查看可折叠的桥接日志。`ui/message` 会收到 JSON-RPC 应答，并在界面下方短暂显示消息预览。
- 本地预览 iframe 获得写剪贴板权限。实际宿主可能拒绝该权限，此时界面会明确显示失败。

预设是可编辑示例。容量目标和显存估计都不是实测硬件性能数据；上线命令含模型占位符，需要自行审阅，项目不会执行它。

## MCP 接入与独立导出

服务暴露 `render_intelligence_ui`、`inspect_preset_ui` 和 `ui://intelligence-ui/view.html` 资源。工具同时返回 `structuredContent` 和 Markdown；是否显示交互界面取决于客户端是否支持 MCP Apps，纯文本客户端仍能读取回退结果。

Claude Desktop 或其他 stdio 客户端先构建，再配置：

```json
{
  "mcpServers": {
    "intelligence-ui": {
      "command": "node",
      "args": ["<repository>/dist/main.js", "--stdio"]
    }
  }
}
```

将 `<repository>` 替换为客户端可访问的检出目录，修改配置后重启客户端。stdio 配置不要启动 HTTP 入口。HTTP 客户端可在运行 `pnpm dev` 或 `node dist/main.js` 后，将 Streamable HTTP 地址设为 `http://127.0.0.1:3001/mcp`。服务只绑定本机回环地址，公网部署、身份验证和 TLS 不在当前服务的职责内。

```sh
node dist/main.js --stdio
node dist/main.js --export agent-launch-kit out/launch-kit.html
node dist/main.js --export docs/example.json out/custom.html
```

导出文件可以直接打开，脚本和样式全部内联。离线页底部动作会复制文本，代码卡也有独立复制按钮；浏览器的安全上下文和权限仍然适用。页面里的状态不会写回源 JSON。

## 变量、公式与安全边界

控件 ID 定义共享变量。公式支持算术、比较、布尔值、三元表达式，以及 `min`、`max`、`abs`、`floor`、`ceil`、`round`、`clamp`、`if`。`+` 任一操作数为字符串时拼接，否则保持数值加法；不支持 JavaScript 求值、属性访问或任意函数调用。

[可运行示例](docs/example.json) 组合了 controls、stats 和 code。代码模板的 `{{var}}` 替换为当前变量，未知变量保留占位符。SVG 数值属性支持对应的 `*Formula`，`textFormula` 支持 `round(vram, 1) + ' GB'` 等字符串表达式。非法或未完成公式使用安全回退。代码插值只是文本替换，不做 shell 转义，运行前必须自行检查。

plot 支持 line、bar、donut，数据点含 label 及 value/formula，可设置 max/maxFormula、precision、坐标轴标签及圆环中心公式。矢量画板要求正数宽高，只接受 rect、circle、line、path、text、polyline、polygon，颜色只能使用语义 token。

运行时通过原生 DOM/SVG API 和 `textContent` 构造内容。SVG 的危险标签、事件属性、外部链接及任意颜色 URL 会被拒绝；工具 Schema 有限展开，不含递归 `$ref` 图。合法的部分矢量、指标或步骤条目可以先显示，未完成部分继续等待。

单文件 UI 不依赖 CDN、外部图片、在线字体或动态代码执行。宿主的沙盒和 CSP 决定最终能力。首次及后续宿主主题、样式变量与本机字体声明会同步；网络字体声明被忽略，缺少变量时使用默认 Linear 风格。滑块和开关就地更新绑定，send_message 使用宿主桥接，copy_state 绕过宿主直接复制。复制失败不会伪报成功。

项目是固定目录的小组件运行时，不是任意 HTML 浏览器、命令执行器、通用仪表盘框架或 OpenUI/A2UI 协议兼容层。

## 打包与贡献

```sh
pnpm pack --pack-destination out
```

prepack 会先构建并测试。包清单只包含编译后的服务端、内联 UI、原始 Playground HTML、文档与许可证。Playground 由服务端从磁盘读取，因此必须随包保留，它不是 Vite 入口。

新增积木时补齐有限 Schema、独立渲染器、Markdown 回退、注册表和架构白名单。入口不超过 200 行，每个积木不超过 220 行。测试只覆盖真实行为和关键失败边界，不锁死示例数值、Markdown 标点，也不测试测试辅助函数。具体规则见 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)。第三方依赖保留各自许可证。
