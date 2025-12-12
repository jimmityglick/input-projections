import type { ProjectionPath, ValuePath } from "./paths";

export type ParseIssue = {
  code: string;
  message: string;
  // JSON Pointer in the input projection document.
  path: string;
};

export type IssueSeverity = "error" | "info";

export type Issue = {
  severity: IssueSeverity;
  code: string;
  message: string;
  projectionPath: ProjectionPath;
  valuePath: ValuePath;
};
