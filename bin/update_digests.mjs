#!/usr/bin/env node

// Pins the sha256 digest of every file the action can download for the
// releases named in src/version.ts, writing them to src/digests.json. The
// digests are the ones GitHub computed when the assets were uploaded.
//
// Usage: npm run update-digests, or npm run check-digests for --check.
// Needs a Node version that strips TypeScript types (22.18 or later).
//
// --check exits non-zero instead of writing when src/digests.json is out of
// date, which also catches a release asset that was replaced after pinning.
//
// Set GITHUB_TOKEN (or GH_TOKEN) to avoid the API's anonymous rate limit.

import {readFileSync, writeFileSync} from 'node:fs'

import version from '../src/version.ts'

const owner = 'cross-platform-actions'
const digestsPath = new URL('../src/digests.json', import.meta.url)
const architectures = ['x86-64', 'arm64']
const hostResources = [
  'qemu-system-x86_64-linux.tar',
  'qemu-system-aarch64-linux.tar',
  'resources-linux.tar'
]

const releases = [
  ...Object.entries(version.operating_system).map(([os, tag]) => {
    const image = new RegExp(`^${os}-.+-(${architectures.join('|')})\\.`)
    return {repo: `${os}-builder`, tag, wanted: name => image.test(name)}
  }),
  {
    repo: 'resources',
    tag: version.resources,
    wanted: name => hostResources.includes(name),
    required: hostResources
  }
]

async function api(path) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  const headers = {Accept: 'application/vnd.github+json'}
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`https://api.github.com${path}`, {headers})
  if (!response.ok)
    throw Error(`GET ${path} failed: ${response.status} ${response.statusText}`)

  return response.json()
}

async function assetsOf(repo, tag) {
  const release = await api(`/repos/${owner}/${repo}/releases/tags/${tag}`)
  const assets = []

  for (let page = 1; ; page++) {
    const batch = await api(
      `/repos/${owner}/${repo}/releases/${release.id}/assets?per_page=100&page=${page}`
    )
    assets.push(...batch)
    if (batch.length < 100) return assets
  }
}

const digests = {}

for (const {repo, tag, wanted, required = []} of releases) {
  const assets = (await assetsOf(repo, tag)).filter(a => wanted(a.name))
  const missing = required.filter(n => !assets.some(a => a.name === n))

  if (assets.length === 0) throw Error(`${repo} ${tag} has no usable assets`)
  if (missing.length > 0)
    throw Error(`${repo} ${tag} is missing: ${missing.join(', ')}`)

  for (const asset of assets) {
    if (!/^sha256:[0-9a-f]{64}$/.test(asset.digest ?? ''))
      throw Error(`${repo} ${tag} ${asset.name} has no sha256 digest`)

    const url = `https://github.com/${owner}/${repo}/releases/download/${tag}/${asset.name}`
    digests[url] = asset.digest
  }
}

const sorted = Object.fromEntries(
  Object.entries(digests).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
)
const content = `${JSON.stringify(sorted, null, 2)}\n`

if (process.argv.includes('--check')) {
  if (readFileSync(digestsPath, 'utf8') !== content) {
    console.error(
      'src/digests.json is out of date (or a pinned asset changed). ' +
        'Run `npm run update-digests` and review the diff.'
    )
    process.exit(1)
  }
  console.log('src/digests.json is up to date')
} else {
  writeFileSync(digestsPath, content)
  console.log(`Pinned ${Object.keys(sorted).length} digests in src/digests.json`)
}
