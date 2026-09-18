/**
 * App 2.0 scoped class names.
 *
 * `styles.module.css` hashes every class at build time so App 2.0 cannot
 * collide with the main app's utilities. html/body/:root stay global.
 * Jest's CSS-module proxy returns the original local name, so unit tests
 * that query `.spin` keep working.
 */

import s from './styles.module.css';

export default s;

export function cx(...parts: Array<string | false | 0 | null | undefined>): string {
  const names: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const name of String(part).split(/\s+/)) {
      if (!name) continue;
      const hashed = s[name];
      if (!hashed) {
        throw new Error(`app2 css: unknown class "${name}"`);
      }
      names.push(hashed);
    }
  }
  return names.join(' ');
}
