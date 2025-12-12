import type {
  ListNode,
  Node,
  ProjectionDefinition,
  ReferenceNode,
  ScalarNode,
  StructNode,
  UnionNode,
} from "./schema-types";

export type CompiledScalarNode = ScalarNode;
export type CompiledReferenceNode = ReferenceNode;
export type CompiledStructNode = Omit<StructNode, "fields"> & {
  fields: Record<string, CompiledNode>;
  fieldOrder: readonly string[];
  requiredSet: ReadonlySet<string>;
};
export type CompiledUnionNode = Omit<UnionNode, "variants"> & {
  variants: Record<string, CompiledNode>;
  variantOrder: readonly string[];
};
export type CompiledListNode = Omit<ListNode, "item"> & {
  item: CompiledNode;
};

export type CompiledNode =
  | CompiledScalarNode
  | CompiledStructNode
  | CompiledUnionNode
  | CompiledListNode
  | CompiledReferenceNode;

export type CompiledProjection = Omit<ProjectionDefinition, "root"> & {
  root: CompiledNode;
};

function compileNode(node: Node): CompiledNode {
  if (node.kind === "Struct") {
    const fieldOrder = Object.keys(node.fields);
    const requiredSet = new Set<string>(node.required ?? []);
    const compiledFields: Record<string, CompiledNode> = {};
    for (const key of fieldOrder) compiledFields[key] = compileNode(node.fields[key]);
    return {
      ...node,
      fields: compiledFields,
      fieldOrder,
      requiredSet,
    };
  }

  if (node.kind === "Union") {
    const variantOrder = Object.keys(node.variants);
    const compiledVariants: Record<string, CompiledNode> = {};
    for (const key of variantOrder) compiledVariants[key] = compileNode(node.variants[key]);
    return {
      ...node,
      variants: compiledVariants,
      variantOrder,
    };
  }

  if (node.kind === "List") {
    return {
      ...node,
      item: compileNode(node.item),
    };
  }

  return node;
}

export function compileProjection(projection: ProjectionDefinition): CompiledProjection {
  return {
    ...projection,
    root: compileNode(projection.root),
  };
}
