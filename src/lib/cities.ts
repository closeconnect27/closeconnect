// Fixed city list, single source of truth -- previously duplicated as a
// local CITIES const in every filter bar and create/edit form. City values
// only ever come from this list -- never pass raw user text into the
// .or() filter strings in lib/queries/{communities,events}.ts, same
// reasoning as CATEGORIES in lib/categories.ts.
//
// Expanded from the original 6 to the old live site's actual CITY_LIST
// (reference/reference_current_events.html), the real list it used to
// populate both its event filter and its community/event city fields --
// not a guess. The old site also allowed a free-text "other" city beyond
// this list; that escape hatch isn't carried over here, matching this
// app's existing fixed-list-only validation.
export const CITIES = [
  "Bengaluru",
  "Mumbai",
  "Delhi",
  "Chennai",
  "Hyderabad",
  "Pune",
  "Kolkata",
  "Ahmedabad",
  "Jaipur",
  "Surat",
  "Lucknow",
  "Kochi",
  "Indore",
  "Bhopal",
  "Chandigarh",
  "Nagpur",
  "Visakhapatnam",
  "Coimbatore",
  "Thiruvananthapuram",
  "Patna",
] as const;

export type City = (typeof CITIES)[number];

export const CITY_OPTIONS = CITIES.map((c) => ({ value: c, label: c }));

export function isCity(value: string): value is City {
  return (CITIES as readonly string[]).includes(value);
}
