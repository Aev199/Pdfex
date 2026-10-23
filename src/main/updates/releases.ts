import { compareVersions } from './version'
import type { UpdateChannel, UpdateOffer } from '../../preload/app-types'

// What a GitHub release of PDFx carries: the portable ZIP and latest.json
// with the version, SHA-256 of the ZIP and the change list.

export const REPOSITORY = 'Aev199/Pdfex'
export const ZIP_ASSET = 'PDFx-Windows-Portable.zip'
export const MANIFEST_ASSET = 'latest.json'
// A release that only holds the newest ZIP for the browser link of the beta
// channel; it has no latest.json and is never offered as an update.
export const NEWEST_TAG = 'beta'

export const releasesUrl = (): string =>
  `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`

export function browserUrl(channel: UpdateChannel): string {
  return channel === 'stable'
    ? `https://github.com/${REPOSITORY}/releases/latest/download/${ZIP_ASSET}`
    : `https://github.com/${REPOSITORY}/releases/download/${NEWEST_TAG}/${ZIP_ASSET}`
}

export interface Candidate {
  version: string
  page: string
  zipUrl: string
  manifestUrl: string
  prerelease: boolean
}

interface GithubRelease {
  tag_name?: unknown
  html_url?: unknown
  draft?: unknown
  prerelease?: unknown
  assets?: { name?: unknown; browser_download_url?: unknown }[]
}

// The newest release the channel may take (stable skips pre-releases).
export function pickRelease(list: unknown, channel: UpdateChannel): Candidate | null {
  if (!Array.isArray(list)) throw new Error('unexpected answer from GitHub')
  let best: Candidate | null = null
  for (const release of list as GithubRelease[]) {
    if (release.draft === true || typeof release.tag_name !== 'string') continue
    if (release.tag_name === NEWEST_TAG) continue
    const prerelease = release.prerelease === true
    if (prerelease && channel === 'stable') continue
    const url = (name: string): string | undefined => {
      const asset = release.assets?.find((a) => a.name === name)
      return typeof asset?.browser_download_url === 'string'
        ? asset.browser_download_url
        : undefined
    }
    const zipUrl = url(ZIP_ASSET)
    const manifestUrl = url(MANIFEST_ASSET)
    if (!zipUrl || !manifestUrl) continue
    const candidate: Candidate = {
      version: release.tag_name.replace(/^[vV]/, ''),
      page: typeof release.html_url === 'string' ? release.html_url : '',
      zipUrl,
      manifestUrl,
      prerelease
    }
    if (!best || compareVersions(candidate.version, best.version) > 0) best = candidate
  }
  return best
}

export interface Manifest {
  version: string
  commit: string
  sha256: string
  notes: string[]
  channel: string
}

export function parseManifest(raw: unknown): Manifest {
  const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const text = (v: unknown): string => (typeof v === 'string' ? v : '')
  const sha256 = text(m.sha256).trim().toLowerCase()
  if (!text(m.version) || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error('the release description is incomplete')
  }
  return {
    version: text(m.version),
    commit: text(m.commit),
    sha256,
    notes: Array.isArray(m.notes) ? m.notes.filter((n): n is string => typeof n === 'string') : [],
    channel: text(m.channel)
  }
}

// latest.json must describe the very release it is attached to.
export function offerFrom(candidate: Candidate, manifest: Manifest): UpdateOffer {
  if (compareVersions(manifest.version, candidate.version) !== 0) {
    throw new Error('the release description does not match the release')
  }
  return {
    version: candidate.version,
    commit: manifest.commit,
    notes: manifest.notes,
    sha256: manifest.sha256,
    url: candidate.zipUrl,
    page: candidate.page,
    prerelease: candidate.prerelease
  }
}
