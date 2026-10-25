# BSD Action

A trimmed fork of [Cross-Platform Action][upstream] that runs workflow steps in
a FreeBSD, NetBSD or OpenBSD virtual machine on a Linux runner. It differs from
upstream in a few ways:

- **Every download is pinned by digest.** The disk images and QEMU archives are
  GitHub release assets, which can be replaced after a release is published.
  The action looks up each file's sha256 in [`src/digests.json`](src/digests.json)
  before downloading it, and fails if the file doesn't match.
- **No unpinned sources.** The `image_url` input and the `CPA_RESOURCE_URL`
  environment variable are gone, so every file the action boots comes from a
  URL with a pinned digest.
- **Only the BSDs.** FreeBSD, NetBSD and OpenBSD on `x86-64` and `arm64`.
  DragonFly BSD, MidnightBSD, Haiku, OmniOS, `riscv64` and VAX are removed.
- **SSH settings scoped to the VM.** `StrictHostKeyChecking accept-new` only
  applies to the VM's host entry, not every host the runner connects to.
- **No releases.** Use the action by commit SHA:
  `uses: Anton-4/bsd-action@<full commit sha>`.

### Updating

- **Pull upstream:** `git fetch upstream && git merge upstream/master`, then
  `npm ci --ignore-scripts && npm run all` to rebuild `dist/`. When the merge
  conflicts on a removed platform, keep it removed.
- **Bump an image or QEMU release:** change the tag in
  [`src/version.ts`](src/version.ts), run `npm run update-digests`, review the
  diff of `src/digests.json`, then `npm run all`.
- `npm run check-digests` (also run in CI) fails when the pinned digests no
  longer match what GitHub serves.

[upstream]: https://github.com/cross-platform-actions/action

## `Features`

Some of the features that this action supports include:

- Multiple operating systems with one single action
- Multiple versions of each operating system
- Non-x86_64 architectures
- Allows to use default shell or Bash shell
- Low boot overhead
- Fast execution
- Using the action in multiple steps in the same job

## `Usage`

### Minimal Example

Here's a sample workflow file which will run the given commands on FreeBSD 15.1.

```yaml
name: CI

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        shell: cpa.sh {0}

    steps:
      - uses: actions/checkout@v6

      - name: Start VM
        uses: Anton-4/bsd-action@<full commit sha>
        with:
          operating_system: freebsd
          version: '15.1'

      - name: Test
        run: |
          uname -a
          echo $SHELL
          pwd
          ls -lah
          whoami
          env | sort
```

### Full Example

Here's a sample workflow file which will set up a matrix resulting in five
jobs. One which will run on FreeBSD 15.1, one which runs OpenBSD 8.0, one which
runs NetBSD 11.0, one which runs OpenBSD 8.0 on ARM64 and one which runs NetBSD
11.0 on ARM64.

```yaml
name: CI

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        shell: cpa.sh {0}
    strategy:
      matrix:
        os:
          - name: freebsd
            architecture: x86-64
            version: '15.1'

          - name: openbsd
            architecture: x86-64
            version: '8.0'

          - name: openbsd
            architecture: arm64
            version: '8.0'

          - name: netbsd
            architecture: x86-64
            version: '11.0'

          - name: netbsd
            architecture: arm64
            version: '11.0'

    steps:
      - uses: actions/checkout@v6

      - name: Start VM on ${{ matrix.os.name }}
        uses: Anton-4/bsd-action@<full commit sha>
        env:
          MY_ENV1: MY_ENV1
          MY_ENV2: MY_ENV2
        with:
          environment_variables: MY_ENV1 MY_ENV2
          operating_system: ${{ matrix.os.name }}
          architecture: ${{ matrix.os.architecture }}
          version: ${{ matrix.os.version }}
          shell: bash
          memory: 5G
          cpu_count: 4

      - name: Test 1 on ${{ matrix.os.name }}
        run: |
          uname -a
          echo $SHELL
          pwd

      - name: Test 2 on ${{ matrix.os.name }}
        run: |
          ls -lah
          whoami
          env | sort
```

Different platforms need to run on different runners, so see the
[Runners](#runners) section below.

### Helper Script

When the action starts the VM, the `cpa.sh` helper is added to the runner's
`PATH` and can be used in subsequent steps. It runs commands inside the VM
and can also synchronize files or reboot the VM:

```
cpa.sh FILE [POST_FLAGS...]       # Run FILE inside the VM
cpa.sh --sync-files [DIRECTION]   # Synchronize files between the runner and the VM
cpa.sh --reboot                   # Reboot the VM and wait until it's reachable again
```

When `FILE` is given (typically via `shell: cpa.sh {0}`), files are
synchronized automatically: runner-to-vm before the file is executed and
vm-to-runner after. Pass `--sync-files DIRECTION` as a `POST_FLAG` to change
this. `DIRECTION` accepts:

- `both` (default) — sync runner-to-vm before and vm-to-runner after
- `none` — skip syncing entirely
- `runner-to-vm` — only sync runner-to-vm before the file runs
- `vm-to-runner` — only sync vm-to-runner after the file runs

`--reboot` may also be given as a `POST_FLAG` to reboot the VM after the file
has run (and after the post-sync, if any).

`--environment-variables NAME1 NAME2 ...` may be given as a `POST_FLAG` to
forward additional environment variables to the VM for that step, on top of the
ones declared via the action's [`environment_variables`](#inputs) input. List
the names separated by spaces and do not quote them (GitHub Actions splits the
`shell` line on spaces without honoring quotes). The named variables are read
from the step's environment (set them with `env:`), so they don't need to be
listed on the `Start VM` step.

```yaml
- name: Run a command inside the VM
  shell: cpa.sh {0}
  run: uname -a

- name: Run a command without syncing files
  shell: cpa.sh {0} --sync-files none
  run: uname -a

- name: Run a command and reboot afterwards
  shell: cpa.sh {0} --reboot
  run: sysctl -w some.setting=1

- name: Run a command with extra environment variables
  shell: cpa.sh {0} --environment-variables MY_ENV1 MY_ENV2
  env:
    MY_ENV1: value1
    MY_ENV2: value2
  run: echo "$MY_ENV1 $MY_ENV2"
```

Use the standalone forms when you don't need to run a command. In standalone
mode `--sync-files` defaults to `both` and runs the sync as a one-shot:

```yaml
- name: Sync files from the runner to the VM
  run: cpa.sh --sync-files runner-to-vm

- name: Reboot the VM
  run: cpa.sh --reboot
```

### Inputs

This section lists the available inputs for the action.

| Input                   | Required | Default Value     | Type    | Description                                                                                                                                                                                                                                                  |
|-------------------------|----------|-------------------|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `run`                   | ❌       | `""`              | string  | **Deprecated.** Runs command-line programs using the operating system's shell. This will be executed inside the virtual machine. Prefer the `cpa.sh` custom shell (`shell: cpa.sh {0}`) in subsequent steps instead.                                         |
| `operating_system`      | ✅       | ❌                | string  | The type of operating system to run the job on. See [Supported Platforms](#supported-platforms).                                                                                                                                                             |
| `architecture`          | ❌       | `x86-64`          | string  | The architecture of the operating system. See [Supported Platforms](#supported-platforms).                                                                                                                                                                   |
| `version`               | ✅       | ❌                | string  | The version of the operating system to use. See [Supported Platforms](#supported-platforms).                                                                                                                                                                 |
| `shell`                 | ❌       | `default`         | string  | The shell to use to execute the commands. Defaults to the default shell for the given operating system. Allowed values are: `default`, `sh` and `bash`                                                                                                       |
| `environment_variables` | ❌       | `""`              | string  | A list of environment variables to forward to the virtual machine. The list should be separated with spaces. The `CI` and any environment variables starting with `GITHUB_` are forwarded automatically.                                                     |
| `memory`                | ❌       | `6G`              | string  | The amount of memory for the virtual machine.                                                                                                                                                                                                                |
| `cpu_count`             | ❌       | `2`               | integer | The number of CPU cores for the virtual machine.                                                                                                                                                                                                             |
| `variant`               | ❌       | `default`         | string  | Which variant of the operating system to run. See [Variants](#variants-variant). Valid values are `default` and, where the platform has it, `microvm`.                                                                                                       |
| `sync_files`            | ❌       | `true`            | string  | Specifies if the local files should be synchronized to the virtual machine and in which direction. Valid values are `true`, `false`, `runner-to-vm` and `vm-to-runner`. `true` synchronizes files in both directions. `false` disables file synchronization. |
| `shutdown_vm`           | ❌       | conditional       | boolean | **Deprecated.** Specifies if the VM should be shutdown after the action has been run. If unset, defaults to `true` when `run` is provided and `false` otherwise. There is no replacement.                                                                    |

All inputs are expected to be of the specified type. It's especially important
that you specify `version` as a string, using single or
double quotes. Otherwise YAML might interpet the value as a numeric value
instead of a string, which leads to some unexpected behavior. If the
version is specified as `version: 13.0`, YAML will interpet `13.0` as a
floating point number, drop the fraction part (because `13` and `13.0` are the
same) and the GitHub action will only see `13` instead of `13.0`. The solution
is to explicitly state that a string is required by using quotes: `version:
'13.0'`.

#### Variants (`variant`)

A variant is a named configuration of a platform, not a set of independent
options. Asking for a variant a platform doesn't have is an error listing the
ones it does, rather than a silent fallback.

| Variant   | Available on | Description                                                                     |
|-----------|--------------|---------------------------------------------------------------------------------|
| `default` | everything   | The platform as it has always booted: firmware, boot loader, then the kernel.   |
| `microvm` | NetBSD 11 on `x86-64` | Boots the kernel directly on QEMU's `microvm` machine type, which has no boot loader, no PCI bus and no ACPI. |

```yaml
- uses: Anton-4/bsd-action@<full commit sha>
  with:
    operating_system: netbsd
    version: '11.0'
    variant: microvm
```

The `microvm` variant reaches a usable guest in roughly half the time, but it
is opt-in because it changes the hardware the guest sees, and a job that
inspects hardware will notice:

- the root disk is `ld0` (virtio-blk), not `sd0` (vioscsi)
- there is no PCI bus and no ACPI, so `pcictl` and anything reading ACPI differ
- the kernel is `MICROVM` rather than `GENERIC`, which `uname -v` reports
- bulk transfers into the guest are slower, virtio over MMIO having one
    interrupt line per device where PCI has a vector per queue

It also needs an image new enough to ship a kernel beside its disk. Asking for
it with an older image is an error rather than a slow boot.

## `Supported Platforms`

This sections lists the currently supported platforms by operating system. Each
operating system will list which versions are supported.

### [OpenBSD][openbsd_builder] (`openbsd`)

| Version | x86-64 | arm64  |
| ------- | ------ | ------ |
| 8.0     | ✅     | ✅     |
| 7.9     | ✅     | ✅     |
| 7.8     | ✅     | ✅     |
| 7.7     | ✅     | ✅     |
| 7.6     | ✅     | ✅     |
| 7.5     | ✅     | ✅     |
| 7.4     | ✅     | ✅     |
| 7.3     | ✅     | ✅     |
| 7.2     | ✅     | ✅     |
| 7.1     | ✅     | ✅     |
| 6.9     | ✅     | ✅     |
| 6.8     | ✅     | ❌     |

### [FreeBSD][freebsd_builder] (`freebsd`)

| Version | x86-64 | arm64  |
| ------- | ------ | ------ |
| 15.1    | ✅     | ✅     |
| 15.0    | ✅     | ✅     |
| 14.5    | ✅     | ✅     |
| 14.4    | ✅     | ✅     |
| 14.3    | ✅     | ✅     |
| 14.2    | ✅     | ✅     |
| 14.1    | ✅     | ✅     |
| 14.0    | ✅     | ✅     |
| 13.5    | ✅     | ✅     |
| 13.4    | ✅     | ✅     |
| 13.3    | ✅     | ✅     |
| 13.2    | ✅     | ✅     |
| 13.1    | ✅     | ✅     |
| 13.0    | ✅     | ✅     |
| 12.4    | ✅     | ✅     |
| 12.2    | ✅     | ❌     |

### [NetBSD][netbsd_builder] (`netbsd`)

| Version | x86-64 | arm64 |
|---------|--------|-------|
| 11.0    | ✅     | ✅    |
| 10.1    | ✅     | ✅    |
| 10.0    | ✅     | ✅    |
| 9.5     | ✅     | ❌    |
| 9.4     | ✅     | ❌    |
| 9.3     | ✅     | ❌    |
| 9.2     | ✅     | ❌    |

### Architectures

This section lists the supported architectures and any aliases. All the names
are case insensitive. For a combination of supported architectures and
operating systems, see the sections for each operating system above.

| Architecture | Aliases         |
|--------------|-----------------|
| `arm64`      | `aarch64`       |
| `x86-64`     | `x86_64`, `x64` |

### Hypervisors

This section lists the available hypervisors, which platforms they can run and
which runners they can run on.

| Hypervisor | Linux Runner | FreeBSD | NetBSD | OpenBSD |
|------------|--------------|---------|--------|---------|
| `qemu`     | ✅           | ✅      | ✅     | ✅      |

### Runners

This section lists the different combinations of platforms and on which runners
they can run.

| Runner    | OpenBSD | FreeBSD | NetBSD | ARM64 |
| --------- | ------- | ------- | ------ | ----- |
| **Linux** | ✅      | ✅      | ✅     | ✅    |

## `Linux on Non-x86 Architectures`

There are currently no plans to add support for Linux. Instead it's very easy
to support Linux on non-x86 architectures using the QEMU support in Docker with the
[docker/setup-qemu-action](https://github.com/docker/setup-qemu-action) action:

```yaml
- name: Set up QEMU
  uses: docker/setup-qemu-action@v3
  with:
    platforms: linux/riscv64

- name: Run Command in Docker
  run: |
    docker run \
      --rm \
      -v $(pwd):/${{ github.workspace }} \
      -w ${{ github.workspace }} \
      --platform linux/riscv64 \
      debian:unstable-slim \
      <command to run>
```

For those not familiar with Docker, here's an explanation of the above command:

* `run` - Runs a Docker container
* `--rm` - Removes the container after it exits
* `-v` - Mounts a local directory into the container. In this case the current
    directory is mounted to the same path in the container
* `-w` - Specifies the working directory inside the container
* `--platform` - Specifies the platform/architecture
* `debian:unstable-slim` - Specifies with image to create the container from.
    Basically the Linux distribution to use
* `<command to run>` - The command you want to run inside the container

## `Common Issues`

### FreeBSD Operating System Version Mismatch

#### Issue

When installing packages on FreeBSD you might see an error related to
mismatching of operating system or kernel version. This occurs because FreeBSD
only supports one minor version of the previous major version. Therefore
FreeBSD only has one package repository for each **major** version, not each
**minor** version. When a new minor version is released, all packages in the
repository are rebuilt targeting this new minor version. If you're on an older
minor version of the operating system the package manager will give you an
error.

For more information, see: https://www.freebsd.org/security/#sup and
https://www.freebsd.org/releases.

#### Solution

##### Alternative 1

The best solution is to upgrade to the latest supported minor version.

##### Alternative 2

If Alternative 1 is not possible, you can ignore the operating system version
mismatch by setting the `IGNORE_OSVERSION` environment variable with the value
`yes`. Ignoring the operating system version mismatch can lead to runtime
issues if the package depends on features or libraries only present in the
newer operating system version. Example:

```
env IGNORE_OSVERSION=yes pkg install <package>
```

Where `<package>` is the name of the package to install.

## Security

To report a security vulnerability, follow the guidelines described in the
[`security.md`](./security.md) document.

## `Under the Hood`

GitHub Actions currently only support macOS, Linux, and Windows. To be able to
run other platforms, this GitHub action runs the commands inside a virtual
machine (VM). If the host platform is macOS or Linux the hypervisor can take
advantage of nested virtualization.

All platforms run on the [QEMU][qemu] hypervisor. QEMU is a general purpose
hypervisor and emulator that runs on most host platforms and supports most
guest systems.

The VM images running inside the hypervisor are built using [Packer][packer].
It's a tool for automatically creating VM images, installing the guest
operating system and doing any final provisioning.

The GitHub action uses SSH to communicate and execute commands inside the VM.
It uses [rsync][rsync] to share files between the guest VM and the host. To
authenticate the SSH connection a unique key pair is used. This pair is
generated each time the action is run. The public key is added to the VM image
and the host stores the private key. A secondary hard drive, which is backed by
a file, is created. The public key is stored on this hard drive, which the VM
then mounts. At boot time, the secondary hard drive will be identified and the
public key will be copied to the appropriate location.

To reduce the time it takes for the GitHub action to start executing the
commands specified by the user, it aims to boot the guest operating systems as
fast as possible. This is achieved in a couple of ways:

- By downloading [resources][resources], like the hypervisor and a few other
  tools, instead of installing them through a package manager. Each download
  is checked against the sha256 pinned for its URL in `src/digests.json`

- The resources that are downloaded use no compression. The size is
  small enough anyway and it's faster to download the uncompressed data than
  it is to download compressed data and then uncompress it.

- It leverages `async`/`await` to perform tasks asynchronously. Like
  downloading the VM image and other resources at the same time

- It performs as much as possible of the setup ahead of time when the VM image
  is provisioned

## `Contributing`

### Changelog

The changelog is maintained in the [changelog.md](changelog.md) file, following
the [Keep a Changelog] format. The changelog is updated incrementally. That is,
for every new feature or bugfix, add an entry to the changelog. New entries are
added below the [Unreleased] section, with an appropriate sub header.

### Supporting a New Operating System Version

To add support for a new version of an existing operating system follow the
steps below:

#### In The *-builder` Repository

First, make the necessary changes in the appropriate [*-builder repository](https://github.com/orgs/cross-platform-actions/repositories?type=source&q=builder):

1. Add a new subdirectory under the `var_files` directory
1. Name the subdirectory after the new version, i.e. `14.3`
1. Add a `.pkrvars.hcl` file for each supported architecture
1. The content of the above files should be:

    ```hcl
    checksum = "<hash>"
    ```

    Where `<hash>` should be replaced with the hash of the install media. Make
    sure the hash value is prefixed with the hashing algorithm, example:

    ```hcl
    checksum = "sha256:1c41fdca8fcd8c746eb05f31a82a4bff2ad866c5fde1808f16b822a6df3f0de5"
    ```

    The hash of the install media can usually be found at a nearby URL where the
    install media is downloaded from. Exactly where to find this depends on the
    operating system. The URL for the install media can be found the main Packer
    configuration file in the `*-builder` repository.'

1. Add a new entry to the table in the readme containing supported versions and
    architectures.

1. Update the GitHub Action workflow with a new entry in the existing matrix of
    versions.

1. If there's a changelog file, update that as well
1. Create a pull request with the changes

##### By a Maintainer

1. Push a new tag to create a draft release
1. Publish the release

#### In the Action Repository

1. Update the [`src/version.ts`](src/version.ts) file with the new tag from the previous step
1. Pin the digests of the new release by running `npm run update-digests`
1. Compile the TypeScript by running `npm run all`

1. Update the [`.github/workflows/ci.yml`](.github/workflows/ci.yml) file by adding the new version to the existing
    matrix of versions of the operating system

1. Update the [`readme.md`](readme.md) file and add new entry in the version and
    architecture table of the operating system in the
    [`Supported Platforms`](https://github.com/cross-platform-actions/action#supported-platforms)
    section

1. If the new version is the latest version available of the operating system,
    update [`Full Example`](https://github.com/cross-platform-actions/action#full-example)
    section in the [`readme.md`](readme.md), both the description and the
    example usage of the GitHub action

1. Update the changelog: [`changelog.md`](changelog.md)

1. Create a pull request with all the changes

### Adding Support for a New Operating System

In addition to the steps below, a new builder repository for the operating
system needs to be added and implemented.

To add support for a new operating system, follow these steps:

1. **Create the Operating System Implementation**:
   * Create a new directory under `src/operating_systems` with the name of the
       operating system.
   * Implement the following files:
     * `qemu_vm.ts`: Define the virtual machine class for the operating system.
     * `<os_name>.ts`: Implement the operating system class extending the `Qemu`
         class.
     * `factory.ts`: Implement the factory class for the operating system.
     * Look at existing implementations, like FreeBSD or OpenBSD

2. **Write Tests**:
   * Create a corresponding directory under `spec/operating_systems` with the
       name of the operating system.
   * Write test files for the virtual machine and operating system classes.

3. **Update the Main Entry Point**:
   * Add an import for the new operating system's factory in `src/main.ts`.
   * Add its builder release to `src/version.ts` and run
       `npm run update-digests`.

4. **Update the CI Configuration**:
   * Add a new job for the operating system in `.github/workflows/ci.yml`.

5. **Update the [`readme.md`](readme.md)**:
   * Add the operating system to the
       [`Supported Platforms`](#supported-platforms) section.
   * Document any specific details or limitations of the operating system.

6. **Test the Implementation**:
   * Run the tests locally and ensure all tests pass.
   * Verify the CI pipeline runs successfully for the new operating system.

7. **Submit a Pull Request**:
   * Open a pull request with the changes and request a review from the
       maintainers.

By following these steps, you can ensure the new operating system is integrated
seamlessly into the project.

## `Local Development`

### Prerequisites

* [NodeJS](https://nodejs.org)
* [npm](https://github.com/npm/cli)
* [git](https://git-scm.com)

### Instructions

1. Install the above prerequisites
1. Clone the repository by running:

    ```
    git clone https://github.com/cross-platform-actions/action
    ```

1. Navigate to the newly cloned repository: `cd action`
1. Install the dependencies by running: `npm ci --ignore-scripts`
1. Run any of the below npm commands

### npm Commands

The following npm commands are available:

* `build` - Build the GitHub action
* `format` - Reformat the code
* `lint` - Lint the code
* `package` - Package the GitHub action for distribution and end to end testing
* `test` - Run unit tests
* `all` - Will run all of the above commands
* `update-digests` - Pin the digests of the releases in `src/version.ts`
* `check-digests` - Check that the pinned digests are up to date

### Running End to End Tests

The end to end tests can be run locally by running it through [Act][act].
Resources and VM images are downloaded from github.com.

#### Prerequisites

* [Docker](https://docker.com)
* [Act][act]

#### Instructions

1. Install the above prerequisites
1. Copy [`test/workflows/ci.yml.example`](test/workflows/ci.yml.example) to
    `test/workflows/ci.yml`

1. Make any changes you like to `test/workflows/ci.yml`, this is file ignored by
    Git

1. Build the GitHub action by running: `npm run build`
1. Package the GitHub action by running: `npm run package`
1. Run the GitHub action by running: `act --privileged -W test/workflows`

[qemu]: https://www.qemu.org
[rsync]: https://en.wikipedia.org/wiki/Rsync
[resources]: https://github.com/cross-platform-actions/resources
[packer]: https://www.packer.io
[openbsd_builder]: https://github.com/cross-platform-actions/openbsd-builder
[freebsd_builder]: https://github.com/cross-platform-actions/freebsd-builder
[netbsd_builder]: https://github.com/cross-platform-actions/netbsd-builder
[act]: https://github.com/nektos/act
[Keep a Changelog]: https://keepachangelog.com/en/1.0.0/
[Unreleased]: #unreleased
[semver]: https://semver.org
