# Handoff: MATRX TypeScript Render Engine (Pixlet → TS)

**Audience:** Fable (implementing agent) · **Author:** architecture brainstorm · **Status:** spec — pending review (decisions applied 2026-07-05) · **Date:** 2026-07-05

> Working package scope used throughout: `@matrx/*`. Names are placeholders — rename freely.
> Ground-truth source lives locally: Pixlet fork at `/Users/aiden/Projects/Koios/pixlet` (github.com/koiosdigital/pixlet), Go wrapper service at `/Users/aiden/Projects/Koios/matrx-renderer`. **Cited file paths in this doc point at that source — read them; this spec paraphrases, the source is authoritative.**

---

## 1. Goal & motivation

Replace the Pixlet-based render service (Go binary + Starlark apps, currently run as a container: `matrx-renderer` wrapping `koiosdigital/pixlet` v0.38.0) with a **TypeScript render engine** where:

- **Apps are `.ts` files** a developer writes with full type-safety, multi-file, with (vetted) npm dependencies.
- Each app **runs in a V8 isolate** (Cloudflare **Dynamic Workers / Worker Loader** in prod; `workerd` locally) with a controlled, injected standard library.
- The engine **emits animated WebP** (64×32 by default; device-provided dimensions supported), byte-for-byte **deterministic** so the output hash can serve as an HTTP **ETag** for edge-cached, fan-out delivery.
- The **developer experience is excellent**: live preview with hot-reload, auto-generated config UI, typed API, deterministic golden-image tests, one-command scaffold/render/deploy.

### Why (context from the surrounding migration)
This engine is the render plane of a broader move of Koios `device-api` onto Cloudflare. The end state: a `matrx-render` Worker executes the app isolate → rasterizes → WebP, fronted by edge cache + ETag; the device fetches renders over HTTP (`If-None-Match: <sha256>`), and the per-device Durable Object never touches render bytes. Collapsing rendering from a container onto Workers is what makes that possible. **The determinism contract (§8) is not optional — it is what makes the whole caching/fan-out architecture work.**

---

## 2. Scope & non-goals

**In scope:** the render engine (layout + rasterizer + fonts + encoders), the app authoring SDK, the injected stdlib, the isolate host/runtime, the schema/config system, the CLI/DX tooling, and a migration path for the ~516 existing Starlark apps.

**Non-goals:**
- Not reimplementing Starlark or maintaining Starlark app compatibility at runtime (apps are rewritten/ported to TS — see §11).
- Not a general-purpose UI framework — a fixed, small widget set matching Pixlet.
- Not arbitrary canvas sizes as a feature; target 64×32 plus device-supplied `width`/`height` (the Koios fork already renders dimension-aware — see §10).
- Not per-frame streaming or transport — that's the render-plane/firmware layer, out of scope here (this engine just produces bytes + a hash).

---

## 3. Target architecture

### 3.1 Data flow (production)
```
device ──HTTPS GET /render/{installation}  If-None-Match: <sha>──▶ matrx-render Worker (host)
                                                                     │
   ┌─────────────────────────────────────────────────────────────── │
   │ 1. resolve app bundle (R2 registry, by appId@version)           │
   │ 2. env.LOADER.get(appId@version, { modules, injected stdlib,    │
   │                                     egress allowlist, limits })  │  ← app runs in ISOLATE
   │ 3. isolate.render(config, {width,height,now,seed}) ─▶ WidgetTree (JSON)
   │ 4. HOST: layout(tree) ─▶ rasterize ─▶ encode WebP  (fonts + WASM encoder live in host)
   │ 5. sha256(webp) = ETag ; If-None-Match match ⇒ 304 ; else 200 + Cache-Control
   └─────────────────────────────────────────────────────────────────
```

### 3.2 Key architectural decisions (make these; don't re-litigate)

| # | Decision | Rationale |
|---|----------|-----------|
| **D1** | **App isolate returns a serializable widget tree (VDOM); the trusted HOST does layout + rasterize + encode.** | Keeps WASM encoder, fonts, image decoders out of every app isolate (smaller, faster isolates); untrusted app code can't tamper with encoding; consistent output. Apps never need pixel measurement synchronously (Pixlet apps don't either). |
| **D2** | **Isolate runtime = Cloudflare Worker Loader (prod) / workerd via Miniflare (local).** | Same runtime in dev and prod ("works locally = works in prod"). Worker Loader is CF's supported "sandbox untrusted code, lighter than containers" primitive with per-isolate bindings, egress control, and CPU/subrequest limits. |
| **D3** | **Pure builders (`render`, `schema`, `animation`) are bundled into the app; effectful stdlib (`http`, `cache`, `secret`, `time`, `random`, `file`) is HOST-injected.** | The host controls caching, egress, secrets, and the clock — the levers that enforce determinism and security. App import surface stays unified via `@matrx/sdk`. |
| **D4** | **Output = animated WebP via WASM libwebp; default `maxDuration` 15000ms (0 if `showFullAnimation`); also expose raw RGBA frames for tests/preview.** | Matches the firmware decoder and current `matrx-renderer` behavior (`processor.go` maxDuration 15000/0). |
| **D5** | **Determinism is a hard contract (§8): injected quantized clock, seeded RNG, TTL-cached HTTP.** | The rendered bytes' sha256 is the ETag for the edge-cache/fan-out render plane. Non-deterministic renders break caching. |
| **D6** | **Monorepo, pnpm workspaces + Turborepo.** | Multiple packages, shared types, one CI. |

### 3.3 Package layout
```
matrx-render/                      (new repo)
  packages/
    render/    @matrx/render       # layout engine, rasterizer, BDF fonts, image decode, WebP/GIF encode (WASM)
    sdk/       @matrx/sdk          # app authoring API: render widgets, schema builders, stdlib TYPES
    stdlib/    @matrx/stdlib       # host-injected effectful modules (http/cache/secret/time/random/file)
    runtime/   @matrx/runtime      # host: load app into isolate, run, produce WebP; the production Worker
    cli/       @matrx/cli          # `matrx` dev/render/check/test/new/bundle
    codemod/   @matrx/codemod      # Starlark → TS porting tool
  apps/                            # first-party / ported apps (each: manifest.json + app.ts + assets/)
  examples/
  fixtures/                        # golden-image parity fixtures vs Go renderer
```

---

## 4. The app authoring model (the DX centerpiece)

### 4.1 An app is a directory
```
apps/spotify/
  manifest.json          # metadata + schema pointer + allowedHosts (see §4.3)
  app.ts                 # entry: default export = render(); named export getSchema()
  lib/parse.ts           # optional local modules
  assets/logo.png        # optional bundled assets (imported as bytes)
  package.json           # optional; declares vetted deps
  app.test.ts            # golden-image / unit tests
```

### 4.2 Example `app.ts` (conveys the whole API shape)
```ts
import { Root, Row, Column, Text, Image, Marquee } from "@matrx/sdk/render";
import { schema, type Schema, type Config } from "@matrx/sdk/schema";
import { http, time } from "@matrx/sdk/stdlib";
import logo from "./assets/logo.png";           // → Uint8Array at build time

export function getSchema(): Schema {
  return {
    version: "1",
    fields: [
      schema.oauth2({
        id: "auth", name: "Spotify", icon: "spotify",
        handler: "onAuth",                        // handler referenced by exported name
        clientId: "", authorizationEndpoint: "https://accounts.spotify.com/authorize",
        scopes: ["user-read-playback-state"],
        pkce: true, userDefinedClient: true,      // Koios fork parity — see §10
      }),
      schema.toggle({ id: "art", name: "Album art", default: true }),
    ],
  };
}

// default export is the renderer. It MAY be async (await http) — an ergonomic win over Starlark.
export default async function render(config: Config): Promise<Root> {
  const token = config.string("auth");
  const res = await http.get("https://api.spotify.com/v1/me/player", {
    headers: { Authorization: `Bearer ${token}` },
    ttlSeconds: 15,                               // caching → determinism + upstream fan-out
  });
  if (res.status === 204) return Root({ child: Text({ content: "Not playing" }) });
  const np = res.json();

  return Root({
    delay: 100,
    child: Row({
      children: [
        config.bool("art") ? Image({ src: logo, width: 32, height: 32 }) : null,
        Column({
          expanded: true, mainAlign: "center",
          children: [
            Marquee({ width: 32, child: Text({ content: np.item.name, font: "tb-8" }) }),
            Text({ content: np.item.artists[0].name, color: "#1DB954" }),
          ],
        }),
      ],
    }),
  });
}

// schema handler — invoked by the host via a separate isolate entrypoint (§9.3)
export function onAuth(token: string): string { return token; }
```

DX properties to guarantee:
- **Full type safety** on widgets, config accessors (`config.string/bool/int`), schema builders, and stdlib. This is the headline advantage over Starlark.
- **`render` can be async** and use `await` for HTTP. (Pixlet is synchronous; we improve on it. The host awaits the promise.)
- **Falsy children are skipped** (`null`/`false`/`undefined` in `children[]`) so conditional layout reads naturally.
- **Assets imported as bytes** via a build-time loader (`import logo from "./assets/logo.png"` → `Uint8Array`).

### 4.3 `manifest.json`
Port the current fields (`matrx-renderer/pkg/models/manifest.go`: id, name, summary, desc, author, fileName, packageName) and add engine needs:
```jsonc
{
  "id": "spotify",
  "name": "Spotify",
  "summary": "Now playing",
  "desc": "Shows current Spotify track",
  "author": "…",
  "entry": "app.ts",
  "allowedHosts": ["api.spotify.com", "accounts.spotify.com"],  // egress allowlist (§9.2)
  "schemaVersion": "1"
}
```
> Decision to confirm with team: keep `manifest.yaml` for parity with the 516 existing apps, or move to `manifest.json`/`package.json`. Recommendation: `manifest.json` for new apps; codemod converts old YAML.

---

## 5. Widget API to port (from `pixlet/render/`)

Reproduce these as TS tree-constructor functions returning plain data nodes (`{ type, props, children }`). **Layout/paint semantics must match Pixlet** — cite `pixlet/render/<file>.go` per widget. Canvas defaults: `width=64, height=32, maxFrameCount=2000` (`render/root.go`).

| Widget | Key props (defaults) | Semantics / source |
|---|---|---|
| **Root** | `child` (req), `delay=0` ms, `maxAge=0` s, `showFullAnimation=false`, `width`, `height` | Canvas root; frame delay & animation flags. `render/root.go` |
| **Box** | `child`, `width=0`(expand), `height=0`, `padding=0`, `color`(transparent) | Child centered; padding shrinks child. `render/box.go` |
| **Row** | `children` (req), `mainAlign="start"`, `crossAlign="start"`, `expanded=false` | Horizontal; width=Σchild, height=max; aligns start/end/center/space_*. `render/row.go`, `render/vector.go` |
| **Column** | same as Row | Vertical; height=Σchild, width=max. `render/column.go` |
| **Stack** | `children` (req) | Z-layer, painted in order, later on top. `render/stack.go` |
| **Padding** | `child` (req), `pad`(Insets l/t/r/b), `expanded=false`, `color` | Offsets child by insets (negative allowed). `render/padding.go` |
| **Text** | `content` (req), `font="tb-8"`, `height=0`(auto), `offset=0`, `color=white` | Single line, no wrap, max width 1000. Needs measure at layout. `render/text.go` |
| **WrappedText** | `content` (req), `font="tb-8"`, `width=0`, `height=0`, `lineSpacing=0`, `color=white`, `align="left"` | Word-wrap within bounds. `render/wrappedtext.go` |
| **Image** | `src` (req bytes), `width=0`, `height=0`, `delay`(ro) | Decode WebP/GIF/PNG/JPEG/SVG; nearest-neighbor scale; aspect preserved if one dim. Animated GIF → frames + disposal modes. `render/image.go` |
| **Circle** | `child`, `color` (req), `diameter` (req) | Filled circle; child centered. `render/circle.go` |
| **PieChart** | `colors[]`, `weights[]`, `diameter` | Arc = weight/Σ·2π; colors cycled. `render/pie_chart.go` |
| **Plot** | `data[[x,y]]`, `width`, `height`, `color=white`, `colorInverted`, `xLim`, `yLim`(NaN=auto), `fill=false`, `fillColor`(dampened 0x55), `chartType="line"|"scatter"` | XY line/scatter. `render/plot.go` |
| **Starfield** | (fixed effect) | 300-frame, 60-star 3D field. `render/starfield.go` — low priority. |
| **Animation** | `children[]` (each child = one frame) | `frameCount = len(children)`. `render/animation.go` |
| **Marquee** | `child` (req), `width`/`height`, `scrollDirection="horizontal"`, `offsetStart=0`, `offsetEnd=0`, `align="start"`, `delay=0`, `endDelay=0`, `loop=false` | Scroll with clip viewport; frame-count formulas in `render/marquee.go` (reproduce exactly). |
| **Sequence** | `children[]`, `duration=0` | duration≤0 → Σ child frames; >0 → loop to fill. `render/sequence.go` |
| **Transformation** | `child`, `keyframes[]`, `duration`, `delay=0`, `width`, `height`, `origin=(.5,.5)`, `direction="normal"`, `fillMode="forwards"`, `rounding="round"`, `waitForChild=false` | CSS-like keyframe anim. `render/animation/transformation.go` |

### 5.1 Widget contract (mirror `render/widget.go`)
Each node needs: `paintBounds(bounds, frameIdx) → rect`, `paint(ctx, bounds, frameIdx)`, `frameCount()`; optional `init()` (Text/Image/WrappedText) and static `size()`. The **layout engine** (`render/vector.go`) drives Row/Column main/cross alignment + `expanded` + clipping. Reproduce the two-phase `paintBounds` (intrinsic size negotiation) → `paint` model.

### 5.2 Animation subsystem (`render/animation/`)
- **Easing curves** (`curve.go`): `linear (0,0,0,0)`, `ease_in (.3,0,1,1)`, `ease_out (0,0,0,1)`, `ease_in_out (.65,0,.35,1)`, `cubic-bezier(a,b,c,d)`. Support a custom-function curve too.
- **Transforms** (interpolable): `Rotate(deg)` shortest-path, `Scale(x,y)` default 1, `Translate(x,y)` with rounding policy. Applied in list order (no matrix composition).
- **Directions:** normal / reverse / alternate / alternate-reverse (affects frame count). **FillModes:** forwards / backwards. Auto-insert 0%/100% keyframes if missing.

### 5.3 Fonts (`render/fonts.go`, `fonts_raw.go`)
Port all 12 bundled BDF fonts, **same names**: `10x20, 5x8, 6x9, 6x10, 6x10-rounded, 6x13, CG-pixel-3x5-mono, CG-pixel-4x5-mono, Dina_r400-6, tb-8 (default), terv9n, tom-thumb`. Parse BDF → compact glyph atlas at build time, embed in `@matrx/render`. Text height = ascent+descent unless overridden. **Verify font licenses carry over (OFL/public).**

### 5.4 Colors (`render/colors.go`)
`ParseColor`: `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA` → NRGBA. Default white.

### 5.5 Encoders (`pixlet/encode/`)
- **WebP** (`webp.go`): animated, via WASM libwebp (`tidbyt/go-libwebp` is the Go analog; use a WASM libwebp build). `kMin=0,kMax=0`. Per-frame delays from Root `delay`. `maxDuration` cap.
- **GIF** (`gif.go`): optional; median-cut quantize (≤256 colors), delays in 1/100s.
- Defaults: `DefaultScreenDelayMillis=50`, `DefaultMaxAgeSeconds=0`.
- Also expose **raw RGBA frame array** output (for tests, preview, and possible future firmware formats).

---

## 6. Injected stdlib to port (from `pixlet/runtime/modules/*`)

Effectful modules are **host-injected** (D3). Pure helpers can be bundled. Registration reference: `runtime/applet.go:574-671`.

| Module | Surface (condensed) | Notes / determinism |
|---|---|---|
| **http** | `get/post/put/patch/delete/options(url, {params,headers,body,formBody,jsonBody,auth,ttlSeconds})` → `{url,status,headers,body(),json()}` | **Host-injected.** `ttlSeconds` → cache in KV/Cache API keyed by (method,url,body). Enforce allowlist (§9.2), timeout, response-size cap. `runtime/modules/starlarkhttp/`. |
| **cache** | `get(key)→string|null`, `set(key,val,ttl=60)` | **Host-injected.** Scoped `pixlet:{appId}:{key}`. `runtime/cache.go`. |
| **secret** | `decrypt(ciphertext)→string|null`, `encrypt(pt)→string` | **Host-injected.** Per-app key scoping. Reproduce Tink hybrid (RSA-2048+AES-GCM) or a modern equivalent; keep ciphertext format migratable. `runtime/secret.go`. |
| **time** | `now()`, `parse_time`, `parse_duration`, `time(...)`, tz (IANA), `.year/.month/... .unix` | **Host-injected `now()` returns the QUANTIZED render time (§8), not wall-clock.** Starlib `lib/time`. |
| **random** | `number(min,max)`, `seed(n)` | **Host-injected seed** = hash(appId,config,timeBucket). Pixlet uses a 15s seed window (`randomSeedWindow=15`) — replicate deterministically. `runtime/modules/random/`. |
| **math** | pi,e,inf,nan; ceil/floor/round/sqrt/pow/log/exp/trig/… | Pure. Starlib `lib/math`. |
| **humanize** | time, relative_time, time_format, bytes, comma, ordinal, plural, word_series, url_encode/decode, ftoa, … | Pure. `runtime/modules/humanize/`. |
| **re** | compile/findall/match/search/sub (RE2) | Pure — RE2 semantics (JS `RegExp` differs; use an RE2 lib for parity). qri-io. |
| **json** | `encode/decode` | Native `JSON`. |
| **encoding/base64**, **encoding/csv** | base64 encode/decode; csv `read_all` | Pure. |
| **hash** | md5/sha1/sha256 (hex) | Pure (WebCrypto/JS). |
| **hmac** | md5/sha1/sha256(key,s,{binary,encoding}) | Pure. `runtime/modules/hmac/`. |
| **xpath** | `loads(xml).query/query_all/query_node/query_all_nodes` | HTML/XML XPath. `runtime/modules/xpath/`. |
| **html**, **bsoup** | escape/unescape; BeautifulSoup-like parse | qri-io. |
| **qrcode** | `generate(url,size,color,bg)` → PNG bytes; size small/med/large | `runtime/modules/qrcode/`. |
| **sunrise** | sunrise/sunset/elevation/elevation_time(lat,lng,date) | `runtime/modules/sunrise/`. |
| **geo**, **compress/gzip**, **compress/zipfile**, **file**, **assert** | GeoJSON; gzip; zip; app-asset access; test asserts | Port as needed; `assert` powers `matrx test`. |
| **render**, **animation**, **schema** | widget/anim/schema builders | **Pure — bundled into app** (D3). |

> Not every one of the 516 apps uses every module. Suggested priority: `http, cache, time, math, humanize, json, re, hash, encoding/*, secret, random, xpath/html, qrcode, sunrise`. Track per-module app usage from the corpus to sequence work.

---

## 7. Schema / config system (from `pixlet/schema/`)

Apps export `getSchema(): Schema`. Host serializes to JSON → drives the frontend config UI (`src/views/matrx/MatrxDeviceView.vue`). Config passed to `render(config)`; `config.width()/height()` supply canvas dims.

**Field types to port** (`schema/*.go`; each has `id`(req), `name`, `desc`, `icon`, `default`):

| Type | Builder | Value | Extra props |
|---|---|---|---|
| Text | `schema.text` | string | default |
| Toggle | `schema.toggle` | bool | default |
| Dropdown | `schema.dropdown` | string | `options: Option[]` (req), default (req) |
| Radio | `schema.radio` | string | options (req), default (req) |
| Location | `schema.location` | JSON {lat,lng} | — |
| LocationBased | `schema.locationBased` | string | `handler` (req) |
| DateTime | `schema.dateTime` | ISO string | — |
| Color | `schema.color` | hex | default, `palette: hex[]` |
| PhotoSelect (`png`) | `schema.photoSelect` | base64 PNG | — |
| Typeahead | `schema.typeahead` | string | `handler` (req) |
| **OAuth2** | `schema.oauth2` | token | `handler`, `authorizationEndpoint`, `scopes` (all req), `clientId`, `pkce`, `userDefinedClient` |
| Generated | `schema.generated` | (dynamic) | `source`, `handler` (req); no `icon` |
| GeoJSON | `schema.geoJson` | GeoJSON string | default, `collectPoint` |
| Notification | `schema.notification` | (builder) | `sounds: Sound[]`, `builder` |

Supporting: `Option{display,value}`, `Sound{id,title,file}`, `Handler{handler, type: Schema|Options|String|Field}`. **Validation rules** in `schema/schema.go:362-422` (e.g. `id` no `$`; `options` req for dropdown/radio; `handler` req for generated/locationbased/typeahead/oauth2) — port them into `matrx check`.

**Handlers** (LocationBased, Typeahead, Generated, OAuth2, Notification) are exported functions invoked via a **separate isolate entrypoint** (§9.3), not during `render`.

> **Koios fork parity (critical):** OAuth2 must support **`pkce` and `userDefinedClient`/user-provided client IDs** (fork commit `7620ce6`, used by Spotify). Don't drop these.

---

## 8. Determinism contract (load-bearing)

Rendered bytes MUST be a pure function of `(appId@version, config, timeBucket, cachedHttpResponses)`. Guarantees, all enforced by the **host-injected** stdlib:

1. **Clock:** `time.now()` returns a single **quantized render time** passed into the render call (e.g. floored to a bucket). Same bucket ⇒ same time ⇒ same output. No wall-clock reads.
2. **Randomness:** `random` seeded from `hash(appId, config, timeBucket)` (mirrors Pixlet's 15s window, but explicit).
3. **HTTP:** `http.get(ttlSeconds)` served from a shared cache keyed by request; within TTL every device/render sees identical bytes (also gives cross-device upstream fan-out and shields rate limits).
4. **Config:** already deterministic.

Output pipeline computes `ETag = sha256(webp)`. The render-plane Worker uses it for `304`/edge-cache fan-out. `matrx check` must **lint for determinism violations** (wall-clock use, `Date.now()`, non-seeded randomness, un-TTL'd fetches, disallowed globals).

---

## 9. Isolate runtime, bundling, sandboxing (`@matrx/runtime`)

> **Authorship decision (2026-07-05): third-party / community apps ARE in scope.** Strict multi-tenant isolation is therefore **mandatory, not optional**: dynamic per-app isolates via **Worker Loader** (consider **Workers for Platforms** dispatch namespaces for the catalog), per-app **egress allowlist**, enforced **CPU / subrequest limits**, per-app-scoped secrets & cache, and a **dependency-vetting pipeline**. The "first-party bundle-at-deploy" shortcut is **off the table** — treat all app code as untrusted.

### 9.1 Execution
- **Prod:** `env.LOADER.get(appId@version, () => ({ mainModule, modules, env: injectedStdlib, globalOutbound: egressController }))` → call the isolate's `render`/handler entrypoints (async, returns structured-cloneable tree/values). Keep isolates warm across requests via the stable id.
- **Local:** identical module run under `workerd` (Miniflare) so dev == prod.
- **Rasterization stays in the host Worker** (D1), not the app isolate.

### 9.2 Egress control
All app `http` calls route through the injected client → enforce per-app **`allowedHosts`** allowlist (manifest), timeout, response-size cap, subrequest count limit, and TTL caching. Untrusted app code cannot reach arbitrary hosts or read unshared secrets.

### 9.3 Entrypoints
- `render(config, {width,height,now,seed}) → WidgetTree`
- `getSchema() → Schema`
- `handler(name, input) → Option[] | Field[] | string` (for LocationBased/Typeahead/Generated/OAuth2/Notification)

### 9.4 Bundling
- **esbuild** bundles `app.ts` + local modules + vetted npm deps + the **pure** SDK (render/schema/animation) into one ESM module. Effectful stdlib marked external → resolved to host globals at load. Asset imports → bytes.
- Enforce: no `eval`/`new Function`, no Node builtins, **dependency allowlist/vetting**, bundle-size budget (app isolates stay small; WASM encoder/fonts are host-side, so budget is generous).
- Per-isolate **custom limits** (CPU, subrequests) via Worker Loader; render timeout parity with current 30s ceiling but target p50 ≪ 100ms.

### 9.5 App registry
Store built bundles + manifests in **R2**, addressed `appId@version`. The render Worker resolves bundles from R2; `matrx bundle`/CI publishes them. (Fits the existing pattern of `kd-firmware-api` serving artifacts from R2.)

---

## 10. Compatibility with current Koios behavior (`matrx-renderer`)

Preserve these observable behaviors (source: `matrx-renderer/internal/…`, and the fork):
- **Canvas:** default 64×32; `width`/`height` query params override; dimensions injected as `display_width/height` and readable via `config.width()/height()` (fork commit `665d55b`, thread-safe).
- **Output:** animated WebP; `maxDuration` 15000ms default, 0 if `showFullAnimation` (`processor.go:227-230,275-278`).
- **API parity target** for the render Worker: `POST /apps/{id}/render?width=&height=` → WebP (base64 or binary), `GET /apps/{id}/preview.webp`, `GET/POST /apps/{id}/schema` (get + validate). Match request/response shapes in `matrx-renderer/api/swagger.json` / `device-api/src/generated/matrx-renderer.d.ts` so `device-api` integration changes little.
- **OAuth PKCE / user-defined client IDs** (fork `7620ce6`).
- **`Screens.Empty()`** notion (fork `c290597`) — a render can be "empty" (clear display); represent explicitly.
- **Caching:** current service caches HTTP/schema (in-mem or Redis). Replace with CF cache/KV, honoring `ttlSeconds`.

---

## 11. Initial app scope & migration

**Decision (2026-07-05): do NOT migrate the ~516-app corpus yet.** Hand-write **three reference apps** in TS, chosen for capability coverage, to validate the engine end-to-end and act as golden fixtures:

| App | Exercises |
|---|---|
| **Maze generator** | Seeded-RNG **determinism** (same seed → same maze → same bytes), procedural drawing (Box/lines/Stack), zero external data. |
| **Countdown** | Injected **quantized clock**, Text/fonts, number formatting; a local-animation candidate. |
| **Spotify** | The hardest path: **OAuth2 PKCE / user-client**, `http` with `ttlSeconds` caching + egress allowlist, album-art **image decode**, `Marquee` scroll, async `render`. |

These three are the **parity / golden-image fixtures** (§13 acceptance): render under the TS engine, compare to the Go renderer within **perceptual tolerance**, and assert **byte-stable determinism**.

**Deferred (future phase, not now):** the `@matrx/codemod` Starlark→TS transpiler, bulk porting/curation of the 516-app corpus (top-N vs all — later product call), and dual-runtime cutover. Keep the Go `matrx-renderer` running for everything else; the TS engine initially serves only these reference apps (and any new apps).

---

## 12. CLI & DX (`@matrx/cli`, command `matrx`)

- **`matrx dev <app>`** — live preview server on `workerd`: renders in the real runtime; browser page shows the 64×32 output **magnified with an LED-grid look**, **hot-reload** on save, an **auto-generated config panel** from the app schema (tweak config live), a **frame scrubber** for animations, and a **network panel** of `http` calls with cache-hit/TTL annotations.
- **`matrx render <app> --config c.json [--width 64 --height 32] -o out.webp`** — one-shot.
- **`matrx check <app>`** — `tsc` typecheck + eslint + schema validation (§7 rules) + **determinism lint** (§8) + egress/deps policy + bundle-size.
- **`matrx test <app>`** — vitest with a `toMatchFrame`/golden-image matcher (deterministic output makes snapshots stable) + unit tests + `assert` module.
- **`matrx new <app>`** — scaffold manifest + app.ts + example test.
- **`matrx bundle <app>`** — produce/publish the deployable isolate bundle to R2.
- Ship a **docs site** + example apps. Full TS types everywhere = autocomplete + inline docs.

---

## 13. Suggested milestones (sequence for Fable)

| M | Deliverable | Acceptance |
|---|---|---|
| **M0** | Monorepo scaffold, package skeletons, CI, naming. | `pnpm build` green across packages. |
| **M1** | Core static engine: tree types + layout (Row/Column/Box/Stack/Padding/Text) + rasterizer→RGBA + BDF fonts + PNG out. | Golden parity vs Go for static fixtures. |
| **M2** | Animation (Root delay/frames, Animation, Marquee, Sequence, Transformation, curves) + **WebP encoder (WASM)** + Image decode (PNG/WebP/GIF). | Animated WebP parity fixtures. |
| **M3** | Remaining widgets (WrappedText, Circle, PieChart, Plot, Starfield) + JPEG/SVG decode. | Full widget parity set. |
| **M4** | `@matrx/sdk` + `@matrx/stdlib` with **determinism contract** (quantized clock, seeded RNG, TTL http, cache, secret, and the pure/util modules). | Deterministic: identical inputs → identical sha256. |
| **M5** | `@matrx/runtime`: Worker Loader host, esbuild bundling, egress control, limits, R2 registry, **production render Worker** (ETag/304/cache, dimensions API parity). | Render over HTTP with working ETag/304 + edge cache. |
| **M6** | Schema system (all field types) + handler entrypoint + **OAuth2 PKCE/user-client parity** + JSON schema contract feeding `MatrxDeviceView.vue`. | Frontend renders config UI from a TS app's schema. |
| **M7** | CLI + DX (dev/live-preview/hot-reload/config-panel/scrubber, check/test/new/bundle) + docs + examples. | A dev scaffolds→previews→deploys an app in <10 min. |
| **M8** | **Three reference apps** (maze generator, countdown, Spotify) + parity harness. Codemod / bulk corpus migration **deferred**. | The 3 apps pass perceptual parity + byte-stable determinism, served from the TS engine. |

**Global acceptance:** (a) **perceptual-tolerance** parity vs Go renderer across the reference apps (byte-exact WebP explicitly NOT required); (b) **byte-stable determinism** (identical inputs → identical sha256); (c) latency p50 CPU < ~100ms typical; (d) app isolate bundle within Worker limits; (e) DX bar in M7.

---

## 14. Decisions & open questions

**Locked (2026-07-05):**
- **Authorship:** third-party / community apps in scope → strict Worker-Loader / WfP isolation, egress allowlists, CPU limits, and dep vetting are mandatory (§9). Treat app code as untrusted.
- **Parity bar:** perceptual tolerance for pixels + byte-exact **determinism**. Byte-exact WebP is explicitly not a goal.
- **Initial scope:** three reference apps (maze generator, countdown, Spotify); no bulk corpus migration yet (§11).
- **Next step:** review this doc before any code — no implementation until sign-off.

**Still open:**
1. **Manifest format:** keep `manifest.yaml` (parity) or move to `manifest.json` / `package.json`?
2. **WASM libs + licenses/size:** libwebp build, resvg-wasm (SVG), PNG/JPEG/GIF decoders — pick and vet.
3. **Secret format:** re-implement Tink hybrid for compatibility with existing encrypted secrets, or re-encrypt on migration?
4. **RE2 parity:** adopt an RE2 WASM lib or accept minor `RegExp` divergence?
5. **Fonts:** confirm the 12 BDF font licenses permit redistribution in the TS package.
6. **Naming** of packages / CLI / product.

---

## 15. Source map (read these first)
- Widgets/layout/anim/fonts/encode: `pixlet/render/**`, `pixlet/encode/**`.
- Modules/stdlib: `pixlet/runtime/**` (registration `runtime/applet.go:574-671`).
- Schema: `pixlet/schema/**` (validation `schema/schema.go:362-422`).
- Koios usage + API + app format: `matrx-renderer/internal/**`, `matrx-renderer/pkg/models/manifest.go`, `matrx-renderer/api/swagger.json`.
- Fork deltas: `koiosdigital/pixlet` v0.38.0 (commits `7620ce6` PKCE/user-client, `665d55b` thread-safe dims, `c290597` `Screens.Empty`).
- Downstream contract: `device-api/src/generated/matrx-renderer.d.ts`; frontend `app/src/views/matrx/MatrxDeviceView.vue`.
