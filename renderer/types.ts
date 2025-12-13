import type {
  Action,
  CompiledListNode,
  CompiledNode,
  CompiledReferenceNode,
  CompiledScalarNode,
  CompiledStructNode,
  CompiledUnionNode,
  Cursor,
  Engine,
  EngineValue,
  Issue,
  ProjectionPath,
  Sigma,
  State,
  ValuePath,
} from "../dist/esm/index.js";

export type DOMCache = Map<string, HTMLElement>;

export type DispatchFn = (action: Action) => State;

export type RenderContext = {
  cache: DOMCache;
  dispatch: DispatchFn;
};

export type Renderer = {
  render(engine: Engine, container: HTMLElement): void;
  destroy(): void;
};

export type {
  Action,
  CompiledListNode,
  CompiledNode,
  CompiledReferenceNode,
  CompiledScalarNode,
  CompiledStructNode,
  CompiledUnionNode,
  Cursor,
  Engine,
  EngineValue,
  Issue,
  ProjectionPath,
  Sigma,
  State,
  ValuePath,
};

