import type { EngineValue } from "../dist/esm/index.js";

export type DemoSeedSpec = { kind: "default" } | { kind: "grid"; rows: number };

/**
 * Generates a deterministic demo value for a specific fixture.
 * Same fixture key + same spec = identical value.
 */
export function generateDemoValue(
  fixtureKey: string,
  spec: DemoSeedSpec = { kind: "default" },
): EngineValue | null {
  switch (fixtureKey) {
    case "grid-flat-rows":
      return generateGridFlatRows(spec);
    case "grid-row-union":
      return generateGridRowUnion(spec);
    case "grid-full-power":
      return generateGridFullPower(spec);
    case "layout-showcase":
      return generateLayoutShowcase();
    case "purchase-order":
      return generatePurchaseOrder();
    case "password-confirmation":
      return generatePasswordConfirmation();
    case "price-range-filter":
      return generatePriceRangeFilter();
    case "event-booking":
      return generateEventBooking();
    case "fund-transfer":
      return generateFundTransfer();
    case "job-application":
      return generateJobApplication();
    default:
      return null;
  }
}

function generateLayoutShowcase(): EngineValue {
  return {
    list_vertical: [
      { label: "Alpha", value: 1 },
      { label: "Beta", value: 2 },
    ],
    list_grid: [
      {
        row_id: "row_0001",
        status: "new",
        entity: {
          type: "person",
          data: { first_name: "Ada", last_name: "Lovelace" },
        },
      },
      {
        row_id: "row_0002",
        status: "in_progress",
        entity: {
          type: "company",
          data: { company_name: "Acme Corp", tax_id: "US12345678" },
        },
      },
    ],
    date_range: {
      start_date: "2025-01-01",
      end_date: "2025-01-31",
    },
    coords: { x: 12.34, y: 56.78 },
    payment_tabs: {
      method: "card",
      data: { last4: "4242", zip: "94105" },
    },
    contact_radio: {
      kind: "email",
      data: { address: "user@example.com" },
    },
    mode_segmented: {
      mode: "basic",
      data: { enabled: true },
    },
  };
}

function generateGridFullPower(spec: DemoSeedSpec): EngineValue {
  const requestedRows = spec.kind === "grid" ? spec.rows : 10;
  const rows = Math.max(0, Math.min(500, Math.floor(requestedRows)));

  const statuses = ["new", "triage", "in_progress", "blocked", "done"];
  const priorities = [0, 1, 2, 3];
  const owners = Array.from({ length: 12 }, (_, idx) => `user_${idx.toString().padStart(3, "0")}`);
  const teams = ["team_ENG", "team_QAS", "team_DES", "team_OPS"];

  const titles = [
    "Fix login bug",
    "Ship onboarding flow",
    "Audit permissions",
    "Improve performance",
    "Document API",
    "Reduce flakiness",
    "Add monitoring",
    "Upgrade dependencies",
    "Refactor renderer",
    "Remove dead code",
    "Backfill data",
    "Improve accessibility",
  ];

  const bugSeverities = ["p0", "p1", "p2", "p3"];
  const components = ["comp_ui", "comp_api", "comp_data", "comp_auth"];

  const featureAreas = ["ui", "api", "data", "docs"];
  const featureEffort = [1, 2, 3, 5, 8, 13];

  const opsEnvs = ["dev", "staging", "prod"];
  const opsActions = ["reindex", "restart", "vacuum", "rotate_keys"];

  const arr: EngineValue[] = [];
  for (let i = 0; i < rows; i++) {
    const id = `WI-${(i + 1).toString().padStart(4, "0")}`;

    const dueDay = ((i % 28) + 1).toString().padStart(2, "0");
    const dueMonth = ((Math.floor(i / 28) % 12) + 1).toString().padStart(2, "0");
    const dueDate = `2025-${dueMonth}-${dueDay}`;

    const kind = i % 3 === 0 ? "bug" : i % 3 === 1 ? "feature" : "ops";

    let details: Record<string, EngineValue>;
    if (kind === "bug") {
      const data: Record<string, EngineValue> = {
        severity: bugSeverities[i % bugSeverities.length],
        repro: i % 2 === 0,
        component: components[i % components.length],
      };
      if (i % 4 === 0) data.ticket = `TKT-${(i % 100000).toString().padStart(5, "0")}`;
      if (i % 6 === 0) data.notes = "Intermittent in Safari";
      details = { kind: "bug", data };
    } else if (kind === "feature") {
      const data: Record<string, EngineValue> = {
        area: featureAreas[i % featureAreas.length],
        effort_points: featureEffort[i % featureEffort.length],
        customer_visible: i % 4 !== 0,
      };
      if (i % 5 === 0) data.epic_id = `EPIC-${(i % 10000).toString().padStart(4, "0")}`;
      if (i % 7 === 0) data.requester_id = `cust_${(i % 10000).toString().padStart(4, "0")}`;
      details = { kind: "feature", data };
    } else {
      const data: Record<string, EngineValue> = {
        environment: opsEnvs[i % opsEnvs.length],
        action: opsActions[i % opsActions.length],
        scheduled: i % 3 === 0,
      };
      if (i % 6 === 0) data.runbook_id = `RBK-${(i % 10000).toString().padStart(4, "0")}`;
      if (i % 4 === 0) data.oncall_id = `user_${((900 + i) % 1000).toString().padStart(3, "0")}`;
      details = { kind: "ops", data };
    }

    const row: Record<string, EngineValue> = {
      id,
      title: titles[i % titles.length],
      status: statuses[i % statuses.length],
      priority: priorities[i % priorities.length],
      owner_id: owners[i % owners.length],
      details,
    };

    if (i % 2 === 0) row.team_id = teams[i % teams.length];
    if (i % 3 !== 0) row.points = (i % 21) / 2;
    if (i % 4 === 0) row.due_date = dueDate;
    row.blocked = row.status === "blocked" || i % 11 === 0;

    arr.push(row);
  }
  return arr;
}

function generateGridFlatRows(spec: DemoSeedSpec): EngineValue {
  const requestedRows = spec.kind === "grid" ? spec.rows : 10;
  const rows = Math.max(0, Math.min(500, Math.floor(requestedRows)));
  const statuses = ["new", "in_progress", "blocked", "done"];
  const titles = [
    "Fix login bug",
    "Update dependencies",
    "Add user profile",
    "Refactor API",
    "Write tests",
    "Deploy to staging",
    "Review PR",
    "Document API",
    "Optimize queries",
    "Add dark mode",
    "Fix memory leak",
    "Update docs",
    "Add caching",
    "Fix styling",
    "Add validation",
  ];

  const arr: EngineValue[] = [];
  for (let i = 0; i < rows; i++) {
    arr.push({
      row_id: `row_${i.toString().padStart(4, "0")}`,
      title: titles[i % titles.length],
      status: statuses[i % statuses.length],
      amount: (i * 10) % 1000,
      active: i % 3 === 0,
      owner_id: `user_${(i % 100).toString().padStart(3, "0")}`,
    });
  }
  return arr;
}

function generateGridRowUnion(spec: DemoSeedSpec): EngineValue {
  const requestedRows = spec.kind === "grid" ? spec.rows : 10;
  const rows = Math.max(0, Math.min(500, Math.floor(requestedRows)));
  const statuses = ["new", "in_progress", "blocked", "done"];
  const titles = [
    "Fix login bug",
    "Update dependencies",
    "Add user profile",
    "Refactor API",
    "Write tests",
    "Deploy to staging",
    "Review PR",
    "Document API",
    "Optimize queries",
    "Add dark mode",
    "Fix memory leak",
    "Update docs",
    "Add caching",
    "Fix styling",
    "Add validation",
  ];

  const firstNames = ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Henry"];
  const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis"];
  const companyNames = [
    "Acme Corp",
    "Global Tech",
    "Swift Solutions",
    "Prime Industries",
    "Nova Systems",
    "Peak Ventures",
    "Core Dynamics",
    "Atlas Holdings",
  ];

  const arr: EngineValue[] = [];
  for (let i = 0; i < rows; i++) {
    const isCompany = i % 2 === 1;
    const entity = isCompany
      ? {
          type: "company",
          data: {
            company_name: companyNames[i % companyNames.length],
            contact_email: `contact${i}@${companyNames[i % companyNames.length].toLowerCase().replace(/\s+/g, "")}.com`,
          },
        }
      : {
          type: "person",
          data: {
            first_name: firstNames[i % firstNames.length],
            last_name: lastNames[i % lastNames.length],
            email: `${firstNames[i % firstNames.length].toLowerCase()}.${lastNames[i % lastNames.length].toLowerCase()}${i}@example.com`,
          },
        };

    arr.push({
      row_id: `row_${i.toString().padStart(4, "0")}`,
      title: titles[i % titles.length],
      status: statuses[i % statuses.length],
      owner_id: `user_${(i % 100).toString().padStart(3, "0")}`,
      entity,
    });
  }
  return arr;
}

function generatePurchaseOrder(): EngineValue {
  return {
    customer_id: "cust_001",
    items: [
      { sku: "SKU-001", qty: 2 },
      { sku: "SKU-002", qty: 1 },
    ],
    payment: {
      method: "card",
      data: { number: "4111111111111111" },
    },
  };
}

function generatePasswordConfirmation(): EngineValue {
  return {
    username: "user123",
    email: "user@example.com",
    password: "SecurePass123!",
    confirm_password: "SecurePass123!",
  };
}

function generatePriceRangeFilter(): EngineValue {
  return {
    category: "cat_001",
    min_price: 100,
    max_price: 500,
    min_rating: 1,
    max_rating: 5,
  };
}

function generateEventBooking(): EngineValue {
  return {
    event_name: "Quarterly Review",
    start_date: "2025-06-15",
    end_date: "2025-06-17",
    start_time: "09:00",
    end_time: "17:00",
  };
}

function generateFundTransfer(): EngineValue {
  return {
    source_account: "US12BANK1234567890123",
    destination_account: "GB82WEST1234567890123",
    amount: 1000,
    currency: "USD",
    memo: "Payment for services",
  };
}

function generateJobApplication(): EngineValue {
  return {
    applicant: {
      first_name: "John",
      last_name: "Smith",
      email: "john.smith@example.com",
    },
    salary_expectations: {
      minimum: 100000,
      maximum: 150000,
      ideal: 120000,
    },
    availability: {
      earliest_start: "2025-01-01",
      latest_start: "2025-02-01",
    },
    work_history: [{ company: "Acme Corp", start_year: 2020, end_year: 2024 }],
  };
}
