var g = globalThis.__bbPluginRuntime;
if (g == null || g.pluginSdkApp == null) {
  throw new Error(
    "Cannot load \"@get-bb/plugin-sdk/app\": this bundle must be loaded by the BB app, which provides the shared plugin runtime (globalThis.__bbPluginRuntime).",
  );
}
var p = g.pluginSdkApp,
  M = "default" in p ? p.default : p,
  {
    Markdown: L,
    ThreadChat: U,
    UrlLink: B,
    definePluginApp: T,
    experimental_Diff: O,
    experimental_FileLink: F,
    experimental_NewThreadComposer: j,
    experimental_PermissionModePicker: N,
    experimental_ProviderModelPicker: D,
    experimental_SourceCode: H,
    experimental_useAppPanel: z,
    experimental_useFixedTabTarget: W,
    experimental_useProviders: q,
    experimental_useSidebarThreadActions: G,
    experimental_useSidebarThreadPullRequest: V,
    experimental_useSidebarThreadSplit: Z,
    experimental_useSidebarThreads: J,
    useBbContext: K,
    useBbNavigate: Q,
    useComposer: X,
    useComposerView: Y,
    useRealtime: ee,
    useRealtimeConnectionState: te,
    useRpc: ne,
    useSettings: oe,
  } = p;
var S = "message-usage", v = "message-usage-badge";
var R = "[data-message-column=\"\"]";
async function C(e) {
  try {
    let t = await fetch(`/api/v1/plugins/${encodeURIComponent(S)}/rpc/getUsage`, {
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
function P(e, t) {
  if (e === null) return null;
  let n = e >= .1 ? `$${e.toFixed(2)}` : e >= .01 ? `$${e.toFixed(3)}` : `$${e.toFixed(4)}`;
  return t ? `~${n}` : n;
}
function I(e) {
  if (!e) return null;
  let t = e.split("/").pop() ?? e, n = t.split("@")[0] ?? t;
  return n.length > 28 ? `${n.slice(0, 27)}\u2026` : n;
}
function y(e) {
  let t = [], n = I(e.model);
  if (n && t.push(n), e.last) {
    let { inputTokens: a, cachedInputTokens: l, outputTokens: r } = e.last, d = E(a, l);
    if (t.push(`\u2191${h(d)}`), l > 0 && d > 0) {
      let u = Math.round(l / d * 100);
      t.push(`cache ${u}%`);
    }
    t.push(`\u2193${h(r)}`), e.outputTokensPerSecond !== null && t.push(`${e.outputTokensPerSecond} tok/s`);
  }
  let s = P(e.estimatedCostUsd, e.costIsEstimate);
  return s && t.push(s), e.total && t.push(`\u03A3${h(e.total.totalTokens)}`), t.join(" \xB7 ");
}
function E(e, t) {
  return Math.max(0, e - t) + t;
}
function k(e) {
  let t = document.createElement("div");
  return t.className = v,
    t.setAttribute("data-message-usage-badge", ""),
    t.textContent = y(e),
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
function A(e) {
  let t = [e.pathname, e.hash.startsWith("#") ? e.hash.slice(1) : e.hash];
  for (let n of t) {
    let s = n.match(/^\/threads\/(thr_[A-Za-z0-9]+)/);
    if (s) return s[1];
    let a = n.match(/^\/projects\/[^/]+\/threads\/(thr_[A-Za-z0-9]+)/);
    if (a) return a[1];
  }
  return null;
}
var ue = T(e => {
  e.contentScripts.register({
    id: "message-usage-badge",
    mount({ signal: t }) {
      let n = null,
        s = null,
        a = !1,
        l = 0,
        r = () => {
          n?.remove(), n = null, s = null;
        },
        d = o => {
          let i = o.messageRowId;
          if (!i) {
            r();
            return;
          }
          let c = document.querySelector(
            `[data-timeline-row-id="${i.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"] ${R}`,
          );
          if (!c) {
            r();
            return;
          }
          if (n && s === i) {
            let m = k(o);
            n.textContent !== m.textContent && (n.replaceWith(m), n = m);
            return;
          }
          r(), n = k(o), s = i, c.appendChild(n);
        },
        u = async () => {
          if (a) return;
          let o = A(window.location);
          if (!o) {
            r();
            return;
          }
          a = !0;
          try {
            let i = await C(o);
            if (t.aborted) return;
            if (!i) {
              r();
              return;
            }
            d(i);
          } finally {
            a = !1;
          }
        },
        x = () => {
          let o = Date.now();
          o - l < 800 || (l = o,
            window.setTimeout(() => {
              u();
            }, 50));
        },
        f = new MutationObserver(o => {
          o.some(c => !(c.target instanceof HTMLElement) || c.target.closest("[data-message-usage-badge]") === null)
            && x();
        });
      f.observe(document.body, { childList: !0, subtree: !0 });
      let _ = window.setInterval(() => {
          u();
        }, 2e3),
        b = window.location.pathname,
        $ = window.setInterval(() => {
          if (window.location.pathname !== b) {
            b = window.location.pathname, r(), u();
            return;
          }
        }, 300);
      u();
      let w = () => {
        f.disconnect(), window.clearInterval(_), window.clearInterval($), r();
      };
      return t.addEventListener("abort", w, { once: !0 }), w;
    },
  });
});
export { ue as default };
