export type MetaObject = {
  label?: string;
  description?: string;
  hint?: string;
  layout?: string;
  clearable?: boolean;
  examples?: unknown[];
  tags?: string[];
};

export type FieldName = string;
export type VariantKey = string;
export type NodeId = string;

export type StringEnum = string[];

export type ScalarConstraints =
  | {
      type: "string";
      pattern?: string;
      minLength?: number;
      maxLength?: number;
      enum?: StringEnum;
    }
  | {
      type: "number";
      min?: number;
      max?: number;
      multipleOf?: number;
    }
  | {
      type: "boolean";
      enum?: boolean[];
    }
  | {
      type: "null";
    };

export type ReferenceFormat = {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  enum?: StringEnum;
};

export type RelationOperator = "eq" | "neq" | "gt" | "lt" | "gte" | "lte";

export type Relation = {
  op: RelationOperator;
  left: FieldName;
  right: FieldName;
  label: string;
};

export type ScalarNode = {
  id?: NodeId;
  meta?: MetaObject;
  kind: "Scalar";
  required?: boolean;
  scalar: ScalarConstraints;
};

export type StructNode = {
  id?: NodeId;
  meta?: MetaObject;
  kind: "Struct";
  fields: Record<FieldName, Node>;
  required?: FieldName[];
  relations?: Relation[];
};

export type UnionNode = {
  id?: NodeId;
  meta?: MetaObject;
  kind: "Union";
  discriminator: FieldName;
  variants: Record<VariantKey, Node>;
  default?: VariantKey;
};

export type ListNode = {
  id?: NodeId;
  meta?: MetaObject;
  kind: "List";
  item: Node;
  minItems?: number;
  maxItems: number;
  uniqueItems?: boolean;
};

export type ReferenceNode = {
  id?: NodeId;
  meta?: MetaObject;
  kind: "Reference";
  target: string;
  required?: boolean;
  format?: ReferenceFormat;
};

export type Node = ScalarNode | StructNode | UnionNode | ListNode | ReferenceNode;

export type ProjectionDefinition = {
  version: string;
  root: Node;
  meta?: MetaObject;
};
