import { compileProjection } from "./static/compile";
import { parseProjection } from "./static/parse";
import { judge } from "./logic/judge";
import { createEngine } from "./kinetic/engine";
import { ok } from "./shared/result";
import { projectionPathToString, valuePathToString } from "./shared/paths";

export type { Result } from "./shared/result";
export type {
  EngineValue,
  JsonArray,
  JsonObject,
  JsonScalar,
  JsonValue,
} from "./shared/json";
export type { ValuePath, ProjectionPath, ProjectionPathSegment } from "./shared/paths";
export type { ParseIssue, Issue } from "./shared/issues";

export type { ProjectionDefinition } from "./static/schema-types";
export type { CompiledProjection } from "./static/compile";

export type { Judgment } from "./logic/judgment";
export type { Sigma } from "./logic/judge";

export type { Action, Cursor, Engine } from "./kinetic/engine";

export {
  compileProjection,
  createEngine,
  judge,
  ok,
  parseProjection,
  projectionPathToString,
  valuePathToString,
};
