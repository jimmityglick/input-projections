import type { VNode } from "snabbdom";
import type { Issue, Sigma } from "../../../dist/esm/index.js";
import { h } from "../patch";
import { projectionPathToString } from "../../utils";

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

export function viewErrors(
  issues: readonly Issue[],
  baseId: string,
): VNode[] {
  return issues.map((issue, idx) =>
    h("small.error", { props: { id: `${baseId}-err-${idx}` } }, issue.message)
  );
}

export type AriaErrorAttrs = {
  "aria-describedby"?: string;
  "aria-invalid"?: string;
};

export function computeAriaErrorAttrs(
  errorIds: string[],
  judgment: string,
): AriaErrorAttrs {
  const attrs: AriaErrorAttrs = {};
  if (errorIds.length > 0) {
    attrs["aria-describedby"] = errorIds.join(" ");
  }
  if (judgment === "Invalid" || judgment === "Incomplete") {
    attrs["aria-invalid"] = "true";
  }
  return attrs;
}
