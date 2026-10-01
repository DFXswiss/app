export type CssModuleMap = Record<string, string>;

export function mergeStyleModules(styleModules: CssModuleMap[]): CssModuleMap {
  const merged = Object.create(null) as CssModuleMap;
  for (const styles of styleModules) {
    for (const [name, generated] of Object.entries(styles)) {
      merged[name] = merged[name] ? `${merged[name]} ${generated}` : generated;
    }
  }
  return merged;
}

export function createCx(styles: CssModuleMap, identityFallback?: CssModuleMap) {
  const hasEnumerableClasses = Object.keys(styles).length > 0;

  return (...parts: Array<string | false | 0 | null | undefined>): string => {
    const names: string[] = [];
    for (const part of parts) {
      if (!part) continue;
      for (const name of String(part).split(/\s+/)) {
        if (!name) continue;
        const hashed = styles[name] ?? (!hasEnumerableClasses ? identityFallback?.[name] : undefined);
        if (!hashed) {
          throw new Error(`app2 css: unknown class "${name}"`);
        }
        names.push(hashed);
      }
    }
    return names.join(' ');
  };
}
