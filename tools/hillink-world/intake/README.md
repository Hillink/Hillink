# Hillink World asset intake (zero network)

Dependency-free Node tooling for bringing **Kyle-approved CC0 asset ZIPs** into
the project safely. It never downloads anything: you fetch the ZIP yourself, and
this tool inspects, quarantines and extracts it. It imports only `node:fs`,
`node:path`, `node:os`, `node:crypto`, `node:zlib` and `node:url`. There is no
network code, no `child_process`, and nothing from an archive is ever executed.

| File | Purpose |
| --- | --- |
| `zip.mjs` | Fail-closed central-directory inspection (`inspectZip`) and verified in-memory member reads (`readMember`). |
| `manifest.mjs` | Manifest validation (`validateManifest`) and cross-check against a real archive (`crossCheckManifest`). |
| `host.mjs` | `stageZip` (quarantine) and `extractZip` (approved extraction) on disk. |
| `cli.mjs` | Command-line front end. |
| `test-zip-builder.mjs`, `test-memfs.mjs` | Used by the tests only. |

## Commands

```
node tools/hillink-world/intake/cli.mjs inspect <zip>
node tools/hillink-world/intake/cli.mjs validate-manifest <manifest.json> [--zip <zip>]
node tools/hillink-world/intake/cli.mjs stage <zip> [--manifest <manifest.json>] [--quarantine <dir>]
node tools/hillink-world/intake/cli.mjs extract <staged.zip> --manifest <manifest.json> --out <new-dir> [--sha256 <hex>]
```

Exit codes: `0` ok, `1` rejected/failed, `2` usage error. Unknown, repeated or
value-less flags (e.g. a typo like `--quarantin`) are usage errors, so they can
never silently fall back to a default.

Typical flow:

1. `inspect` the downloaded ZIP. Nothing is written. It prints the SHA-256, the
   size and every member with its size and SHA-256 (members are decompressed in
   memory to verify them).
2. Write the manifest (below), using the `inspect` output for `inspectedMembers`,
   and get Kyle's acceptance.
3. Run `validate-manifest manifest.json --zip pack.zip`.
4. Run `stage pack.zip --manifest manifest.json`. This copies the file to
   `<quarantine>/<sha256>.zip` and marks it read-only.
5. Run `extract <quarantine>/<sha256>.zip --manifest manifest.json --out <new-dir>`.

## ZIP inspection (fail closed)

The archive is rejected, with every problem listed, if any of these hold:

* **Structure.** The end-of-central-directory record is missing or ambiguous.
  ZIP64 is used, or the archive spans disks. The archive is empty or truncated.
  The central directory does not end exactly at the EOCD, or data is prepended,
  hidden or in gaps (every byte before the central directory must belong to a
  member). A local header disagrees with the central directory (name, method,
  CRC or sizes). Member data overlaps another member. A data descriptor is
  inconsistent.
* **Names.** Absolute paths. `..` or `.` segments. Backslashes. Drive letters or
  any `:` (this covers NTFS alternate data streams). Empty segments. Control
  characters or non-ASCII. Characters outside `A-Z a-z 0-9 space . _ - ( ) + , @ /`.
  Segments that end in a dot or space. Windows device names (`CON`, `NUL`,
  `COM1`…). Names deeper than 8 segments or longer than 200 bytes.
* **Duplicates.** Names that collide case-insensitively, or a file that is also
  used as a directory prefix.
* **Attributes.** Symlinks. Device, FIFO or socket types. Any executable bit.
  setuid, setgid or sticky bits. The Windows reparse-point attribute. The
  directory attribute on a file. "Made by" hosts other than DOS, NTFS, VFAT,
  Unix or OS X.
* **Encryption and compression.** The encryption flag, strong encryption, AES
  or encryption extra fields, or a masked central directory. Any compression
  method other than stored (0) or deflate (8). Patched data. Unknown flags.
* **Size.** More than 5000 entries. A member over 64 MiB, or a total over
  512 MiB uncompressed. A compression ratio above 100:1 (for members of 64 KiB
  or more). An archive over 512 MiB.
* **Allowlist.** Only `*.png` files, plus `license`/`licence`/`readme`
  `.txt`/`.md` files (for example `LICENSE.txt`, `Readme.md`), are accepted.
  Directory entries are allowed but never needed for extraction. Any other file
  rejects the whole archive.

On read, every member is decompressed with a hard output cap equal to its
declared size. The size and CRC-32 must match. PNGs must start with the PNG
signature, and text must be valid UTF-8 with no NUL bytes.

## Manifest

```json
{
  "sourcePageUrl": "https://example.org/asset-pack",
  "downloadUrl": "https://example.org/asset-pack.zip",
  "author": "Author Name",
  "license": "CC0-1.0",
  "filename": "asset-pack.zip",
  "byteSize": 123456,
  "sha256": "<64 lowercase hex>",
  "retrievedAt": "2026-10-01T12:00:00Z",
  "inspectedMembers": [
    { "name": "Tiles/tile_0001.png", "size": 812, "sha256": "<optional 64 lowercase hex>" },
    { "name": "License.txt", "size": 400 }
  ],
  "kyleAcceptance": { "accepted": true, "acceptedBy": "Kyle", "acceptedAt": "2026-10-01T13:00:00Z", "note": "optional" }
}
```

* Every field shown is required except `sha256` on members and `note`.
* `schema` (`"hillink-intake-manifest/1"`), `title` and `notes` are the only
  other top-level keys allowed. Any unknown key is rejected.
* URLs must be https with no embedded credentials.
* `license` must be exactly `CC0-1.0`.
* `sha256` must be 64 lowercase hex characters.
* Timestamps must be real ISO-8601 UTC dates.
* `inspectedMembers` must name every file in the archive, with no extras, using
  allowlisted names and the exact sizes. Any member hashes given must match.

## Stage

* **Quarantine location.** `--quarantine <dir>`, otherwise
  `$HILLINK_INTAKE_QUARANTINE`, otherwise `~/.hillink/intake-quarantine`. A
  leading `~` is expanded. The path must be absolute. If the variable is set but
  empty, staging is refused.
* **Must be outside any repository.** The quarantine is refused if it is inside
  this repository, or inside any directory that has a `.git` directory or `.git`
  file (git worktrees use a file). The comparison is case-insensitive on Windows
  and macOS, and is made after resolving symlinks and junctions. It is checked
  before and after the directory is created.
* **Checks before copying.** The source must be a regular file, not a symlink.
  It is inspected fully (fail closed) and, if a manifest is given, cross-checked
  for file name, size, hash and members.
* **Writing.** The copy is written with an exclusive create (`wx`), so nothing
  is ever overwritten. It is fsynced, re-hashed, then set to `0444` (the
  read-only attribute on Windows). A partial copy is removed if anything fails.
* **Repeat runs.** If an identical file is already staged, the result is
  `already-staged`. A different file under the same name is a conflict and is
  refused.
* **The source ZIP is only ever read.**

## Extract

* **Manifest.** A valid manifest, including Kyle's acceptance, is required.
* **Hash.** The archive is re-hashed and must equal `manifest.sha256` (and
  `--sha256` if given).
* **Verified in memory first.** The archive is re-inspected, and every member is
  decompressed and verified before anything is written.
* **New directory only.** `--out` must not exist. It is created fresh, so an
  existing directory is never reused.
* **Writing.** Only allowlisted files are written, each with an exclusive create
  and mode `0644`. Each is checked to stay inside the output directory, then
  re-hashed after writing.
* **Receipt.** `_intake-receipt.json` in the output directory records the
  archive hash, the source and license details, Kyle's acceptance and the
  SHA-256 of every output.
* **Failure.** On any failure the output directory created by this run is
  removed. The archive is never modified.

## Tests

```
node --test tools/hillink-world/tests/intake-zip.test.mjs tools/hillink-world/tests/intake-manifest.test.mjs
```

The tests build every ZIP in memory. Stage, extract and the CLI run on **real
disk** under `os.tmpdir()` wherever the temp folder is writable. That covers the
Windows read-only attribute, exclusive creates, cleanup, case-insensitive repo
checks, `.git` files and `~` expansion. HQ's sandbox runs Node with the
permission model and no writable path, so there (and only there) the same tests
run the same code against `test-memfs.mjs`, a strict in-memory fs. Each test
prints its backend as a diagnostic. **Before using the tool on real assets, run
the command above once on the Windows host** to exercise real disk.
