// Release versions are `1.0.<build>`; a local build carries a `-dev` suffix.

export function parseVersion(text: string): number[] {
  const parts: number[] = []
  for (const part of text
    .trim()
    .replace(/^[vV]/, '')
    .split(/[.\-+]/)) {
    if (!/^\d+$/.test(part)) break
    parts.push(Number(part))
  }
  return parts
}

export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a)
  const y = parseVersion(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return Math.sign(d)
  }
  return 0
}
