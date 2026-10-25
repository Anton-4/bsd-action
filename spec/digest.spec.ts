import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

import * as digest from '../src/digest'
import digests from '../src/digests.json'
import versions from '../src/version'
import {Host} from '../src/host'
import * as architectureFactory from '../src/architectures/factory'
import * as architectureKind from '../src/architectures/kind'
import * as osFactory from '../src/operating_systems/factory'
import * as osKind from '../src/operating_systems/kind'
import '../src/operating_systems/freebsd/factory'
import '../src/operating_systems/netbsd/factory'
import '../src/operating_systems/openbsd/factory'

describe('digest', () => {
  describe('pinnedDigest', () => {
    it('throws for a URL without a pinned digest', () => {
      expect(() =>
        digest.pinnedDigest('https://example.com/a.qcow2')
      ).toThrowError(/^No digest is pinned for https:\/\/example.com\/a.qcow2/)
    })
  })

  describe('verify', () => {
    let file: string
    const content = 'disk image'
    const sha256 = crypto.createHash('sha256').update(content).digest('hex')

    beforeEach(() => {
      const directory = fs.mkdtempSync('/tmp/cpa-digest-spec-')
      file = path.join(directory, 'image')
      fs.writeFileSync(file, content)
    })

    it('accepts a file with the expected digest', async () => {
      await digest.verify(file, 'url', `sha256:${sha256}`)
      expect(fs.existsSync(file)).toBeTrue()
    })

    it('rejects and deletes a file with another digest', async () => {
      await expectAsync(
        digest.verify(file, 'url', `sha256:${'0'.repeat(64)}`)
      ).toBeRejectedWithError(
        /^Digest mismatch for url: expected sha256:0+, got sha256:[0-9a-f]{64}$/
      )
      expect(fs.existsSync(file)).toBeFalse()
    })
  })

  // Catches a change to how the URLs are built, or to src/version.ts, that
  // src/digests.json wasn't regenerated for.
  describe('src/digests.json', () => {
    const host = Host.create('linux')
    const image =
      /\/([a-z]+)-builder\/releases\/download\/[^/]+\/\1-(.+)-(x86-64|arm64)\.[a-z.0-9]+$/
    const images = Object.keys(digests).filter(url => image.test(url))

    it('pins an image for every operating system', () => {
      for (const name of Object.keys(versions.operating_system))
        expect(images.some(url => url.includes(`/${name}-builder/`)))
          .withContext(name)
          .toBeTrue()
    })

    for (const url of images) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const [, name, version, architecture] = image.exec(url)!

      it(`pins everything needed to boot ${name} ${version} ${architecture}`, () => {
        const kind = osKind.Kind.for(name)
        const arch = architectureFactory.create(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          architectureKind.toKind(architecture)!,
          host,
          kind,
          host.hypervisor
        )
        const os = osFactory.Factory.for(kind, arch).create(
          version,
          host.hypervisor
        )

        expect(os.virtualMachineImageUrl).toEqual(url)
        expect(() => digest.pinnedDigest(os.hypervisorUrl)).not.toThrow()
        expect(() => digest.pinnedDigest(os.resourcesUrl)).not.toThrow()
      })
    }
  })
})
