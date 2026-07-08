# Developer Certificate of Origin

This project uses the [Developer Certificate of Origin (DCO)](https://developercertificate.org/)
version 1.1 to manage contributions. The DCO is a lightweight, per-commit
attestation that you have the right to submit your contribution under the
project's [Apache License 2.0](./LICENSE.md).

By adding a `Signed-off-by` line to a commit, you certify the following:

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

## How to sign off

Add a `Signed-off-by` line to every commit message, using your real name and an
email address you can be reached at:

```
Signed-off-by: Jane Doe <jane.doe@example.com>
```

Git can add this automatically with the `-s` flag:

```bash
git commit -s -m "fix: correct blacklist check on zero address"
```

If you forget to sign off, you can amend the most recent commit:

```bash
git commit --amend -s --no-edit
```

Every commit in a pull request must be signed off. Pull requests containing
unsigned commits cannot be merged.
