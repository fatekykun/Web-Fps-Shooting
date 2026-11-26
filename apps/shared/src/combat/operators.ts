export const operators = {
  standard: { name: 'Standard Operator' },
  ghost: { name: 'Ghost', model: 'ghost_character.glb' },
  'crimson-officer': {
    name: 'Crimson Officer',
    model: 'crimson_officer_character.glb',
  },
} as const;

export type OperatorId = keyof typeof operators;
export type ImportedOperator = Exclude<OperatorId, 'standard'>;

export function isOperator(value: unknown): value is OperatorId {
  return typeof value === 'string' && Object.hasOwn(operators, value);
}
