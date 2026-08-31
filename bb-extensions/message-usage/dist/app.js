var h = globalThis.__bbPluginRuntime;
if (h == null || h.pluginSdkApp == null) {
  throw new Error(
    "Cannot load \"@get-bb/plugin-sdk/app\": this bundle must be loaded by the BB app, which provides the shared plugin runtime (globalThis.__bbPluginRuntime).",
  );
}
var p = h.pluginSdkApp,
  A = "default" in p ? p.default : p,
  {
    Markdown: L,
    ThreadChat: M,
    UrlLink: U,
    definePluginApp: T,
    experimental_Diff: B,
    experimental_FileLink: O,
    experimental_NewThreadComposer: F,
    experimental_PermissionModePicker: j,
    experimental_ProviderModelPicker: N,
    experimental_SourceCode: D,
    experimental_useAppPanel: H,
    experimental_useFixedTabTarget: z,
    experimental_useProviders: W,
    experimental_useSidebarThreadActions: q,
    experimental_useSidebarThreadPullRequest: G,
    experimental_useSidebarThreadSplit: V,
    experimental_useSidebarThreads: Z,
    useBbContext: J,
    useBbNavigate: K,
    useComposer: Q,
    useComposerView: X,
    useRealtime: Y,
    useRealtimeConnectionState: ee,
    useRpc: te,
    useSettings: ne,
  } = p;
var S = "message-usage", $ = "message-usage-badge";
var v = "[data-message-column=\"\"]";
async function R(e) {
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
function g(e) {
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
function P(e) {
  if (!e) return null;
  let t = e.split("/").pop() ?? e, n = t.split("@")[0] ?? t;
  return n.length > 28 ? `${n.slice(0, 27)}\u2026` : n;
}
function y(e) {
  let t = [], n = P(e.model);
  if (n && t.push(n), e.last) {
    let { freshInputTokens: s, cachedInputTokens: l, outputTokens: a } = e.last, d = s + l;
    if (t.push(`\u2191${g(d)}`), l > 0 && d > 0) {
      let u = Math.round(l / d * 100);
      t.push(`cache ${u}%`);
    }
    t.push(`\u2193${g(a)}`), e.outputTokensPerSecond !== null && t.push(`${e.outputTokensPerSecond} tok/s`);
  }
  let r = C(e.estimatedCostUsd, e.costIsEstimate);
  if (r && t.push(r), e.total) {
    let s = e.total;
    t.push(`\u03A3${g(s.freshInputTokens + s.cachedInputTokens + s.outputTokens)}`);
  }
  return t.join(" \xB7 ");
}
function k(e) {
  let t = document.createElement("div");
  return t.className = $,
    t.setAttribute("data-message-usage-badge", ""),
    t.textContent = y(e),
    t.title = e.last
      ? [
        `input ${e.last.freshInputTokens + e.last.cachedInputTokens} (cached ${e.last.cachedInputTokens})`,
        `output ${e.last.outputTokens} (reasoning ${e.last.reasoningOutputTokens})`,
      ].join(`
`)
      : "No usage reported yet",
    t;
}
function E(e) {
  let t = [e.pathname, e.hash.startsWith("#") ? e.hash.slice(1) : e.hash];
  for (let n of t) {
    let r = n.match(/^\/threads\/(thr_[A-Za-z0-9]+)/);
    if (r) return r[1];
    let s = n.match(/^\/projects\/[^/]+\/threads\/(thr_[A-Za-z0-9]+)/);
    if (s) return s[1];
  }
  return null;
}
var le = T(e => {
  e.contentScripts.register({
    id: "message-usage-badge",
    mount({ signal: t }) {
      let n = null,
        r = null,
        s = !1,
        l = 0,
        a = () => {
          n?.remove(), n = null, r = null;
        },
        d = o => {
          let i = o.messageRowId;
          if (!i) {
            a();
            return;
          }
          let c = document.querySelector(
            `[data-timeline-row-id="${i.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"] ${v}`,
          );
          if (!c) {
            a();
            return;
          }
          if (n && r === i) {
            let m = k(o);
            n.textContent !== m.textContent && (n.replaceWith(m), n = m);
            return;
          }
          a(), n = k(o), r = i, c.appendChild(n);
        },
        u = async () => {
          if (s) return;
          let o = E(window.location);
          if (!o) {
            a();
            return;
          }
          s = !0;
          try {
            let i = await R(o);
            if (t.aborted) return;
            if (!i) {
              a();
              return;
            }
            d(i);
          } finally {
            s = !1;
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
        I = window.setInterval(() => {
          if (window.location.pathname !== b) {
            b = window.location.pathname, a(), u();
            return;
          }
        }, 300);
      u();
      let w = () => {
        f.disconnect(), window.clearInterval(_), window.clearInterval(I), a();
      };
      return t.addEventListener("abort", w, { once: !0 }), w;
    },
  });
});
export { le as default };
