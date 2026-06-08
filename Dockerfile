# Stage 1: Build Solana program with Anchor
FROM solanafoundation/anchor:v1.0.2 AS builder

WORKDIR /workspace
COPY . .
RUN anchor build && \
    # Clean up build artifacts to save disk space
    rm -rf target/debug target/deploy/*.txt target/deploy/*.dump target/release/deps target/release/build && \
    cargo clean --release --target-dir target/sbpf-solana-solana || true

# Stage 2: Run Rust LiteSVM tests with the same Anchor toolchain.
FROM solanafoundation/anchor:v1.0.2

WORKDIR /workspace

COPY . .
COPY --from=builder /workspace/target/deploy ./target/deploy
COPY --from=builder /workspace/target/idl ./target/idl

# Default command: run Rust tests and copy artifacts to output.
CMD ["bash", "-lc", "cargo test --manifest-path programs/onreapp/Cargo.toml --tests && mkdir -p /workspace/output && cp -r target/deploy target/idl /workspace/output/"]
