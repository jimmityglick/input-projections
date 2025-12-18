import { createEngine } from "../dist/esm/index.js";
import type { ProjectionDefinition } from "../dist/esm/index.js";
import { createRendererImperative } from "./imperative/index";
import { createRendererVDOM } from "./vdom/index";
import { generateDemoValue } from "./demo_data";
import { resolveProjectionIncludes } from "./resolve_includes";

type RendererMode = "imperative" | "vdom";

function getRendererMode(): RendererMode {
  const stored = localStorage.getItem("renderer");
  if (stored === "vdom") return "vdom";
  // Back-compat for older localStorage values when this mode was named after the implementation.
  if (stored === "snabbdom") return "vdom";
  if (stored === "imperative") return "imperative";
  return "imperative";
}

function createRendererByMode(mode: RendererMode, dispatch: (action: import("../dist/esm/index.js").Action) => import("../dist/esm/index.js").State) {
  return mode === "vdom" ? createRendererVDOM(dispatch) : createRendererImperative(dispatch);
}

type FixtureKey =
  | "purchase-order"
  | "password-confirmation"
  | "price-range-filter"
  | "event-booking"
  | "fund-transfer"
  | "job-application"
  | "address-reuse"
  | "layout-showcase"
  | "deep-nesting"
  | "empty-list"
  | "union-all-variants"
  | "grid-flat-rows"
  | "grid-row-union"
  | "grid-full-power"
  | "cascading-geo-dropdowns"
  | "torture-test";

const FIXTURES: { key: FixtureKey; file: string; label: string }[] = [
  { key: "purchase-order", file: "purchase-order.json", label: "purchase-order" },
  { key: "password-confirmation", file: "password-confirmation.json", label: "password-confirmation" },
  { key: "price-range-filter", file: "price-range-filter.json", label: "price-range-filter" },
  { key: "event-booking", file: "event-booking.json", label: "event-booking" },
  { key: "fund-transfer", file: "fund-transfer.json", label: "fund-transfer" },
  { key: "job-application", file: "job-application.json", label: "job-application" },
  { key: "address-reuse", file: "address-reuse.json", label: "reuse: address-section.json" },
  { key: "layout-showcase", file: "layout-showcase.json", label: "layout: showcase" },
  { key: "grid-flat-rows", file: "grid-flat-rows.json", label: "grid: flat rows" },
  { key: "grid-row-union", file: "grid-row-union.json", label: "grid: row union" },
  { key: "grid-full-power", file: "grid-full-power.json", label: "grid: full power" },
  { key: "deep-nesting", file: "deep-nesting.json", label: "edge: deep nesting" },
  { key: "empty-list", file: "empty-list.json", label: "edge: empty list" },
  { key: "union-all-variants", file: "union-all-variants.json", label: "edge: union variants" },
  { key: "cascading-geo-dropdowns", file: "cascading-geo-dropdowns.json", label: "edge: 6-level cascade" },
  { key: "torture-test", file: "torture-test.json", label: "edge: torture test" },
];

const FIXTURE_MODULES = import.meta.glob<{ default: ProjectionDefinition }>("../tests/fixtures/*.json");
const FIXTURE_IMPORTERS: Record<string, () => Promise<{ default: ProjectionDefinition }>> = Object.fromEntries(
  Object.entries(FIXTURE_MODULES).map(([modulePath, loader]) => {
    const fileName = modulePath.split("/").pop();
    if (!fileName) throw new Error(`Invalid fixture module path: ${modulePath}`);
    return [fileName, loader];
  }),
);

async function loadRawFixture(file: string): Promise<ProjectionDefinition> {
  const importer = FIXTURE_IMPORTERS[file];
  if (!importer) throw new Error(`Unknown fixture file: ${file}`);
  const mod = await importer();
  return mod.default;
}

async function loadFixture(file: string): Promise<ProjectionDefinition> {
  const root = await loadRawFixture(file);
  const cache = new Map<string, Promise<ProjectionDefinition>>();
  const loadProjection = (refFile: string) => {
    if (!cache.has(refFile)) cache.set(refFile, loadRawFixture(refFile));
    return cache.get(refFile)!;
  };
  return resolveProjectionIncludes(root, { loadProjection, stack: [file] });
}

function fixtureFromHtml(): FixtureKey | null {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="rendererFixture"]');
  if (!meta) return null;
  const v = meta.content as FixtureKey;
  return v || null;
}

function getStoredFixture(): FixtureKey | null {
  const stored = localStorage.getItem("fixture");
  if (stored && FIXTURES.some((f) => f.key === stored)) return stored as FixtureKey;
  return null;
}

function mustGetEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

type SeedCallback = (rows?: number) => void;

function mountControls(
  container: HTMLElement,
  state: {
    selected: FixtureKey;
    rendererMode: RendererMode;
    onSelect: (k: FixtureKey) => void;
    onReset: () => void;
    onPrev: () => void;
    onNext: () => void;
    onSeed: SeedCallback;
  },
): void {
  const form = document.createElement("form");
  form.onsubmit = (e) => e.preventDefault();

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "1fr auto auto auto";
  grid.style.gap = "0.75rem";
  grid.style.alignItems = "end";

  const label = document.createElement("label");
  label.textContent = "Fixture";

  const select = document.createElement("select");
  for (const f of FIXTURES) {
    const opt = document.createElement("option");
    opt.value = f.key;
    opt.textContent = f.label;
    select.appendChild(opt);
  }
  select.value = state.selected;
  select.onchange = () => state.onSelect(select.value as FixtureKey);
  label.appendChild(select);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.textContent = "Reset value";
  resetBtn.onclick = state.onReset;

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.textContent = "Prev";
  prevBtn.onclick = state.onPrev;

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.textContent = "Next";
  nextBtn.onclick = state.onNext;

  grid.append(label, resetBtn, prevBtn, nextBtn);

  // Seed buttons row
  const seedRow = document.createElement("div");
  seedRow.style.display = "flex";
  seedRow.style.gap = "0.5rem";
  seedRow.style.flexWrap = "wrap";
  seedRow.style.alignItems = "center";

  const seedLabel = document.createElement("span");
  seedLabel.textContent = "Seed demo:";
  seedRow.appendChild(seedLabel);

  const isGridFixture = state.selected === "grid-flat-rows" || state.selected === "grid-row-union" || state.selected === "grid-full-power";

  if (isGridFixture) {
    // Grid fixture: offer multiple row counts
    for (const rowCount of [10, 100, 500]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `${rowCount} rows`;
      btn.onclick = () => state.onSeed(rowCount);
      seedRow.appendChild(btn);
    }
  } else {
    // Non-grid fixtures: single seed button
    const seedBtn = document.createElement("button");
    seedBtn.type = "button";
    seedBtn.textContent = "Seed value";
    seedBtn.onclick = () => state.onSeed();
    seedRow.appendChild(seedBtn);
  }

  const pages = document.createElement("p");
  pages.className = "secondary";
  pages.innerHTML =
    'Quick pages: <a href="/purchase-order.html">purchase-order</a>, <a href="/password-confirmation.html">password-confirmation</a>, <a href="/price-range-filter.html">price-range-filter</a>, <a href="/grid-flat-rows.html">grid-flat-rows</a>, <a href="/grid-row-union.html">grid-row-union</a>, <a href="/grid-full-power.html">grid-full-power</a>, <a href="/edge-cases.html">edge-cases</a>';

  const rendererInfo = document.createElement("p");
  rendererInfo.className = "secondary";
  const modeLabel = state.rendererMode === "vdom" ? "vdom" : "imperative";
  rendererInfo.append("Renderer: ");
  const strong = document.createElement("strong");
  strong.textContent = modeLabel;
  rendererInfo.append(strong, " — ");
  const switchLink = document.createElement("a");
  switchLink.href = "#";
  switchLink.textContent = "switch";
  switchLink.onclick = (e) => {
    e.preventDefault();
    const next: RendererMode = state.rendererMode === "vdom" ? "imperative" : "vdom";
    localStorage.setItem("renderer", next);
    window.location.reload();
  };
  rendererInfo.appendChild(switchLink);

  form.append(grid, seedRow, pages, rendererInfo);
  container.replaceChildren(form);
}

async function main(): Promise<void> {
  const appControls = mustGetEl<HTMLDivElement>("app-controls");
  const app = mustGetEl<HTMLDivElement>("app");

  const initial = fixtureFromHtml() ?? getStoredFixture() ?? "purchase-order";
  let currentFixture: FixtureKey = initial;

  const rendererMode = getRendererMode();

  const loadAndStart = async (fixtureKey: FixtureKey) => {
    currentFixture = fixtureKey;
    const fixture = FIXTURES.find((f) => f.key === fixtureKey) ?? FIXTURES[0];
    const projection = await loadFixture(fixture.file);

    const engine = createEngine(projection);
    const renderer = createRendererByMode(rendererMode, (action) => {
      const next = engine.dispatch(action);
      renderer.render(engine, app);
      return next;
    });

    const doReset = () => {
      engine.reset(undefined);
      renderer.render(engine, app);
    };

    const doSeed = (rows?: number) => {
      const spec = rows !== undefined ? { kind: "grid" as const, rows } : { kind: "default" as const };
      const value = generateDemoValue(fixtureKey, spec);
      if (value !== null) {
        engine.reset(value);
        renderer.render(engine, app);
      }
    };

    mountControls(appControls, {
      selected: fixtureKey,
      rendererMode,
      onSelect: (k) => {
        localStorage.setItem("fixture", k);
        void loadAndStart(k);
      },
      onReset: doReset,
      onSeed: doSeed,
      onPrev: () => {
        engine.prev();
        renderer.render(engine, app);
      },
      onNext: () => {
        engine.next();
        renderer.render(engine, app);
      },
    });

    renderer.render(engine, app);
  };

  await loadAndStart(currentFixture);
}

void main();
