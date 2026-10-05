import { z } from 'zod';
import { AnimationSchema, type Animation } from './animation';
import { responsive, type Responsive } from './responsive';
import { isSafeNodeId, toSafeNodeId } from './security';
import { StyleSchema, type StyleProps } from './style';

export const ConditionOperatorSchema = z.enum([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'notContains', 'in', 'notIn', 'empty', 'notEmpty', 'matches',
]);
export type ConditionOperator = z.infer<typeof ConditionOperatorSchema>;

export const ConditionSchema = z.object({
  field: z.string(),
  op: ConditionOperatorSchema,
  value: z.unknown().optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;

export interface ConditionGroup {
  match: 'all' | 'any';
  conditions: Array<Condition | ConditionGroup>;
}
export const ConditionGroupSchema: z.ZodType<ConditionGroup> = z.object({
  match: z.enum(['all', 'any']),
  get conditions() {
    return z.array(z.union([ConditionSchema, ConditionGroupSchema]));
  },
});

export const VisibilitySchema = z.object({
  hidden: responsive(z.boolean()).optional(),
  from: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  locales: z.array(z.string()).optional(),
});
export type Visibility = z.infer<typeof VisibilitySchema>;

export const CollectionBindingSchema = z.object({
  collection: z.string(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
  sort: z.object({ field: z.string(), direction: z.enum(['asc', 'desc']) }).optional(),
  filter: ConditionGroupSchema.optional(),
  /** Map of item-prop -> template, e.g. { title: '{{item.name}}', href: '/rooms/{{item.slug}}' } */
  map: z.record(z.string(), z.string()),
});
export type CollectionBinding = z.infer<typeof CollectionBindingSchema>;

/**
 * A component instance in the page tree. `type` must be registered in the
 * component registry; `props` are validated by that component's schema.
 */
export interface Node {
  id: string;
  type: string;
  variant?: string;
  name?: string;
  props: Record<string, unknown>;
  style?: StyleProps;
  animation?: Animation;
  visibility?: z.infer<typeof VisibilitySchema>;
  binding?: CollectionBinding;
  children?: Node[];
  locked?: boolean;
  hidden?: boolean;
  /** CSS scoped to this node. `&` refers to the node's root element. */
  customCss?: string;
  /** HTML id used for anchor links (`#rooms`). */
  anchor?: string;
  /** Locale -> partial props override. */
  translations?: Record<string, Record<string, unknown>>;
  /** Reference to a reusable global section (type === 'global-section'). */
  ref?: string;
}

/** Node ids end up in CSS selectors/class names: legacy unsafe ids are mapped to a stable safe id. */
const StoredNodeIdSchema = z.string().min(1).transform(toSafeNodeId);
/** Input ids that are not `[A-Za-z0-9_-]{1,64}` are dropped and re-assigned during normalization. */
const InputNodeIdSchema = z
  .string()
  .optional()
  .transform((v) => (isSafeNodeId(v) ? v : undefined));

export const NodeSchema: z.ZodType<Node> = z.object({
  id: StoredNodeIdSchema,
  type: z.string().min(1),
  variant: z.string().optional(),
  name: z.string().max(120).optional(),
  props: z.record(z.string(), z.unknown()),
  style: StyleSchema.optional(),
  animation: AnimationSchema.optional(),
  visibility: VisibilitySchema.optional(),
  binding: CollectionBindingSchema.optional(),
  get children() {
    return z.array(NodeSchema).optional();
  },
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  customCss: z.string().max(20_000).optional(),
  anchor: z.string().regex(/^[a-zA-Z][\w-]*$/).optional(),
  translations: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  ref: z.string().optional(),
});

/** Node input used by AI/import: ids optional, assigned during normalization. */
export interface NodeInput extends Omit<Node, 'id' | 'children' | 'props'> {
  id?: string;
  props?: Record<string, unknown>;
  children?: NodeInput[];
}
export const NodeInputSchema: z.ZodType<NodeInput> = z.object({
  id: InputNodeIdSchema,
  type: z.string().min(1),
  variant: z.string().optional(),
  name: z.string().max(120).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  style: StyleSchema.optional(),
  animation: AnimationSchema.optional(),
  visibility: VisibilitySchema.optional(),
  binding: CollectionBindingSchema.optional(),
  get children() {
    return z.array(NodeInputSchema).optional();
  },
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  customCss: z.string().max(20_000).optional(),
  anchor: z.string().regex(/^[a-zA-Z][\w-]*$/).optional(),
  translations: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  ref: z.string().optional(),
});

export type { Responsive };

/** Depth-first traversal. Return `false` from the visitor to skip children. */
export function walkNodes(nodes: Node[], visit: (node: Node, parent: Node | null, depth: number) => void | false, parent: Node | null = null, depth = 0): void {
  for (const node of nodes) {
    const res = visit(node, parent, depth);
    if (res !== false && node.children?.length) walkNodes(node.children, visit, node, depth + 1);
  }
}
