/**
 * dsh-chinese-mode-modern 宿主半侧
 *
 * 全局中文模式：通过官方 systemPrompt.section() 把语言要求注册为 system prompt
 * 的一个 section，对任意 preset 生效（complete persona 除外，DSH 机制限制）。
 *
 * 与原版 dsh-chinese-mode 0.2.1 的适配差异（目标运行时 DSH 0.2.1-alpha.1）：
 * - 不再调用已删除的 settings.register()，改为导出 schemastery Config；
 *   配置值由 profile 条目的 config 字段承载，并持久化到 profile 的 cordis.patch.yml。
 * - 所有字段标记 .volatile()：设置页可原地改写、不重挂插件。loader 传入的是
 *   冻结的 { get() } 引用，引用身份稳定而值会变，因此每次读取都必须重新取值。
 * - 不再依赖 @deepseek-ai/dsh-agent-presets（该包在当前 DSH 中不存在），
 *   preset 名直接读取官方 SessionHeader.agentPreset。
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'

/**
 * 解析 schemastery。
 *
 * 不写成顶层静态 import 是有原因的：本地目录安装走 pnpm 的 link:/file: 协议，
 * 插件在 node_modules 里是符号链接，Node 按 realpath 向上查找时找不到
 * @deepseek-ai/schemastery。因此按 插件自身 → profile → dsh 可执行文件 的顺序多源兜底。
 * @returns schemastery 的 Schema 构造器；全部来源失败时返回 undefined。
 */
function resolveSchemastery() {
  const sources = [import.meta.url]
  const profileDir = process.env.DSH_PROFILE_DIR
  if (typeof profileDir === 'string' && profileDir.trim() !== '') {
    sources.push(join(profileDir.trim(), 'package.json'))
  }
  // dsh 的 bin 入口：从其所在目录向上能找到 dsh 安装自带的 node_modules。
  if (typeof process.argv[1] === 'string' && process.argv[1] !== '') sources.push(process.argv[1])
  for (const base of sources) {
    try {
      const mod = createRequire(base)('@deepseek-ai/schemastery')
      const candidate = mod?.default ?? mod
      if (typeof candidate === 'function' && typeof candidate.object === 'function') return candidate
    } catch {
      // 尝试下一个解析来源
    }
  }
  return undefined
}

const z = resolveSchemastery()

export const name = 'dsh-chinese-mode-modern'

/** 只需要 systemPrompt 服务；配置值直接来自 loader 注入的 Config。 */
export const inject = ['systemPrompt']

/** system prompt 分节名。 */
const SECTION_NAME = 'dsh-chinese-mode:language'
/** 负数 order：排在 deployment persona（0）之前、harness identity（-1000）之后。 */
const SECTION_ORDER = -50

/** 中文默认文案。 */
const DEFAULT_TEXT_REPLY = '回复始终使用简体中文。'
const DEFAULT_TEXT_THINKING = '思考过程使用简体中文。'
const DEFAULT_TEXT_TOOLS = '工具调用说明、进度更新、界面文案等可见文本使用中文；代码、命令、路径、配置键、工具/API 名称保留原文。'
/** 英文默认文案：区域开关关闭时使用的正向指令。 */
const DEFAULT_TEXT_REPLY_EN = '回复使用英文（English）。'
const DEFAULT_TEXT_THINKING_EN = '思考过程使用英文（English reasoning）。'
const DEFAULT_TEXT_TOOLS_EN = '工具调用说明、进度更新、界面文案等可见文本使用英文；代码、命令、路径、配置键、工具/API 名称保留原文。'

/** 锚定 preset 的默认关键词，命中任一即视为锚定模式。 */
const DEFAULT_ANCHORED_KEYWORDS = ['liangshen', '梁神', 'anchored', '锚定']

/**
 * 判断一个字段值是否为 loader 注入的 volatile 引用。
 * 依据 @mars-sea/dsh-commandcode-provider 的权威实现：冻结、非数组、带 get()。
 * @param value 待判定的字段值。
 * @returns 是 volatile 引用时返回 true。
 */
function isVolatileRef(value) {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.isFrozen(value)
    && typeof value.get === 'function'
}

/**
 * 把 loader 注入的 Config 摊平成普通对象。
 * volatile 字段每次调用都重新 get()，因此能拿到最新写入值而不需要重挂插件。
 * @param config loader 传入的插件配置。
 * @returns 摊平后的普通配置对象。
 */
function unwrapConfig(config) {
  if (config === null || typeof config !== 'object') return {}
  const plain = {}
  for (const [field, value] of Object.entries(config)) {
    plain[field] = isVolatileRef(value) ? value.get() : value
  }
  return plain
}

/**
 * 把任意来源的配置值归一化成完整的开关状态。
 * @param value 原始配置值（可能缺字段或类型不符）。
 * @returns 补齐默认值后的状态对象。
 */
function normalizeState(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  const anchored = Array.isArray(source.anchoredPresetKeywords)
    ? source.anchoredPresetKeywords.filter((item) => typeof item === 'string')
    : [...DEFAULT_ANCHORED_KEYWORDS]
  return {
    // 与 Config 的 default(true) 保持一致：缺字段视为开启，显式 false 才关闭
    enabled: source.enabled !== false,
    showInputSwitch: source.showInputSwitch !== false,
    replyChinese: source.replyChinese !== false,
    thinkingChinese: source.thinkingChinese !== false,
    toolsChinese: source.toolsChinese !== false,
    textReply: typeof source.textReply === 'string' && source.textReply.trim() !== ''
      ? source.textReply
      : DEFAULT_TEXT_REPLY,
    textThinking: typeof source.textThinking === 'string' && source.textThinking.trim() !== ''
      ? source.textThinking
      : DEFAULT_TEXT_THINKING,
    textTools: typeof source.textTools === 'string' && source.textTools.trim() !== ''
      ? source.textTools
      : DEFAULT_TEXT_TOOLS,
    anchoredPresetKeywords: anchored.length > 0 ? anchored : [...DEFAULT_ANCHORED_KEYWORDS],
    anchoredMode: source.anchoredMode === true,
  }
}

/**
 * 由开关状态拼出注入 system prompt 的语言要求。
 * @param state 归一化后的状态。
 * @param anchoredPreset 当前会话是否命中锚定 preset。
 * @returns 多行语言要求文本。
 */
function buildInjectionText(state, anchoredPreset) {
  const parts = []
  // 区域开关：ON=中文文案，OFF=英文正向指令
  parts.push(state.replyChinese ? state.textReply : DEFAULT_TEXT_REPLY_EN)
  // 锚定模式开启且为锚定 preset：思考强制英文；否则按 thinkingChinese 设定
  if (anchoredPreset && state.anchoredMode === true) parts.push(DEFAULT_TEXT_THINKING_EN)
  else parts.push(state.thinkingChinese ? state.textThinking : DEFAULT_TEXT_THINKING_EN)
  parts.push(state.toolsChinese ? state.textTools : DEFAULT_TEXT_TOOLS_EN)
  return parts.filter((item) => typeof item === 'string' && item.trim() !== '').join('\n')
}

/**
 * 读取本次组装所属会话的 preset 名。
 * 0.2.1 起 SessionHeader.agentPreset 是官方持久字段
 * （见 @deepseek-ai/dsh-session 的 SessionHeader 声明），无需再解析事件流。
 * @param context systemPrompt 组装上下文。
 * @returns preset 名；不可用时返回 undefined。
 */
function currentPreset(context) {
  const preset = context?.agent?.session?.header?.agentPreset
  return typeof preset === 'string' && preset !== '' ? preset : undefined
}

/**
 * 判断当前会话是否命中锚定关键词。
 * @param context systemPrompt 组装上下文。
 * @param state 归一化后的状态。
 * @returns 命中时返回 true。
 */
function isAnchoredPreset(context, state) {
  const preset = currentPreset(context)
  if (typeof preset !== 'string' || preset === '') return false
  const lower = preset.toLowerCase()
  return state.anchoredPresetKeywords.some((keyword) => {
    return typeof keyword === 'string' && keyword !== '' && lower.includes(keyword.toLowerCase())
  })
}

/**
 * 插件配置：全部字段标记 volatile，设置页才能显示并原地改写它们。
 * 字段顺序即设置页默认渲染顺序。
 *
 * z 解析失败时必须导出 undefined 而不是直接调用 z.object()：
 * 否则模块加载期就会抛 TypeError，把整个插件（含 systemPrompt 注入）一起打崩。
 * 导出 undefined 时 dsh-settings 判定为「该条目没有 schema」，
 * 只是设置页看不到本条目，语言注入功能照常工作。
 */
export const Config = z === undefined ? undefined : z.object({
  enabled: z.boolean().default(true).volatile()
    .description('总开关：关闭后不再向后续对话注入语言要求。'),
  showInputSwitch: z.boolean().default(true).volatile()
    .description('是否在输入框左侧显示「中文」快捷开关。'),
  replyChinese: z.boolean().default(true).volatile()
    .description('回复是否使用中文；关闭则注入英文回复要求。'),
  thinkingChinese: z.boolean().default(true).volatile()
    .description('思考过程是否使用中文；关闭则注入英文思考要求。'),
  toolsChinese: z.boolean().default(true).volatile()
    .description('工具调用说明、进度更新与界面文案是否使用中文。'),
  textReply: z.string().default(DEFAULT_TEXT_REPLY).volatile()
    .description('回复使用中文时注入的原文。'),
  textThinking: z.string().default(DEFAULT_TEXT_THINKING).volatile()
    .description('思考使用中文时注入的原文。'),
  textTools: z.string().default(DEFAULT_TEXT_TOOLS).volatile()
    .description('工具与界面文案使用中文时注入的原文。'),
  anchoredPresetKeywords: z.array(z.string()).default(DEFAULT_ANCHORED_KEYWORDS).volatile()
    .description('锚定 preset 关键词；preset 名包含任一关键词即视为锚定模式。'),
  anchoredMode: z.boolean().default(false).volatile()
    .description('锚定兼容：命中锚定 preset 时强制英文思考，回复与工具仍按上方设置。'),
})

/**
 * 注册语言 section。
 * @param ctx 插件上下文。
 * @param config loader 注入的配置（volatile 字段为 { get() } 引用）。
 */
export function apply(ctx, config) {
  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt === null || systemPrompt === undefined || typeof systemPrompt.section !== 'function') {
    console.warn('[dsh-chinese-mode-modern] systemPrompt.section 不可用，语言注入未注册')
    return
  }

  // 每次组装都重新摊平配置，因此 volatile 写入立即生效，无需重挂插件。
  const readState = () => normalizeState(unwrapConfig(config))

  // 官方接缝：把语言要求注册为 system prompt 的一个 section。
  // - text 是函数：每次组装实时读配置，总开关关闭时返回空串（渲染时自动丢弃）；
  // - order 负数：排在 persona 之前；
  // - section() 返回 disposer，交给 ctx.effect 随插件卸载清理。
  // - 注意：complete persona 会在 waterfall 后被系统强制恢复成唯一 section，
  //   因此本 section 对 complete persona 不生效（DSH 机制限制）。
  ctx.effect(() => systemPrompt.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    text: (context) => {
      try {
        const state = readState()
        if (state.enabled !== true) return ''
        return buildInjectionText(state, isAnchoredPreset(context, state))
      } catch (error) {
        console.warn('[dsh-chinese-mode-modern] 语言 section 计算失败，本轮跳过注入:', error instanceof Error ? error.message : String(error))
        return ''
      }
    },
  }), 'dsh-chinese-mode-modern: systemPrompt.section()')
}
