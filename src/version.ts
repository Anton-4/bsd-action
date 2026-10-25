// After changing a version, run `npm run update-digests` to pin the digests of
// the new release's files in `src/digests.json`.
const version = {
  operating_system: {
    freebsd: 'v0.17.0',
    netbsd: 'v1.1.0',
    openbsd: 'v0.15.0'
  },

  resources: 'v2.0.0'
}

export default version
