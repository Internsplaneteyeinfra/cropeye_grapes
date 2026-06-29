/** Public folder paths — works in dev (/) and Render production (/grapes/). */
export function publicAsset(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const clean = path.replace(/^\//, "");
  return `${base}${clean}`;
}
