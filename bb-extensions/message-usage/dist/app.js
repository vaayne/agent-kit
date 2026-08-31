var g = globalThis.__bbPluginRuntime;
if (g == null || g.pluginSdkApp == null) {
  throw new Error(
    "Cannot load \"@get-bb/plugin-sdk/app\": this bundle must be loaded by the BB app, which provides the shared plugin runtime (globalThis.__bbPluginRuntime).",
  );
}
var p = g.pluginSdkApp,
  E = "default" in p ? p.default : p,
  {
    Markdown: A,
    ThreadChat: M,
    UrlLink: L,
    definePluginApp: T,
    experimental_Diff: U,
    experimental_FileLink: B,
    experimental_NewThreadComposer: O,
    experimental_PermissionModePicker: F,
    experimental_ProviderModelPicker: j,
    experimental_SourceCode: N,
    experimental_useAppPanel: D,
    experimental_useFixedTabTarget: H,
    experimental_useProviders: z,
    experimental_useSidebarThreadActions: W,
    experimental_useSidebarThreadPullRequest: q,
    experimental_useSidebarThreadSplit: G,
    experimental_useSidebarThreads: V,
    useBbContext: Z,
    useBbNavigate: J,
    useComposer: K,
    useComposerView: Q,
    useRealtime: X,
    useRealtimeConnectionState: Y,
    useRpc: ee,
    useSettings: te,
  } = p;
var _ = "message-usage", $ = "message-usage-badge";
var S = "[data-message-column=\"\"]";
async function R(e) {
  try {
    let t = await fetch(`/api/v1/plugins/${encodeURIComponent(_)}/rpc/getUsage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: e }),
      }),
      n = await t.json().catch(() => null);
    return !t.ok || !n?.ok || !n.result ? null : n.result;
  } catch {
    return null;
  }
}
function h(e) {
  return e >= 1e6
    ? `${(e / 1e6).toFixed(2)}M`
    : e >= 1e4
    ? `${Math.round(e / 1e3)}k`
    : e >= 1e3
    ? `${(e / 1e3).toFixed(1)}k`
    : String(e);
}
function C(e, t) {
  if (e === null) return null;
  let n = e >= .1 ? `$${e.toFixed(2)}` : e >= .01 ? `$${e.toFixed(3)}` : `$${e.toFixed(4)}`;
  return t ? `~${n}` : n;
}
function v(e) {
  if (!e) return null;
  let t = e.split("/").pop() ?? e, n = t.split("@")[0] ?? t;
  return n.length > 28 ? `${n.slice(0, 27)}\u2026` : n;
}
function P(e) {
  let t = [], n = v(e.model);
  if (n && t.push(n), e.last) {
    let { inputTokens: l, cachedInputTokens: i, outputTokens: r } = e.last, u = I(l, i);
    if (t.push(`\u2191${h(u)}`), i > 0 && u > 0) {
      let d = Math.round(i / u * 100);
      t.push(`cache ${d}%`);
    }
    t.push(`\u2193${h(r)}`), e.outputTokensPerSecond !== null && t.push(`${e.outputTokensPerSecond} tok/s`);
  }
  let s = C(e.estimatedCostUsd, e.costIsEstimate);
  return s && t.push(s), e.total && t.push(`\u03A3${h(e.total.totalTokens)}`), t.join(" \xB7 ");
}
function I(e, t) {
  return Math.max(0, e - t) + t;
}
function k(e) {
  let t = document.createElement("div");
  return t.className = $,
    t.setAttribute("data-message-usage-badge", ""),
    t.textContent = P(e),
    t.title = e.last
      ? [
        `input ${e.last.inputTokens} (cached ${e.last.cachedInputTokens})`,
        `output ${e.last.outputTokens} (reasoning ${e.last.reasoningOutputTokens})`,
        `thread total ${e.total?.totalTokens ?? "?"} tokens`,
      ].join(`
`)
      : "No usage reported yet",
    t;
}
function y(e) {
  let t = e.startsWith("#") ? e.slice(1) : e, n = t.match(/^\/threads\/(thr_[A-Za-z0-9]+)/);
  if (n) return n[1];
  let s = t.match(/^\/projects\/[^/]+\/threads\/(thr_[A-Za-z0-9]+)/);
  return s ? s[1] : null;
}
var ie = T(e => {
  e.contentScripts.register({
    id: "message-usage-badge",
    mount({ signal: t }) {
      let n = null,
        s = null,
        l = !1,
        i = 0,
        r = () => {
          n?.remove(), n = null, s = null;
        },
        u = o => {
          let a = o.messageRowId;
          if (!a) {
            r();
            return;
          }
          let c = document.querySelector(
            `[data-timeline-row-id="${a.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"] ${S}`,
          );
          if (!c) {
            r();
            return;
          }
          if (n && s === a) {
            let m = k(o);
            n.textContent !== m.textContent && (n.replaceWith(m), n = m);
            return;
          }
          r(), n = k(o), s = a, c.appendChild(n);
        },
        d = async () => {
          if (l) return;
          let o = y(window.location.hash);
          if (!o) {
            r();
            return;
          }
          l = !0;
          try {
            let a = await R(o);
            if (t.aborted) return;
            if (!a) {
              r();
              return;
            }
            u(a);
          } finally {
            l = !1;
          }
        },
        x = () => {
          let o = Date.now();
          o - i < 800 || (i = o,
            window.setTimeout(() => {
              d();
            }, 50));
        },
        f = new MutationObserver(o => {
          o.some(c => !(c.target instanceof HTMLElement) || c.target.closest("[data-message-usage-badge]") === null)
            && x();
        });
      f.observe(document.body, { childList: !0, subtree: !0 });
      let w = window.setInterval(() => {
        d();
      }, 3e3);
      d();
      let b = () => {
        f.disconnect(), window.clearInterval(w), r();
      };
      return t.addEventListener("abort", b, { once: !0 }), b;
    },
  });
});
export { ie as default };
