const THAI = /[฀-๿]/;

/**
 * `lang="th"` for a name or title with Thai in it. The app's own words are
 * English (`<html lang="en">`), so without it screen readers read Thai names
 * with an English voice. Spread onto the element that holds the text.
 */
export function langOf(text: string | null | undefined): { lang?: "th" } {
  return text && THAI.test(text) ? { lang: "th" } : {};
}
