import version from '../version'

// Deliberately not overridable: every URL built here must have a digest pinned
// in `src/digests.json`.
export class ResourceUrls {
  static create(): ResourceUrls {
    return new ResourceUrls(this.defaultDomain)
  }

  private static readonly defaultDomain = 'https://github.com'
  private readonly domain: string

  private constructor(domain: string) {
    this.domain = domain
  }

  get baseUrl(): string {
    return `${this.domain}/cross-platform-actions`
  }

  get resourceBaseUrl(): string {
    return `${this.baseUrl}/resources/releases/download/${version.resources}`
  }
}
