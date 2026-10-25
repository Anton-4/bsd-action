import * as crypto from 'crypto'
import * as fs from 'fs'

import pinnedDigests from './digests.json'

// The digest every downloaded file must have, keyed by URL. The files are
// release assets, which can be replaced after the fact, so a tag alone does not
// pin their content.
const digests: Readonly<Record<string, string>> = pinnedDigests

export function pinnedDigest(url: string): string {
  const digest = digests[url]

  if (digest === undefined)
    throw Error(
      `No digest is pinned for ${url}. Check that the operating system ` +
        'version and architecture are supported, or run ' +
        '`npm run update-digests` after changing src/version.ts.'
    )

  return digest
}

// Deletes the file before throwing, so that nothing can pick it up afterwards.
export async function verify(
  file: string,
  url: string,
  expected: string
): Promise<void> {
  const actual = `sha256:${await sha256(file)}`
  if (actual === expected) return

  fs.rmSync(file, {force: true})
  throw Error(`Digest mismatch for ${url}: expected ${expected}, got ${actual}`)
}

async function sha256(file: string): Promise<string> {
  const hash = crypto.createHash('sha256')

  return new Promise((resolve, reject) => {
    fs.createReadStream(file)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}
