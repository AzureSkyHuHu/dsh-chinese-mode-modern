# dsh-chinese-mode-modern

DeepSeek Harness 的中文模式插件。输入框旁多一个「中文」按钮，点开是语言面板，可以分别切换**回复**、**思考**、**工具说明**的语言。

思路参考社区项目 [dawnliming/dsh-chinese-mode](https://github.com/dawnliming/dsh-chinese-mode)。那个版本停在 DSH 内核重写之前，对当前 DSH 已经完全不工作；本插件照着现在的 API 重新实现，并补了一个输入框语言面板。

**安装后默认开启，开箱即用。**

## 功能

- **输入框旁的「中文」按钮** —— 点开弹出面板：总开关，加上回复 / 思考 / 工具说明三个开关，就地调整。点面板外或按 `Esc` 关闭。
- **设置页** —— 设置 → 中文模式，同样的选项，另外可以改三个开关对应的注入原文。
- **锚定兼容** —— preset 名命中关键词（默认 `liangshen`、`梁神`、`anchored`、`锚定`）时强制英文思考。
- **持久化** —— 配置写进 profile 的 `cordis.patch.yml`，重启后仍在。

## 安装

在插件管理器里装 `dsh-chinese-mode-modern`，或让 agent 调用宿主工具：

```
plugin_manager  action: install_bundle
                target: dsh-chinese-mode-modern
```

命令行也可以，但要注意 `dsh plugin add` 只是 pnpm 透传，**只装包不启用**：

```bash
dsh plugin --profile web add dsh-chinese-mode-modern
```

装完**重启 DSH**。

## 卸载

```
plugin_manager  action: remove_bundle
                target: dsh-chinese-mode-modern
```

或 `dsh plugin --profile web remove dsh-chinese-mode-modern`。

## 兼容性

插件只声明 `engines.dsh: ">=0.2.1-alpha.1"`，**不锁 DSH 版本**——`@deepseek-ai/dsh-*` 一个都没进 `peerDependencies`，所以以后升级 DSH 不用改这个插件。

为什么这么写、旧版 0.2.1 具体哪里失效，见 [docs/porting-notes.md](./docs/porting-notes.md)。

## 许可

MIT，见 [LICENSE](./LICENSE)。
