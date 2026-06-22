export const DRAWER_ITEM_IDS = [
  'session-notes',
  'queue',
  'questions',
  'handoff',
  'closure',
  'change-plan',
  'bp-change-workspace',
] as const;

export type DrawerItem = typeof DRAWER_ITEM_IDS[number];
