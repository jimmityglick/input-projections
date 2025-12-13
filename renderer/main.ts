import { createEngine } from "../dist/esm/index.js";
import type { ProjectionDefinition } from "../dist/esm/index.js";
import { createRenderer } from "./index";

type FixtureKey =
  | "purchase-order"
  | "password-confirmation"
  | "price-range-filter"
  | "event-booking"
  | "fund-transfer"
  | "job-application"
  | "deep-nesting"
  | "empty-list"
  | "union-all-variants";

const FIXTURES: { key: FixtureKey; file: string; label: string }[] = [
  { key: "purchase-order", file: "purchase-order.json", label: "purchase-order" },
  { key: "password-confirmation", file: "password-confirmation.json", label: "password-confirmation" },
  { key: "price-range-filter", file: "price-range-filter.json", label: "price-range-filter" },
  { key: "event-booking", file: "event-booking.json", label: "event-booking" },
  { key: "fund-transfer", file: "fund-transfer.json", label: "fund-transfer" },
  { key: "job-application", file: "job-application.json", label: "job-application" },
  { key: "deep-nesting", file: "deep-nesting.json", label: "edge: deep nesting" },
  { key: "empty-list", file: "empty-list.json", label: "edge: empty list" },
  { key: "union-all-variants", file: "union-all-variants.json", label: "edge: union variants" },
];

const FIXTURE_IMPORTERS: Record<string, () => Promise<{ default: ProjectionDefinition }>> = {
  "purchase-order.json": () => import("../tests/fixtures/purchase-order.json"),
  "password-confirmation.json": () => import("../tests/fixtures/password-confirmation.json"),
  "price-range-filter.json": () => import("../tests/fixtures/price-range-filter.json"),
  "event-booking.json": () => import("../tests/fixtures/event-booking.json"),
  "fund-transfer.json": () => import("../tests/fixtures/fund-transfer.json"),
  "job-application.json": () => import("../tests/fixtures/job-application.json"),
  "deep-nesting.json": () => import("../tests/fixtures/deep-nesting.json"),
  "empty-list.json": () => import("../tests/fixtures/empty-list.json"),
  "union-all-variants.json": () => import("../tests/fixtures/union-all-variants.json"),
};

async function loadFixture(file: string): Promise<ProjectionDefinition> {
  const importer = FIXTURE_IMPORTERS[file];
  if (!importer) throw new Error(`Unknown fixture file: ${file}`);
  const mod = await importer();
  return mod.default;
}

function fixtureFromHtml(): FixtureKey | null {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="rendererFixture"]');
  if (!meta) return null;
  const v = meta.content as FixtureKey;
  return v || null;
}

function mustGetEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function mountControls(
  container: HTMLElement,
  state: { selected: FixtureKey; onSelect: (k: FixtureKey) => void; onReset: () => void; onPrev: () => void; onNext: () => void },
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

  const pages = document.createElement("p");
  pages.className = "secondary";
  pages.innerHTML =
    'Quick pages: <a href="/purchase-order.html">purchase-order</a>, <a href="/password-confirmation.html">password-confirmation</a>, <a href="/price-range-filter.html">price-range-filter</a>, <a href="/edge-cases.html">edge-cases</a>';

  form.append(grid, pages);
  container.replaceChildren(form);
}

async function main(): Promise<void> {
  const appControls = mustGetEl<HTMLDivElement>("app-controls");
  const app = mustGetEl<HTMLDivElement>("app");

  const initial = fixtureFromHtml() ?? "purchase-order";
  let currentFixture: FixtureKey = initial;

  const loadAndStart = async (fixtureKey: FixtureKey) => {
    currentFixture = fixtureKey;
    const fixture = FIXTURES.find((f) => f.key === fixtureKey) ?? FIXTURES[0];
    const projection = await loadFixture(fixture.file);

    const engine = createEngine(projection);
    const renderer = createRenderer((action) => {
      const next = engine.dispatch(action);
      renderer.render(engine, app);
      return next;
    });

    const doReset = () => {
      engine.reset(undefined);
      renderer.render(engine, app);
    };

    mountControls(appControls, {
      selected: fixtureKey,
      onSelect: (k) => {
        void loadAndStart(k);
      },
      onReset: doReset,
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
