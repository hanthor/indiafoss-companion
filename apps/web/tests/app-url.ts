const configuredBase = process.env.PLAYWRIGHT_BASE_URL;
const productionBase = configuredBase ? new URL(configuredBase) : null;

/** Resolve an app route without losing a GitHub Pages project-site prefix. */
export function appUrl(path: string): string {
  if (!productionBase) return path;
  return new URL(path === '/' ? './' : path.replace(/^\//, ''), productionBase).toString();
}
