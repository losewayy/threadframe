# ThreadFrame

[![CI](https://github.com/losewayy/threadframe/actions/workflows/ci.yml/badge.svg)](https://github.com/losewayy/threadframe/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

[English](README.md)

**ThreadFrame** 是一个开源的流式对话界面运行时和 MCP Apps（`ui://`，SEP-1865）服务端，用于在 AI 对话气泡里直接渲染可交互的小卡片。模型只返回简洁的声明式 JSON，运行时负责边流式到达边渲染积木、在本地无 `eval` 安全计算公式、绘制响应式矢量图形，并按连接的宿主客户端自动适配。

![ThreadFrame 交互式上线向导演示](docs/demo.gif)

## 快速开始

需要 **Node.js 22+** 和 **pnpm 10.15.1**。

### 1. 本地打开调试台（30 秒体验）

```sh
git clone https://github.com/losewayy/threadframe.git
cd threadframe
pnpm install --frozen-lockfile
pnpm start
```

打开 `http://127.0.0.1:3001/` 即可体验内置的 7 套场景、重放流式逐块加载、切换深浅色主题、切换宽/窄对话宽度（760px / 420px），以及粘贴自定义 JSON 直接校验试跑。

### 2. 接入 Codex

```sh
codex mcp add threadframe -- node /path/to/threadframe/dist/main.js --stdio
```

### 3. 接入 Claude Desktop 或任意 stdio MCP 客户端

```json
{
  "mcpServers": {
    "threadframe": {
      "command": "node",
      "args": ["/path/to/threadframe/dist/main.js", "--stdio"]
    }
  }
}
```

> 运行 `pnpm start` 或 `pnpm dev` 时，也会在 `http://127.0.0.1:3001/mcp` 提供本机回环的 Streamable HTTP MCP 接口。

### 4. 导出独立 HTML 或内嵌卡片

```sh
node dist/main.js --export agent-launch-kit out/launch-kit.html
node dist/main.js --export docs/example.json out/custom.html --embed
cat docs/example.json | node dist/main.js --export - out/from-stdin.html --embed
```

所有脚本和样式均打包进同一个零外链单文件 HTML（`dist/mcp-app.html`），双击即可离线交互。

## 一套 MCP 服务，按客户端能力自动适配

每次建立连接握手时，服务端都会读取客户端声明的 UI 能力（`getUiCapability`）与客户端身份（`clientInfo`），自动走对应通道：

- **支持 MCP Apps 的客户端**（如 Codex 等）：自动使用 `ui://threadframe/view.html` 和 `structuredContent`，在聊天区原生弹出可交互界面。
- **HTML 内嵌型客户端**（如 Antigravity，或在非 UI 宿主下设置环境变量 `THREADFRAME_HOST=antigravity`）：在本地 `--stdio` 模式下可选传入 `embedPath`，直接将透明紧凑的 `--embed` 单文件写到指定产物目录，不浪费模型上下文。
- **纯终端 / 文本客户端**：自动输出结构清楚的 Markdown 表格、清单和实时算好的代码块。

## 积木目录（17 种）

包含 **14 种叶子积木** 和 **3 种布局容器**：

| 类别 | 积木 | 用途 |
| --- | --- | --- |
| 决策与输入 | `choices`、`controls` | 选择卡片（修改变量或触发提示词）；滑块、开关与分段选择器。 |
| 指标与可视化 | `stats`、`chart`、`plot`、`svg` | KPI 指标卡；进度条/堆叠条；折线/竖柱/圆环矢量图，以及支持定义域采样和断点容错的参数化函数曲线；可联动的安全 SVG 画板。 |
| 对比与流程 | `compare`、`checklist`、`timeline`、`architecture` | 方案对比矩阵、带进度清单、可选步骤时间线、分层架构点击视图。 |
| 拓扑与数据 | `graph`、`table` | 自动分层排版的节点连线图（无需手写坐标），以及可排序、关键词/状态筛选的工程数据表。 |
| 提示与代码 | `callout`、`code` | 语义提示条，以及支持 `{{var}}` 变量实时替换与一键复制的代码/命令预览卡。 |
| 布局容器 | `grid`、`tabs`、`accordion` | 响应式分栏网格、标签页与折叠抽屉，隐藏面板中的控件和图表同样保持实时联动。 |

容器采用有界扁平组合：`grid` 内放置叶子积木，`tabs` 和 `accordion` 每项可放叶子积木或一层 `grid`，Schema 不含递归 `$ref`。

三个快捷工具 `present_calculator`、`present_decision`、`present_diagram` 接收扁平业务入参，由纯函数编译器展开成标准 UiSpec，后续的校验、渲染、`--embed` 导出和 Markdown 降级完全复用同一条链路。

7 个内置展示预设（`inspect_preset_frame`）：`gpu-vram-tuner`、`runtime-compare`、`deploy-checklist`、`mcp-architecture`、`composable-workbench`、`svg-visual-lab`、`agent-launch-kit`。

## 变量、公式与安全边界

- **零 `eval` / `new Function`**：所有公式通过自研词法与递归下降解析器求值，支持四则运算、比较、三元表达式、`min`/`max`/`abs`/`floor`/`ceil`/`round`/`clamp`/`if`，当 `+` 任意一侧为字符串时执行字符串拼接；可在严格 CSP 沙盒下运行。
- **原生 DOM 与 SVG 白名单**：所有节点均通过 `createElement` / `createElementNS` 与 `textContent` 构建；`svg` 积木仅允许 `rect`、`circle`、`line`、`path`、`text`、`polyline`、`polygon` 和语义配色 token，Schema 直接拒绝脚本、事件属性和外链。
- **受控写盘与复制兜底**：`embedPath` 和状态快照 `statePath` 仅允许本地 `--stdio` 模式写入 `.html` / `.json` 文件（HTTP 模式直接禁止），并拦截设备名、ADS、UNC、尾点路径和符号链接逃逸；沙盒内嵌页跳过无效宿主握手，按钮自动回退为安全剪贴板复制（`navigator.clipboard` 不可用时自动启用 `<textarea>` 兼容复制）。
- **可选的快照闭环**：本地 `--stdio` 的快捷工具可以显式传入 `statePath`，点击“Apply & remember”后保存精简状态快照，下一轮用 `read_threadframe_state` 只读取回；不传路径时完全不触碰磁盘。
- **示例参考**：MCP 工具内置最小联动示例，同时暴露 `threadframe://examples/svg` 资源和可运行的 [docs/example.json](docs/example.json)。

## 开发与校验

```sh
pnpm run typecheck   # TypeScript 类型检查
pnpm run build       # 编译服务端并构建单文件 dist/mcp-app.html
pnpm test            # 架构 DAG 守卫、Schema、公式、回退与真实 MCP 会话测试
pnpm run check       # 一键运行完整构建与测试
```

架构约束与测试规范见 [AGENTS.md](AGENTS.md)：源码通过 AST 检查保证无循环依赖与单向分层，`src/runtime/renderer.ts` 不超过 200 行，每个积木文件不超过 220 行。

## 许可证

[MIT](LICENSE)
