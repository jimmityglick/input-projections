import type { Issue, Sigma } from "../dist/esm/index.js";
import { projectionPathToString } from "../dist/esm/index.js";

export function issuesForProjectionPath(sigma: Sigma, projectionPathString: string): Issue[] {
  const out: Issue[] = [];
  const seen = new Set<Issue>();
  for (const issue of sigma.issues) {
    if (projectionPathToString(issue.projectionPath) !== projectionPathString) continue;
    if (seen.has(issue)) continue;
    seen.add(issue);
    out.push(issue);
  }
  return out;
}

export function hasRelatedIssueForProjectionPath(sigma: Sigma, projectionPathString: string): boolean {
  for (const issue of sigma.issues) {
    if (issue.code !== "relation_failed") continue;
    const related = issue.relatedProjectionPaths;
    if (!related) continue;
    for (const rp of related) {
      if (projectionPathToString(rp) === projectionPathString) return true;
    }
  }
  return false;
}

export function createErrorElements(issues: readonly Issue[], baseId: string): HTMLElement[] {
  return issues.map((issue, idx) => {
    const el = document.createElement("small");
    el.id = `${baseId}-err-${idx}`;
    el.className = "error";
    el.textContent = issue.message;
    return el;
  });
}
