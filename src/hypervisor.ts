import {Architecture} from './architecture'
import {getOrDefaultOrThrow} from './utility'

export enum Kind {
  qemu
}

export interface Hypervisor {
  get kind(): Kind
  get sshPort(): number
  get firmwareFile(): string
  get microvmFirmwareFile(): string
  get binaryDirectory(): string
  get efi(): Hypervisor
  getResourceUrl(architecture: Architecture): string
  resolve<T>(implementation: Record<string, T>): T
}

export class Qemu implements Hypervisor {
  protected readonly firmwareDirectory = 'share/qemu'

  get kind(): Kind {
    return Kind.qemu
  }

  get sshPort(): number {
    return 2847
  }

  get firmwareFile(): string {
    return `${this.firmwareDirectory}/bios-256k.bin`
  }

  // qboot, the firmware for QEMU's `microvm` machine type: it loads a directly
  // booted kernel and leaves behind the MP table. SeaBIOS does neither there,
  // so this is not interchangeable with the firmware above. A hypervisor
  // archive without the file keeps working, on the other boot path.
  get microvmFirmwareFile(): string {
    return `${this.firmwareDirectory}/qboot.rom`
  }

  get binaryDirectory(): string {
    return 'bin'
  }

  get efi(): Hypervisor {
    return new QemuEfi()
  }

  getResourceUrl(architecture: Architecture): string {
    return architecture.resourceUrl
  }

  resolve<T>(implementation: Record<string, T>): T {
    return getOrDefaultOrThrow(implementation, 'qemu')
  }
}

export class QemuEfi extends Qemu {
  override get firmwareFile(): string {
    return `${this.firmwareDirectory}/uefi.fd`
  }
}
