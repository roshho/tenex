export const CUISINES = [
  'Italian',
  'Mexican',
  'Chinese',
  'Indian',
  'Mediterranean',
  'American',
  'Japanese',
  'French',
  'Thai',
  'Middle Eastern',
] as const;

export type Cuisine = (typeof CUISINES)[number];
