import * as fs from 'fs'
import * as os_module from 'os'
import * as path from 'path'

import NetBsd from '../../../src/operating_systems/netbsd/netbsd'
import * as hostModule from '../../../src/host'
import * as arch from '../../../src/architectures/factory'
import * as archKind from '../../../src/architectures/kind'
import * as os from '../../../src/operating_systems/kind'
import HostQemu from '../../../src/host_qemu'
import * as hypervisor from '../../../src/hypervisor'
import * as qemu from '../../../src/qemu_vm'
import * as netbsdQemuVm from '../../../src/operating_systems/netbsd/qemu_vm'
import {Input} from '../../../src/action/input'
import {Variant} from '../../../src/action/variant'
import * as vmModule from '../../../src/vm'

describe('NetBSD OperatingSystem', () => {
  class Host extends hostModule.Host {
    get vmModule(): typeof qemu {
      return qemu
    }

    override get qemu(): HostQemu {
      return new HostQemu.LinuxHostQemu()
    }

    override get hypervisor(): hypervisor.Hypervisor {
      return new hypervisor.Qemu()
    }

    override get efiHypervisor(): hypervisor.Hypervisor {
      return new hypervisor.QemuEfi()
    }

    override get defaultMemory(): string {
      return '6G'
    }

    override get defaultCpuCount(): number {
      return 6
    }
  }

  let host = new Host()
  let osKind = os.Kind.for('netbsd')
  let architecture = arch.create(
    archKind.Kind.x86_64,
    host,
    osKind,
    host.hypervisor
  )
  let netbsd = new NetBsd(architecture, '0.0.0')
  let hypervisorDirectory = 'hypervisor/directory'
  let resourcesDirectory = 'resources/directory'
  let firmwareDirectory = 'firmware/directory'
  let input = new Input(host)

  let config = {
    memory: '4G',
    cpuCount: 7,
    diskImage: '',
    resourcesDiskImage: ''
  }

  // Every NetBSD image is a bundle holding a raw disk and, where the platform
  // has one, a kernel -- not qcow2.
  it('downloads a bundled image', () => {
    expect(netbsd.virtualMachineImageUrl).toEqual(
      'https://github.com/cross-platform-actions/netbsd-builder/releases/' +
        `download/${netbsd.virtualMachineImageReleaseVersion}/` +
        'netbsd-0.0.0-x86-64.tar.zst'
    )
  })

  describe('createVirtualMachine', () => {
    it('creates a virtual machine with the correct configuration', () => {
      let qemuVmSpy = spyOn(netbsdQemuVm, 'Vm')

      netbsd.createVirtualMachine(
        hypervisorDirectory,
        resourcesDirectory,
        firmwareDirectory,
        input,
        config
      )

      expect(qemuVmSpy).toHaveBeenCalledOnceWith(
        hypervisorDirectory,
        resourcesDirectory,
        architecture,
        input,
        {
          ...config,
          ssHostPort: 2847,
          cpu: 'max',
          machineType: 'q35',
          firmware: `${firmwareDirectory}/share/qemu/bios-256k.bin`,
          microvmFirmware: `${firmwareDirectory}/share/qemu/qboot.rom`,
          kernel: `${resourcesDirectory}/kernel`
        }
      )
    })

    // The variant decides the class, and the files it needs have to be real
    // ones, since it refuses to boot without them.
    describe('the microvm variant', () => {
      let microvmInput: Input
      let resources: string
      let firmware: string

      beforeEach(() => {
        microvmInput = new Input(host)
        spyOnProperty(microvmInput, 'variant').and.returnValue(Variant.microvm)

        resources = fs.mkdtempSync(
          path.join(os_module.tmpdir(), 'cpa-resources-')
        )
        firmware = fs.mkdtempSync(
          path.join(os_module.tmpdir(), 'cpa-firmware-')
        )
      })

      let createVm = (): vmModule.Vm =>
        netbsd.createVirtualMachine(
          hypervisorDirectory,
          resources,
          firmware,
          microvmInput,
          config
        )

      it('creates a microvm machine', () => {
        fs.writeFileSync(path.join(resources, 'kernel'), '')
        fs.mkdirSync(path.join(firmware, 'share', 'qemu'), {recursive: true})
        fs.writeFileSync(path.join(firmware, 'share', 'qemu', 'qboot.rom'), '')

        expect(createVm()).toBeInstanceOf(netbsdQemuVm.MicrovmVm)
      })

      // Rather than quietly booting through the firmware, which would be
      // slower for a reason the job's author cannot see.
      it('fails when the image and hypervisor cannot boot it', () => {
        expect(createVm).toThrowError(/cannot be booted/)
      })
    })

    // Everything else keeps booting the way it did before the variant existed.
    it('creates a firmware machine by default', () => {
      const vm = netbsd.createVirtualMachine(
        hypervisorDirectory,
        resourcesDirectory,
        firmwareDirectory,
        input,
        config
      )

      expect(vm).toBeInstanceOf(netbsdQemuVm.Vm)
      expect(vm).not.toBeInstanceOf(netbsdQemuVm.MicrovmVm)
    })

    describe('supportedVariants', () => {
      it('offers the microvm variant', () => {
        expect(netbsd.supportedVariants).toEqual([
          Variant.default,
          Variant.microvm
        ])
      })
    })
  })
})
