@/Users/marian-danielrolnik/.codex/RTK.md

## Documentation Discipline

For every code change, check whether public behavior, instruction accounts, operational flows,
CLI behavior, math, security controls, or integration assumptions changed.

If they changed, update the relevant docs/comments in the same work item before finishing:

- `README.md`
- `docs/*.md`
- Rust doc comments on affected instructions/state
- CLI help text or warnings under `scripts/cli/`
- generated IDL/types when account layouts or instruction surfaces change

If no docs update is needed, explicitly state that the code change does not affect documented
behavior. Do not leave docs/comments inconsistent with code.
