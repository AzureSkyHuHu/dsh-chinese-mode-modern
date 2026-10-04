# 移植说明

这份文档记录两件事：旧版 `dsh-chinese-mode` 0.2.1 为什么在当前的 DSH 上不工作，以及本插件是怎么适配的。面向想改代码或想核对的人，普通使用者不需要读。

## 旧版 0.2.1 的四个失效点

全都在 0.1.7 的 settings 重写里。

### 1. 宿主侧：`settings.register()` 已被删除

旧版 `lib/index.js` 的 `apply` 开头：

```js
const settings = ctx.get('settings')
if (typeof settings.register !== 'function') {
  console.warn('[dsh-chinese-mode] settings 服务不可用')
  return   // ← 整个插件在这里退出，systemPrompt 注入也没注册
}
```

0.1.7 把 `SettingsProvider`（有 `register(ns, schema, {applies})`）换成了 `SettingsForms`。现在 `settings` 服务上的方法只有：

```
configure(presentation, owner?)   get writable   get documentPath
prepareDocument()   describe(options?)   update(ns, patch, expectedRevision?)
replace(ns, section, expectedRevision?)  mutate(ns, ops, expectedRevision?)
```

**没有 `register`**。所以旧版必然走到 `return`，插件静默失效——不报错，但什么都不做。

### 2. 客户端：`settingsScope` 服务已被删除

旧版 `lib/client.js` 声明：

```js
const inject = ["slots", "settingsScope", "connection", "remote"]
```

Cordis 的 inject 是硬门禁：声明了不存在的服务，`apply` 就永不执行。`settingsScope` 在当前 DSH 全仓 0 命中，所以**「中文」按钮根本不显示**。

### 3. 客户端：`@deepseek-ai/dsh-client-runtime` 这个包不存在

旧版 `package.json` 的 `dsh.client.inject` 里声明了它。当前 DSH 没有这个包，客户端模块图的边指向了不存在的节点。

### 4. 兼容性预检失败

旧版 `peerDependencies` 写了 `"@deepseek-ai/dsh-client-ui-slots": "^0.1.0-rc.6"`。

DSH 的兼容性预检只检查 `peerDependencies` 里以 `@deepseek-ai/dsh` 或 `@deepseek-ai/dsh-` 开头的条目，用 `semver.satisfies(runtimeVersion, range, { includePrerelease: true })` 判定。runtime 是 `0.2.1-alpha.1`，而 `^0.1.0-rc.6` 在 `includePrerelease` 下仍然不满足（上界在 `0.2.0` 之前），安装被 `incompatible-version` 拦下。

旧版还依赖了 `@deepseek-ai/dsh-agent-presets`（**复数**）——这个包不存在，只有单数的 `@deepseek-ai/dsh-agent-preset`，而且它也没有旧版调用的 `resolveSessionPreset`。

## 本插件的对应做法

### 宿主侧 `lib/index.js`

- **删掉 `settings.register()`**，改为导出 schemastery 的 `Config`。这是现在的官方配置通道：schema 由插件导出，值从 profile 条目持久化。
- **每个字段标记 `.volatile()`**。这一条是必需的：设置页只展示和写入「最近的可变祖先带 volatile 标记」的字段，未标记的字段既看不见也写不进。loader 为已标记字段注入**冻结的 `{ get() }` 引用**——引用身份稳定、值会变，所以每次读取都重新 `get()`，写入原地生效、不重挂插件。
- **不再依赖 `@deepseek-ai/dsh-agent-presets`**。preset 名直接读 `context.agent?.session?.header?.agentPreset`（`SessionHeader.agentPreset` 是持久化字段）。
- **schemastery 改为运行时多源解析**，见下节。
- **`inject` 收窄为 `['systemPrompt']`**，不再声明已删除的 `settings` 服务。
- 放弃旧版的 `llm.registerConfigurableProviders(...)` 调用（该 API 在当前 DSH 未验证存在）。

### 客户端 `lib/client.js`

- **`inject` 改为 `['slots', 'configForms']`**，删除 `settingsScope`、`connection`、`remote`。
- **绑定对象从 `ctx.settingsScope.bind({ namespace })` 改为 `ctx.configForms.get(entryId)`**。`ConfigForm` 暴露的 `getSnapshot / subscribe / set / unset / mutate` 与旧版用的 scope 接口形状一致，快照字段也完全一致（`status / value / base / user / revision / writable / mode`），所以组件层几乎不用改。
- 两个原有槽的**槽名、id、order、label 全部保持不变**——`conversation.input.left` 和 `settings.section` 在当前 DSH 里都还在、没改名。
- **新增第三个槽 `conversation.input.overlay`** 承载弹出面板。契约：`kind: "list"`、`scope: "session"`，已有 `slash-menu` / `command-popup` / `feedback-dialog` 三个官方占用者。注册字段只有 `id`（必填，用新的 id 会并列在官方条目旁）、`order`、`label`。
- **面板定位照抄同座位的官方 `slash-menu`**。那个槽的宿主锚点是 composer 卡片顶边上一个高度为 0 的定位盒（`.overlayAnchor{height:0;position:absolute;inset:0 0 auto}`），所以面板用 `position:absolute; bottom:calc(100% + 4px); left:0; z-index:100` 浮到输入框上方。
- **面板底色用 `var(--dsw-alias-bg-base)`，不用 `var(--dsw-specific-menu)`**。后者只有 94% 不透明度，官方规定它必须配 `backdrop-filter: var(--dsw-menu-backdrop-filter)` 做毛玻璃才成立；面板直接压在下方内容上，少了那层模糊会把底下的文字透出来。
- **按钮与面板分处两个槽位，无法互传 props**，用一个模块级小 store 共享开合状态与 DOM 引用（`useSyncExternalStore` 订阅）。
- **点击外部 / `Esc` 关闭**的监听挂在 `document` 的**捕获阶段**（只读不阻断事件），注销交给 `ctx.effect`。判断「点在面板内」时同时检查面板根节点与按钮节点，所以点按钮本身由 `toggle` 处理、不会被外部点击逻辑抢先关掉。

### 关于 schemastery 的解析

本插件**没有**写 `import z from '@deepseek-ai/schemastery'`。

原因是本地目录安装走 pnpm 的 `link:` / `file:` 协议，插件在 profile 的 `node_modules` 里是符号链接，而 Node 按 realpath 向上查找 `node_modules`——会从本仓库目录开始找，找不到 schemastery，直接 `ERR_MODULE_NOT_FOUND` 启动崩溃。

所以改为 `resolveSchemastery()` 运行时多源兜底，依次尝试：

1. `import.meta.url`（插件自身位置，真实目录安装时命中）
2. `$DSH_PROFILE_DIR/package.json`（profile 里有 `@deepseek-ai/schemastery`）
3. `process.argv[1]`（dsh 的 bin 入口，向上能找到 DSH 自带的 `node_modules`）

任意一个命中即可。**三个来源全失败时导出 `Config = undefined` 而不是调用 `z.object()`**——否则模块加载期就抛 `TypeError`，会把整个插件连 `systemPrompt` 注入一起打崩。降级后只是设置页看不到本条目，语言注入照常工作。

### `package.json` 的版本声明

`@deepseek-ai/dsh-*` 全部从 `peerDependencies` 移出，宿主要求改由顶层 `engines.dsh` 声明：

```json
"engines": { "dsh": ">=0.2.1-alpha.1" },
"peerDependencies": {
  "@deepseek-ai/schemastery": ">=3.18.5-alpha.1",
  "react": ">=18.2.0"
}
```

目的是**以后升级 DSH 不用再改这个插件的版本号**。三个判定点各读各的字段：

| 判定点 | 读什么 | semver 口径 | 结果 |
| --- | --- | --- | --- |
| DSH 安装预检 `evaluatePluginCompatibility` | `peerDependencies` 里 `@deepseek-ai/dsh` 开头的条目 | `includePrerelease: true` | 清单里已无此类条目 → 永远放行 |
| 插件市场卡片与「仅显示兼容」筛选 | `engines.dsh`（或 `dsh.engines.dsh`） | `includePrerelease: true` | `>=0.2.1-alpha.1` 对任意未来版本（含预发布）都判 `compatible` |
| npm / pnpm 解析 peer | `peerDependencies` | 默认（**不带** `includePrerelease`） | 已无 `@deepseek-ai/dsh-*` → 不会 `ERESOLVE` |

**为什么不是「写一个更宽松的 peer 范围」**：node-semver 在默认口径下，只有「范围内存在与目标版本 `major.minor.patch` 完全相同、且自身带预发布标签的比较符」时才放行预发布。所以 `^0.1.0-rc.6` 完全匹配不到 `0.2.1-alpha.1`；而写得很宽的 `>=0.2.1-alpha.1` 也匹配不到未来的 `0.3.0-rc.1`——**不存在能覆盖任意未来预发布的 peer range**。`engines` 字段本身不参与依赖解析，只被市场读取，把下界放在那里既安全又不会随升级失效。

**不再声明 `dsh.compatibility`**：实测该字段**没有任何消费者**（DSH 核心各包 grep `.compatibility` 零命中，市场只读 `engines.dsh` / `dsh.engines.dsh`），写死版本号只会误导后续维护者。

## 已验证的内容

安装到 `web` profile 后实测（运行时 `0.2.1-alpha.1`）：

| 项 | 结果 | 依据 |
| --- | --- | --- |
| 插件激活 | ✅ | 加载器条目 `include:dsh-chinese-mode-modern` → `fiberPhase: "active"` |
| 配置 schema 注册 | ✅ | 宿主描述符 `status: "schema"`，10 个字段全部带 `x-cordis.volatile: true` |
| 「中文」按钮注册 | ✅ | `conversation.input.left` 占用者 order 100、`active: true` |
| 弹出面板注册 | ✅ | `conversation.input.overlay` 占用者 order 50，与官方 `slash-menu` / `command-popup` / `feedback-dialog` 并存 |
| 设置页注册 | ✅ | `settings.section` 占用者 order 900、`active: true` |
| systemPrompt 注入 | ✅ | 挂载真实 Cordis + 真实 `@deepseek-ai/dsh-system-prompt`，`assemble()` 输出中本 section 位于 `harness:identity`(-1000) 与 `deployment:persona-prefix`(0) 之间 |
| 开关保存 | ✅ | 写入链路 `configForms.set()` → `remote.settings` → 宿主 `SettingsForms.mutate` → 落盘 profile 的 `cordis.patch.yml`；`--dump-config` 重组结果一致 |
| 行为断言 | ✅ | 宿主侧 33 项 + 客户端 74 项 + 真实服务集成 3 项 + 版本声明策略 29 项，共 139 项 |
| 版本声明策略 | ✅ | 直接调用真实的 `evaluatePluginCompatibility`（DSH 安装预检）与 `deriveHostCompatibility`（插件市场判定），在 `0.2.1-alpha.1` `0.2.1` `0.2.2` `0.2.5-alpha.3` `0.3.0` `0.3.0-rc.1` `0.10.0-beta.2` `1.0.0` `2.1.0-alpha.1` 九个版本下全部通过 |

验证时的实际环境：

| 组件 | 版本 |
| --- | --- |
| DSH runtime | `0.2.1-alpha.1` |
| `@deepseek-ai/schemastery` | `3.18.5-alpha.1` |
| `@deepseek-ai/dsh-client-ui-slots` | `0.2.1-alpha.1` |
| `@deepseek-ai/dsh-client-ui-settings` | `0.2.1-alpha.1` |
| `@deepseek-ai/dsh-client-ui-conversation` | `0.2.1-alpha.1` |
| React（浏览器模块表提供） | `^18.2.0` |

升级 DSH 后如果本插件失效，按这个顺序查：

1. `peerDependencies` —— 只有 schemastery 和 react 两项，都不参与 DSH 版本判定，一般不会出问题。
2. schemastery 的 `.volatile()` 能力 —— 字段标记失效会导致设置页看不到、写不进。
3. `ctx.configForms` 服务名与 `conversation.input.left` / `conversation.input.overlay` / `settings.section` 三个槽名。
