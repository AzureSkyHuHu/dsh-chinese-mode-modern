/**
 * dsh-chinese-mode-modern 客户端半侧
 *
 * 与原版 dsh-chinese-mode 0.2.1 的适配差异（目标运行时 DSH 0.2.1-alpha.1）：
 * - 插件级 inject 由 ["slots","settingsScope","connection","remote"] 改为
 *   ["slots","configForms"]。settingsScope 服务已在 0.1.7 的 settings 重写中删除，
 *   继续声明它会让 Cordis 门禁挡住整个 apply，表现为按钮完全不显示。
 * - 绑定对象由 ctx.settingsScope.bind({namespace}) 改为 ctx.configForms.get(entryId)。
 *   两者接口一致（getSnapshot/subscribe/set），因此组件层无需改动。
 * - 槽名 conversation.input.left 与 settings.section 在当前 DSH 中未变，保持原样。
 * - 新增 conversation.input.overlay 弹出面板（0.4.0）：该槽的 purpose 是
 *   "Floating entries rendered inside the resident composer card."，它的定位盒是
 *   composer 卡片顶边上高度为 0 的元素（.overlayAnchor{height:0;position:absolute;
 *   inset:0 0 auto}），所以面板用 bottom: calc(100% + 4px) 浮到卡片上方，
 *   与官方 slash-menu（同槽位）的写法一致。overlay 只在 sessionId 存在时渲染。
 */
window.__ModuleLoader__.load({
  id: "dsh-chinese-mode-modern",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");

    // 设置命名空间 = profile 条目的 id，必须与 cordis.patch.yml 中的 id 一致。
    const NS = "dsh-chinese-mode-modern";

    const PENDING = Object.freeze({
      status: "loading",
      value: undefined,
      base: undefined,
      user: undefined,
      revision: undefined,
      writable: false,
      mode: "host"
    });

    let binding = null;
    let unsub = null;
    const listeners = [];

    function readScopeSnapshot(scope) {
      try {
        const snapshot = scope.getSnapshot();
        return snapshot !== null && snapshot !== undefined ? snapshot : PENDING;
      } catch {
        return PENDING;
      }
    }

    const store = {
      getSnapshot() {
        return binding;
      },
      subscribe(listener) {
        listeners.push(listener);
        return () => {
          const i = listeners.indexOf(listener);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
      _set(scope) {
        if (unsub !== null) {
          unsub();
          unsub = null;
        }
        binding = scope === null ? null : { scope, snapshot: readScopeSnapshot(scope) };
        if (scope !== null && typeof scope.subscribe === "function") {
          try {
            unsub = scope.subscribe(() => {
              binding = { scope, snapshot: readScopeSnapshot(scope) };
              for (const listener of listeners.slice()) listener();
            });
          } catch {
            // 订阅失败时保持静态显示
          }
        }
        for (const listener of listeners.slice()) listener();
      }
    };

    function useBound() {
      return React.useSyncExternalStore(store.subscribe, store.getSnapshot);
    }

    // ---------- 弹出面板的共享状态 ----------
    // 胶囊按钮注册在 conversation.input.left，弹出的面板注册在
    // conversation.input.overlay。两者是互不相邻的两个槽位，拿不到彼此的 props，
    // 因此用一个模块级小 store 共享开合状态与 DOM 引用。
    let panelOpen = false;
    const panelListeners = [];
    const panelAnchor = { current: null };
    const panelRoot = { current: null };

    const panel = {
      getSnapshot() {
        return panelOpen;
      },
      subscribe(listener) {
        panelListeners.push(listener);
        return () => {
          const i = panelListeners.indexOf(listener);
          if (i >= 0) panelListeners.splice(i, 1);
        };
      },
      set(next) {
        const value = next === true;
        if (value === panelOpen) return;
        panelOpen = value;
        for (const listener of panelListeners.slice()) listener();
      },
      toggle() {
        panel.set(panelOpen !== true);
      },
      // 判断节点是否属于面板本身或它的锚点按钮，用于「点击外部关闭」。
      contains(node) {
        if (node === null || node === undefined) return false;
        if (panelRoot.current !== null && panelRoot.current.contains(node)) return true;
        return panelAnchor.current !== null && panelAnchor.current.contains(node);
      }
    };

    function usePanelOpen() {
      return React.useSyncExternalStore(panel.subscribe, panel.getSnapshot);
    }

    function readValue(bound) {
      if (bound === null) return null;
      try {
        const snapshot = bound.scope.getSnapshot();
        if (snapshot !== null && snapshot.status === "ready" && snapshot.value !== null && typeof snapshot.value === "object") {
          return snapshot.value;
        }
      } catch {
        // 忽略
      }
      return null;
    }

    function write(bound, field, value) {
      if (bound !== null && bound.scope !== null && typeof bound.scope.set === "function") {
        void bound.scope.set(field, value);
      }
    }

    // ---------- 小组件 ----------
    function Toggle({ value, onChange, disabled, ariaLabel }) {
      const on = value === true;
      const [focused, setFocused] = React.useState(false);
      return React.createElement(
        "button",
        {
          type: "button",
          "aria-label": ariaLabel,
          "aria-pressed": on,
          disabled: disabled === true,
          onClick: () => {
            if (disabled !== true && typeof onChange === "function") onChange(!on);
          },
          onFocus: () => setFocused(true),
          onBlur: () => setFocused(false),
          style: {
            position: "relative",
            width: 40,
            height: 23,
            borderRadius: 999,
            border: on ? "1px solid rgba(49,94,251,0.56)" : "1px solid rgba(127,127,127,0.28)",
            cursor: disabled ? "not-allowed" : "pointer",
            flex: "none",
            padding: 0,
            transition: "background 0.16s, border-color 0.16s, box-shadow 0.16s",
            background: on ? "var(--dsw-alias-brand-primary, #315efb)" : "rgba(127,127,127,0.25)",
            boxShadow: focused ? "0 0 0 3px rgba(49,94,251,0.24)" : "inset 0 1px 1px rgba(20,37,70,0.12)",
            opacity: disabled ? 0.5 : 1
          }
        },
        React.createElement("span", {
          "aria-hidden": true,
          style: {
            position: "absolute",
            top: 3,
            left: 3,
            width: 15,
            height: 15,
            borderRadius: 999,
            background: "#ffffff",
            boxShadow: "0 1px 3px rgba(20,37,70,0.25)",
            transition: "transform 0.16s",
            transform: on ? "translateX(17px)" : "translateX(0px)"
          }
        })
      );
    }

    function Row({ label, hint, children }) {
      return React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 16,
            minHeight: 52,
            padding: "10px 0",
            borderBottom: "1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,0.16))",
            justifyContent: "space-between"
          }
        },
        React.createElement(
          "div",
          { style: { flex: 1, minWidth: 0 } },
          React.createElement("div", {
            style: { fontSize: 13, fontWeight: 600, color: "var(--dsw-alias-text-primary, inherit)", lineHeight: 1.4 }
          }, label),
          hint
            ? React.createElement("div", {
                style: { fontSize: 12, color: "var(--dsw-alias-text-tertiary, #888)", marginTop: 3, lineHeight: 1.45 }
              }, hint)
            : null
        ),
        children
      );
    }

    function SettingsGroup({ title, hint, children }) {
      return React.createElement(
        "section",
        { style: { marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,0.18))" } },
        React.createElement("div", {
          style: { fontSize: 13, fontWeight: 700, color: "var(--dsw-alias-text-primary, inherit)", lineHeight: 1.4 }
        }, title),
        hint
          ? React.createElement("div", {
              style: { marginTop: 3, fontSize: 12, color: "var(--dsw-alias-text-tertiary, #888)", lineHeight: 1.45 }
            }, hint)
          : null,
        React.createElement("div", { style: { marginTop: 8 } }, children)
      );
    }

    function Field({ value, onCommit, placeholder, ariaLabel }) {
      const [local, setLocal] = React.useState(value);
      const [focused, setFocused] = React.useState(false);
      React.useEffect(() => {
        setLocal(value);
      }, [value]);
      return React.createElement("input", {
        "aria-label": ariaLabel,
        value: local,
        placeholder: placeholder || "",
        spellCheck: false,
        onChange: (e) => setLocal(e.target.value),
        onFocus: () => setFocused(true),
        onBlur: () => {
          setFocused(false);
          if (typeof onCommit === "function") onCommit(local);
        },
        style: {
          width: "100%",
          boxSizing: "border-box",
          background: "var(--dsw-alias-background-input, rgba(127,127,127,0.08))",
          color: "inherit",
          border: focused ? "1px solid var(--dsw-alias-brand-primary, #315efb)" : "1px solid rgba(127,127,127,0.22)",
          borderRadius: 6,
          boxShadow: focused ? "0 0 0 3px rgba(49,94,251,0.18)" : "none",
          padding: "8px 10px",
          fontSize: 13,
          transition: "border-color 0.16s, box-shadow 0.16s"
        }
      });
    }

    // ---------- 输入框中文模式开关 ----------
    function ChineseModeSwitch() {
      const bound = useBound();
      const value = readValue(bound);
      const open = usePanelOpen();
      const [focused, setFocused] = React.useState(false);
      const anchorRef = React.useRef(null);
      // Hooks 必须在提前 return 之前调用完毕。
      React.useEffect(() => {
        panelAnchor.current = anchorRef.current;
        return () => {
          if (panelAnchor.current === anchorRef.current) panelAnchor.current = null;
        };
      }, [open]);
      if (value === null || value.showInputSwitch === false) return null;
      // 与宿主侧 normalizeState 一致：缺字段视为开启，只有显式 false 才是关闭
      const enabled = value.enabled !== false;
      const label = enabled
        ? "中文模式已开启，点击展开语言选项"
        : "中文模式已关闭，点击展开语言选项";
      return React.createElement(
        "button",
        {
          ref: anchorRef,
          type: "button",
          title: label,
          "aria-label": label,
          "aria-pressed": enabled,
          "aria-expanded": open === true,
          "aria-haspopup": "dialog",
          onClick: () => panel.toggle(),
          onFocus: () => setFocused(true),
          onBlur: () => setFocused(false),
          style: {
            height: 26,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flex: "none",
            padding: "0 7px",
            borderRadius: 6,
            border: enabled ? "1px solid rgba(49,94,251,0.26)" : "1px solid rgba(127,127,127,0.18)",
            color: enabled ? "var(--dsw-alias-brand-primary, #315efb)" : "var(--dsw-alias-text-secondary, #7f8a99)",
            background: enabled ? "rgba(49,94,251,0.10)" : "rgba(127,127,127,0.06)",
            boxShadow: open === true || focused ? "0 0 0 3px rgba(49,94,251,0.20)" : "none",
            cursor: "pointer",
            userSelect: "none",
            fontSize: 12,
            fontWeight: 400,
            lineHeight: 1,
            whiteSpace: "nowrap",
            transition: "background 0.16s, border-color 0.16s, color 0.16s, box-shadow 0.16s"
          }
        },
        React.createElement(
          "span",
          {
            "aria-hidden": true,
            style: {
              position: "relative",
              width: 18,
              height: 12,
              flex: "none",
              borderRadius: 999,
              background: enabled ? "var(--dsw-alias-brand-primary, #315efb)" : "rgba(127,127,127,0.42)",
              transition: "background 0.16s"
            }
          },
          React.createElement("span", {
            style: {
              position: "absolute",
              top: 2,
              left: 2,
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "#ffffff",
              boxShadow: "0 1px 2px rgba(20,37,70,0.22)",
              transform: enabled ? "translateX(6px)" : "translateX(0)",
              transition: "transform 0.16s"
            }
          })
        ),
        React.createElement("span", null, "中文")
      );
    }

    // ---------- 输入框弹出面板（conversation.input.overlay） ----------
    function MenuRow({ label, hint, value, disabled, onToggle }) {
      const on = value === true;
      const off = disabled === true;
      const [hover, setHover] = React.useState(false);
      return React.createElement(
        "button",
        {
          type: "button",
          role: "menuitemcheckbox",
          "aria-checked": on,
          "aria-label": label,
          disabled: off,
          onClick: () => {
            if (!off && typeof onToggle === "function") onToggle(!on);
          },
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            minHeight: 32,
            boxSizing: "border-box",
            padding: "6px 8px",
            border: 0,
            borderRadius: "var(--dsw-radius-md, 6px)",
            textAlign: "left",
            font: "inherit",
            fontSize: 13,
            lineHeight: 1.35,
            color: "inherit",
            cursor: off ? "not-allowed" : "pointer",
            opacity: off ? 0.45 : 1,
            background: hover && !off ? "var(--dsw-alias-background-hover, rgba(127,127,127,0.10))" : "transparent",
            transition: "background 0.12s"
          }
        },
        React.createElement(
          "span",
          {
            "aria-hidden": true,
            style: {
              width: 14,
              flex: "none",
              fontSize: 13,
              textAlign: "center",
              color: "var(--dsw-alias-brand-primary, #315efb)"
            }
          },
          on ? "✓" : ""
        ),
        React.createElement("span", { style: { flex: "1 1 auto", minWidth: 0 } }, label),
        hint
          ? React.createElement(
              "span",
              { style: { flex: "none", fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" } },
              hint
            )
          : null
      );
    }

    // 面板挂在 composer 卡片顶边那个 0 高度定位盒上，因此 bottom: calc(100% + 4px)
    // 就是「浮在输入框上方 4px」。z-index 与官方 slash-menu 对齐。
    function ChineseModePanel() {
      const bound = useBound();
      const value = readValue(bound);
      const open = usePanelOpen();
      const rootRef = React.useRef(null);
      React.useEffect(() => {
        panelRoot.current = rootRef.current;
        return () => {
          if (panelRoot.current === rootRef.current) panelRoot.current = null;
        };
      }, [open]);
      if (open !== true || value === null) return null;
      const set = (field, v) => write(bound, field, v);
      // 与宿主侧 normalizeState 一致：缺字段视为开启，只有显式 false 才是关闭
      const enabled = value.enabled !== false;
      const divider = React.createElement("div", {
        style: {
          height: 1,
          flex: "none",
          margin: "4px 8px",
          background: "var(--dsw-alias-border-secondary, rgba(127,127,127,0.16))"
        }
      });
      return React.createElement(
        "div",
        {
          ref: rootRef,
          role: "dialog",
          "aria-label": "中文模式",
          style: {
            position: "absolute",
            bottom: "calc(100% + 4px)",
            left: 0,
            zIndex: 100,
            width: 252,
            maxWidth: "calc(100vw - 32px)",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            padding: 6,
            borderRadius: "var(--dsw-radius-panel, 10px)",
            background: "var(--dsw-specific-menu, var(--dsw-alias-background-panel, #ffffff))",
            border: "1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,0.18))",
            boxShadow: "var(--dsw-elevation-prominent, 0 8px 28px rgba(15,23,42,0.18))",
            color: "var(--dsw-alias-text-primary, inherit)"
          }
        },
        // 首行：总开关。语言三项都受它约束，关闭时置灰。
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 8px 6px" } },
          React.createElement(
            "span",
            { style: { flex: "1 1 auto", fontSize: 12, fontWeight: 700, opacity: 0.72 } },
            "中文模式"
          ),
          React.createElement(Toggle, {
            value: enabled,
            onChange: (v) => set("enabled", v),
            ariaLabel: "启用中文模式"
          })
        ),
        divider,
        React.createElement(MenuRow, {
          label: "回复用中文",
          hint: "回复",
          value: value.replyChinese !== false,
          disabled: !enabled,
          onToggle: (v) => set("replyChinese", v)
        }),
        React.createElement(MenuRow, {
          label: "思考用中文",
          hint: "思考",
          value: value.thinkingChinese !== false,
          disabled: !enabled,
          onToggle: (v) => set("thinkingChinese", v)
        }),
        React.createElement(MenuRow, {
          label: "工具说明用中文",
          hint: "工具",
          value: value.toolsChinese !== false,
          disabled: !enabled,
          onToggle: (v) => set("toolsChinese", v)
        }),
        divider,
        React.createElement(
          "div",
          { style: { padding: "2px 8px 4px", fontSize: 11, lineHeight: 1.5, opacity: 0.5 } },
          "更多选项见「设置 → 中文模式」。"
        )
      );
    }

    // ---------- 设置页（settings.section） ----------
    function ChineseModeSettingsSection() {
      const bound = useBound();
      const value = readValue(bound);
      if (value === null) {
        return React.createElement("div", {
          style: { color: "var(--dsw-alias-text-tertiary, #888)", fontSize: 13, padding: 12 }
        }, "中文模式设置加载中…");
      }
      const set = (field, v) => write(bound, field, v);
      const setKeywords = (raw) => {
        const list = String(raw || "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== "");
        set("anchoredPresetKeywords", list);
      };
      const keywordsText = Array.isArray(value.anchoredPresetKeywords)
        ? value.anchoredPresetKeywords.join(", ")
        : "";
      return React.createElement(
        "div",
        { style: { maxWidth: 620, padding: "14px 4px 24px" } },
        React.createElement("div", {
          style: { fontSize: 15, fontWeight: 700, color: "var(--dsw-alias-text-primary, inherit)", lineHeight: 1.4 }
        }, "中文模式"),
        React.createElement("div", {
          style: { marginTop: 4, fontSize: 12, color: "var(--dsw-alias-text-tertiary, #888)", lineHeight: 1.5 }
        }, "设置输入框快捷入口与语言输出规则。"),
        React.createElement(
          SettingsGroup,
          { title: "快捷入口", hint: "输入框状态键与语言注入开关相互独立。" },
          React.createElement(Row, { label: "启用中文模式", hint: "关闭后不再向后续对话注入语言要求。" },
            React.createElement(Toggle, { value: value.enabled !== false, onChange: (v) => set("enabled", v), ariaLabel: "启用中文模式" })),
          React.createElement(Row, { label: "显示输入框中文模式开关", hint: "关闭后隐藏输入框左侧的中文模式开关，不影响当前语言模式。" },
            React.createElement(Toggle, { value: value.showInputSwitch !== false, onChange: (v) => set("showInputSwitch", v), ariaLabel: "显示输入框中文状态键" }))
        ),
        React.createElement(
          SettingsGroup,
          { title: "语言输出", hint: "开启为中文，关闭为英文。" },
          React.createElement(Row, { label: "回复", hint: "控制模型最终回复的语言。" },
            React.createElement(Toggle, { value: value.replyChinese !== false, onChange: (v) => set("replyChinese", v), ariaLabel: "回复使用中文" })),
          React.createElement(Row, { label: "思考", hint: "控制思考过程与推理说明的语言。" },
            React.createElement(Toggle, { value: value.thinkingChinese !== false, onChange: (v) => set("thinkingChinese", v), ariaLabel: "思考使用中文" })),
          React.createElement(Row, { label: "工具与界面文案", hint: "控制可见的工具调用说明与界面文案。" },
            React.createElement(Toggle, { value: value.toolsChinese !== false, onChange: (v) => set("toolsChinese", v), ariaLabel: "工具与界面文案使用中文" }))
        ),
        React.createElement(
          SettingsGroup,
          { title: "锚定兼容", hint: "默认关闭；启用后，匹配的 preset 会强制使用英文思考，回复和工具仍按上方设置。" },
          React.createElement(Row, { label: "启用锚定兼容", hint: "关闭后所有 preset 都遵循常规语言设置。" },
            React.createElement(Toggle, { value: value.anchoredMode === true, onChange: (v) => set("anchoredMode", v), ariaLabel: "启用锚定兼容" })),
          React.createElement(
            "div",
            { style: { padding: "12px 0 4px" } },
            React.createElement("div", {
              style: { fontSize: 13, fontWeight: 600, color: "var(--dsw-alias-text-primary, inherit)", lineHeight: 1.4 }
            }, "锚定 preset 关键词"),
            React.createElement("div", {
              style: { marginTop: 3, marginBottom: 8, fontSize: 12, color: "var(--dsw-alias-text-tertiary, #888)", lineHeight: 1.45 }
            }, "用逗号分隔；名称包含任一关键词时视为锚定模式。"),
            React.createElement(Field, {
              value: keywordsText,
              onCommit: setKeywords,
              placeholder: "liangshen, 梁神, anchored, 锚定",
              ariaLabel: "锚定 preset 关键词"
            })
          )
        )
      );
    }

    function apply(ctx) {
      if (ctx !== null && typeof ctx.slots?.inject === "function" && typeof ctx.slots.register === "function") {
        ctx.slots.inject("conversation.input.left", () => ctx.slots.register(
          {
            name: "conversation.input.left",
            id: NS,
            order: 100,
            label: () => "中文模式"
          },
          ChineseModeSwitch
        ));
        // 面板与按钮共用 NS 作为 id：overlay 槽的契约要求 id 必填，用插件自己的
        // id 会作为新格子加在官方条目（slash-menu / command-popup）旁边。
        ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register(
          {
            name: "conversation.input.overlay",
            id: NS,
            order: 50,
            label: () => "中文模式"
          },
          ChineseModePanel
        ));
        ctx.slots.inject("settings.section", () => ctx.slots.register(
          {
            name: "settings.section",
            id: NS,
            order: 900,
            label: () => "中文模式"
          },
          ChineseModeSettingsSection
        ));
      }
      // 0.2.1 的官方替代：configForms 提供按 profile 条目 id 绑定的共享表单。
      // get() 总是返回一个 form（未就绪时快照为 loading），因此这里不需要兜底分支。
      if (ctx !== null && typeof ctx.configForms?.get === "function") {
        let form = null;
        try {
          form = ctx.configForms.get(NS);
        } catch (error) {
          console.warn("[dsh-chinese-mode-modern] 配置表单绑定失败:", error);
        }
        if (form !== null && form !== undefined) {
          store._set(form);
          ctx.effect(() => () => {
            const current = store.getSnapshot();
            if (current !== null && current.scope === form) store._set(null);
          }, "dsh-chinese-mode-modern: config form");
        }
      } else {
        console.warn("[dsh-chinese-mode-modern] configForms 服务不可用，开关将保持只读");
      }

      // 点击面板外部或按 Esc 关闭面板。监听挂在 document 捕获阶段，只读不阻断，
      // 因此不影响宿主与其它插件的事件处理；注销交给 ctx.effect 的清理函数。
      if (ctx !== null && typeof ctx.effect === "function" && typeof document !== "undefined") {
        ctx.effect(() => {
          const onPointerDown = (event) => {
            if (panel.getSnapshot() !== true) return;
            const target = event.target;
            if (target !== null && target !== undefined && panel.contains(target)) return;
            panel.set(false);
          };
          const onKeyDown = (event) => {
            if (event.key !== "Escape") return;
            if (panel.getSnapshot() !== true) return;
            panel.set(false);
          };
          document.addEventListener("pointerdown", onPointerDown, true);
          document.addEventListener("keydown", onKeyDown, true);
          return () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("keydown", onKeyDown, true);
          };
        }, "dsh-chinese-mode-modern: panel dismiss");
      }
    }

    // 客户端上下文通过 inject 声明服务。settingsScope 绝不能再出现在这里：
    // 它已被 0.1.7 的 settings 重写删除，声明一个不存在的服务会让 Cordis
    // 门禁挡住整个 apply，表现为按钮完全不显示。
    const inject = ["slots", "configForms"];
    module.exports = { apply, inject };
    return module.exports;
  }
});
