# Coverage

This repo is prepared for the `sbpf-coverage` flow and the command sequence below has been verified locally.

- <https://github.com/LimeChain/sbpf-coverage>

## What is wired

Rust LiteSVM tests can emit the trace artifacts that `sbpf-coverage` consumes.

In particular:

- `programs/onreapp/Cargo.toml` enables LiteSVM register tracing for Rust tests:

```toml
[dev-dependencies]
litesvm = { version = "0.10.0", features = ["precompiles", "register-tracing"] }
```

- the repo root `Cargo.toml` has:

```toml
[profile.release]
debug = true
```

## Verified locally

Verified on 2026-04-10 with the current Rust LiteSVM test harness.

Running tests with `SBF_TRACE_DIR` generates trace artifacts such as:

- `*.regs`
- `*.insns`
- `*.program_id`
- `*.exec.sha256`

inside `sbf_trace_dir/`.

The full suite command also works:

```bash
SBF_TRACE_DIR=$PWD/sbf_trace_dir cargo test -p onreapp --tests -- --nocapture
```

## External prerequisites

Install:

1. `sbpf-coverage`
2. `lcov` / `genhtml`

Example:

```bash
cargo install sbpf-coverage
brew install lcov
```

## Verified Workflow

1. Build the program with debug info preserved.

For coverage-oriented builds, the `sbpf-coverage` README recommends low optimization and debug info, for example:

```bash
cargo build-sbf --debug --tools-version v1.52 --arch v1
```

2. Stage the debug SBF where the Rust test harness embeds it:

```bash
cp target/deploy/debug/onreapp.so target/deploy/onreapp.so
cp target/deploy/debug/onreapp.so.debug target/deploy/onreapp.so.debug
cp target/deploy/debug/onreapp.so.debug target/deploy/onreapp.debug
cargo clean -p onreapp
```

`cargo build-sbf --debug` currently writes the debug artifact under
`target/deploy/debug/`, while the LiteSVM tests embed
`target/deploy/onreapp.so` at compile time. The copy step keeps the traced
program binary and debug symbols in sync.

3. Run Rust LiteSVM tests while collecting traces:

```bash
rm -rf sbf_trace_dir coverage
SBF_TRACE_DIR=$PWD/sbf_trace_dir cargo test -p onreapp --tests -- --nocapture
```

4. Generate coverage:

```bash
sbpf-coverage \
  --src-path=$PWD/programs/onreapp/src \
  --sbf-path=$PWD/target/deploy \
  --sbf-trace-dir=$PWD/sbf_trace_dir
```

This produces `*.lcov` files in `sbf_trace_dir/`.

5. Render HTML:

```bash
genhtml --output-directory coverage sbf_trace_dir/*.lcov --rc branch_coverage=1
open coverage/index.html
```

## Notes

- This is for the Rust LiteSVM test path, not `anchor test`.
- `SBF_TRACE_DISASSEMBLE=1` can also be set if you want `.trace` disassembly files in addition to coverage inputs.
- On this repo and toolchain, `sbpf-coverage` finds debug symbols in `target/deploy/onreapp.debug` after the staging step, so `--sbf-path=$PWD/target/deploy` is the correct path.
- A few test-only compute budget assertions are raised automatically when `SBF_TRACE_DIR` is set, because unoptimized debug SBF with tracing consumes more compute than the normal optimized test binary. Normal test runs still use their original compute limits.
- After coverage, remove the staged `target/deploy/onreapp.*` files before rebuilding a normal release artifact. Some build paths may otherwise leave the staged debug SBF in place because the release build inputs are unchanged.
- `cargo build-sbf --arch v1` also generates `target/sbpfv1-solana-solana/`. That directory is build output only and should stay untracked.
- The generated directories `sbf_trace_dir/` and `coverage/` are build artifacts and should stay untracked.
- The most recent verified `genhtml` run completed successfully and produced `coverage/index.html`. That run reported overall line coverage of `53.8% (922/1713)`, so this document verifies the setup, not a high-coverage threshold.
