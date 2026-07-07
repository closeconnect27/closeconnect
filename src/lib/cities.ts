// Fixed city list, single source of truth -- previously duplicated as a
// local CITIES const in every filter bar and create/edit form. City values
// only ever come from this list -- never pass raw user text into the
// .or() filter strings in lib/queries/{communities,events}.ts, same
// reasoning as CATEGORIES in lib/categories.ts.
export const CITIES = ["Bengaluru", "Mumbai", "Delhi", "Chennai", "Hyderabad", "Pune"] as const;

export type City = (typeof CITIES)[number];

export const CITY_OPTIONS = CITIES.map((c) => ({ value: c, label: c }));

export function isCity(value: string): value is City {
  return (CITIES as readonly string[]).includes(value);
}
