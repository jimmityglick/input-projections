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

function generateGridFlatRows(spec: DemoSeedSpec): EngineValue {
  const rows = spec.kind === "grid" ? spec.rows : 10;
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
    password: "SecurePass123!",
    confirm: "SecurePass123!",
  };
}

function generatePriceRangeFilter(): EngineValue {
  return {
    min_price: 100,
    max_price: 500,
  };
}

function generateEventBooking(): EngineValue {
  return {
    event_id: "EVT-2025-001",
    attendee_count: 3,
    start_date: "2025-06-15",
    end_date: "2025-06-17",
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
    applicant_name: "John Smith",
    email: "john.smith@example.com",
    phone: "+1-555-123-4567",
    resume_url: "https://example.com/resume.pdf",
    cover_letter: "I am excited to apply for this position...",
    years_experience: 5,
    available_start: "2025-02-01",
  };
}
