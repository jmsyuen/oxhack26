/**
 * Single-file build of CHOKEPOINT for a claude.ai artifact (or any static host):
 *   node artifact/build.mjs [--local]   -> artifact/dist/chokepoint.html
 * React 18 and d3 load as pinned UMD scripts from cdnjs; app code, CSS and every data file are inlined.
 * --local inlines those libraries from node_modules instead (offline testing).
 */
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = join(here, "dist");
mkdirSync(dist, { recursive: true });
const local = process.argv.includes("--local");
const umdDir = process.env.UMD_DIR || "/home/claude/umd/node_modules";

const globals = { react: "window.React", "react-dom": "window.ReactDOM", "react-dom/client": "window.ReactDOM", d3: "window.d3" };
const plugin = {
  name: "chokepoint-artifact",
  setup(b) {
    b.onResolve({ filter: /^(react|react-dom|react-dom\/client|d3)$/ }, (a) => ({ path: a.path, namespace: "global" }));
    b.onLoad({ filter: /.*/, namespace: "global" }, (a) => ({ contents: `module.exports = ${globals[a.path]};`, loader: "js" }));
    b.onResolve({ filter: /^react\/jsx(-dev)?-runtime$/ }, () => ({ path: join(here, "jsx-runtime.js") }));
    b.onResolve({ filter: /^next\/dynamic$/ }, () => ({ path: join(here, "shims", "dynamic.tsx") }));
    b.onResolve({ filter: /map\/MapView$/ }, () => ({ path: join(here, "D3MapView.tsx") }));
  },
};
await build({
  entryPoints: [join(here, "entry.tsx")], bundle: true, format: "iife", minify: true, target: "es2020", jsx: "automatic",
  outfile: join(dist, "app.js"), plugins: [plugin], tsconfig: join(root, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "warning", legalComments: "none",
});
execSync(`npx @tailwindcss/cli -i ${join(here, "artifact.css")} -o ${join(dist, "app.css")} --minify`, { cwd: root, stdio: "pipe" });

const data = {};
for (const f of ["network.json", "countries.json", "flows.json", "chokepoints.json", "datasets.json", "countries.geojson", "traffic.json", "forecast_model.json", "forecast_eval.json", "queue_calibration.json"])
  data[f] = JSON.parse(readFileSync(join(root, "public", "data", f), "utf8"));
const json = JSON.stringify(data).replace(/</g, "\\u003c");
const js = readFileSync(join(dist, "app.js"), "utf8").replace(/<\/script/gi, "<\\/script");
const css = readFileSync(join(dist, "app.css"), "utf8");
const cdn = {
  react: "https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js",
  reactDom: "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js",
  d3: "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js",
};
const libs = local
  ? ["react/umd/react.production.min.js", "react-dom/umd/react-dom.production.min.js", "d3/dist/d3.min.js"].map((p) => `<script>${readFileSync(join(umdDir, p), "utf8")}</script>`).join("\n")
  : [cdn.react, cdn.reactDom, cdn.d3].map((u) => `<script src="${u}" crossorigin="anonymous"></script>`).join("\n");
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>CHOKEPOINT · maritime disruption decisions</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script type="application/json" id="cp-data">${json}</script>
${libs}
<script>${js}</script>
</body>
</html>`;
const out = join(dist, local ? "chokepoint-local.html" : "chokepoint.html");
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1e6).toFixed(2)} MB (js ${(js.length / 1e3).toFixed(0)} kB, css ${(css.length / 1e3).toFixed(0)} kB, data ${(json.length / 1e3).toFixed(0)} kB)`);
