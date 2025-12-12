export type Judgment = "Inactive" | "Invalid" | "Incomplete" | "Valid";

export function aggregateOverActive(children: readonly Judgment[]): Judgment {
  const active = children.filter((j) => j !== "Inactive");
  if (active.includes("Invalid")) return "Invalid";
  if (active.includes("Incomplete")) return "Incomplete";
  return "Valid";
}
