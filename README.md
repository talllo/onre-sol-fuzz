# OnreApp Solana Program

A Solana smart contract built with [Anchor](https://www.anchor-lang.com/) that manages tokenized (re)insurance pools. The program enables the creation, management, and redemption of **ONyc tokens**, which represent fractional ownership in a regulated investment pool specializing in (re)insurance underwriting.

## Quick Start

```bash
# Build the program
anchor build

# Run the Rust LiteSVM integration tests
anchor build && cargo test --manifest-path programs/onreapp/Cargo.toml --tests

# Update program ID after changing keypair
anchor keys sync && anchor build
```

## Program Structure

```
programs/onreapp/src/
├── lib.rs                    # Entry point — all program instructions declared here
├── state.rs                  # Global State account (boss, admins, approvers, kill switch)
├── constants.rs              # PDA seeds, limits, decimals
├── utils/                    # Token helpers, ed25519 signature parsing, approver verification
└── instructions/
    ├── initialization/       # initialize, initialize_permissionless_authority
    ├── buffer/               # BUFFER state, accrual, fee accounting, burn support
    ├── configurable_vault/   # Shared accounting vault destinations and withdrawals
    ├── offer/                # make/take/disable offers, manage price vectors, fees
    ├── prop_amm/             # Prop AMM configuration, quotes, buy/sell execution
    ├── redemption/           # redemption offers, requests, fulfillment, cancellation
    ├── state_operations/     # Boss transfer, admin/approver management, kill switch, max supply
    ├── vault_operations/     # Deposit/withdraw tokens to offer and redemption vaults
    ├── mint_authority/       # Transfer mint authority to/from program PDA, mint_to
    ├── market_info/          # Market stats refresh, exclusions, and NAV/APY/TVL/supply queries
    └── targeted_disable.rs   # Token-pair targeted disable controls
```

## Key Concepts

### Dynamic Pricing

Offers use up to 10 `OfferVector` entries with APR-based compound interest. Price grows over time using `base_price`, `apr` (scale = 6, where 10,000 = 1% and 1,000,000 = 100%), and `price_fix_duration`.

### Authority Structure

| Role               | Description                                                                |
| ------------------ | -------------------------------------------------------------------------- |
| `boss`             | Primary authority with full control (two-step transfer via propose/accept) |
| `admins[20]`       | Can enable the kill switch                                                 |
| `redemption_admin` | Manages redemption operations                                              |
| `approvers`        | Trusted keys for cryptographic approval verification (ed25519)             |

### Kill Switch Semantics

The kill switch is an emergency stop for guarded value-moving paths. The boss can enable or disable it; admins can only enable it.

When `state.is_killed == true`, the program rejects:

- offer execution: `take_offer`, `take_offer_v2`, `take_offer_permissionless`, `take_offer_permissionless_v2`
- Prop AMM quotes and execution: `quote_swap_buy`, `quote_swap_sell`, `open_swap_buy`, `open_swap_sell`
- redemption request movement: `create_redemption_request`, `fulfill_redemption_request`, `cancel_redemption_request`
- vault funding and recovery: `offer_vault_deposit`, `offer_vault_withdraw`, `redemption_vault_deposit`, `redemption_vault_withdraw`
- reserve/configurable vault movement: `deposit_reserve_vault`, `withdraw_reserve_vault`, `withdraw_configurable_vault`
- direct supply-changing and accrual-settling paths: `mint_to`, `burn_for_nav_increase`, `set_buffer_gross_apr`, `set_buffer_fee_config`

The kill switch does not pause every instruction. Governance and configuration-only instructions such as authority changes, admin/approver management, offer configuration, targeted disable, supply-cap configuration, and mint-authority transfer remain callable according to their normal access control.

### Token Support

Most token movement paths use the SPL Token interface and can work with **SPL Token** or **Token-2022** mints. Redemption token-in/ONYC request setup and market-stats recomputation for ONYC require the classic SPL Token program.

`take_offer` and redemption payout paths reject Token-2022 mints with non-zero transfer fees.

### BUFFER Yield Model

Prop AMM and BUFFER cover different high-level needs. Prop AMM is the immediate
liquidity surface for enabled ONyc markets: users can buy or sell through
automated quotes while accounting stays separate from regular offer flows.
BUFFER is the reserve-growth surface: it settles time-based reserve accrual
before ONyc supply changes and keeps reserve, management fee, and performance
fee accounting separate from redemption liquidity.

The BUFFER module stores two separate inputs for accrual:

| Field           | Source                                                             |
| --------------- | ------------------------------------------------------------------ |
| `gross_apr`     | Set explicitly by `set_buffer_gross_apr`                           |
| `current_yield` | Read from the active APR on the offer supplied to the accrual path |

`state.main_offer` must be set before `initialize_buffer` because initialization validates its offer account. It can be updated later with `set_main_offer`, and it must always point to an offer whose `token_out_mint` is ONyc. Runtime accrual uses the offer supplied by the executing path; `set_buffer_gross_apr` uses `state.main_offer`.

Typical on-chain BUFFER setup order:

1. create the ONyc offer
2. set `state.main_offer`
3. call `initialize_buffer`
4. call `set_buffer_gross_apr`
5. optionally call `set_buffer_fee_config`

### Constants

| Constant              | Value      |
| --------------------- | ---------- |
| `MAX_VECTORS`         | 10         |
| `MAX_ADMINS`          | 20         |
| `PRICE_DECIMALS`      | 9          |
| `MAX_ALLOWED_FEE_BPS` | 1000 (10%) |

## Instructions

**Initialization**: `initialize`, `initialize_permissionless_authority`

**BUFFER**: `initialize_buffer`, `set_buffer_gross_apr`, `set_buffer_fee_config`, `burn_for_nav_increase`, `deposit_reserve_vault`, `withdraw_reserve_vault`

**Prop AMM**: `configure_prop_amm`, `quote_swap_buy`, `quote_swap_sell`, `open_swap_buy`, `open_swap_sell`

**Offers**: `make_offer`, `add_offer_vector`, `delete_offer_vector`, `delete_all_offer_vectors`, `update_offer_fee`, `set_offer_disabled`, `take_offer`, `take_offer_v2`, `take_offer_permissionless`, `take_offer_permissionless_v2`

**Redemption**: `make_redemption_offer`, `set_redemption_offer_disabled`, `create_redemption_request`, `fulfill_redemption_request`, `cancel_redemption_request`, `update_redemption_offer_fee`, `update_redemption_offer_vault_target`

**State Operations**: `propose_boss`, `accept_boss`, `add_admin`, `remove_admin`, `clear_admins`, `set_kill_switch`, `set_onyc_mint`, `set_redemption_admin`, `set_main_offer`, `add_approver`, `remove_approver`, `configure_max_supply`, `configure_max_mint_amount`, `close_state`

**Vault Operations**: `offer_vault_deposit`, `offer_vault_withdraw`, `redemption_vault_deposit`, `redemption_vault_withdraw`, `set_configurable_vault_destination`, `withdraw_configurable_vault`

**Mint Authority**: `transfer_mint_authority_to_program`, `transfer_mint_authority_to_boss`, `mint_to`

**Market Info**: `get_nav`, `get_apy`, `get_nav_adjustment`, `get_tvl`, `get_tvl_v2`, `get_circulating_supply`, `get_circulating_supply_v2`, `refresh_market_stats`, `set_circulating_supply_excluded_accounts`, `update_circulating_supply_excluded_balance`

## CLI Tool

An interactive CLI for managing deployed programs on mainnet/devnet.

```bash
# Show CLI help
pnpm cli --help

# Run a command against a specific network
pnpm cli -n mainnet-prod state get
```

### Network Environments

| Profile        | Cluster | Description             |
| -------------- | ------- | ----------------------- |
| `mainnet-prod` | Mainnet | Production program      |
| `mainnet-test` | Mainnet | Test program on mainnet |
| `mainnet-dev`  | Mainnet | Dev program on mainnet  |
| `devnet-test`  | Devnet  | Test program on devnet  |
| `devnet-dev`   | Devnet  | Dev program on devnet   |

The CLI accepts `NETWORK` or the `-n` / `--network` flag.

### Browser UI

A browser UI under `scripts/ui/` exposes the mainnet production program from the generated IDL. It supports injected Solana wallets, account/argument forms for every IDL instruction, automatic resolution of known state fields, PDAs, and ATAs, transaction simulation, wallet signing, and base58 export for external signing workflows.

```bash
pnpm ui
```

The UI always targets the mainnet production program ID: `onreuGhHHgVzMWSkj2oQDLDtvvGvoepBPkqyaubFcwe`. The RPC URL is configurable in the UI; dev mode defaults to `/rpc`, a Vite proxy to public mainnet RPC, and operators can paste Surfpool or a private mainnet endpoint.

### BUFFER CLI Notes

The current CLI exposes only a subset of the on-chain BUFFER flow:

- available commands: `buffer get`, `buffer initialize`, `buffer set-gross-yield`, `buffer burn`
- `buffer initialize` requires `--offer` and `--onyc-mint`
- `current_yield` is not set manually; it is derived from the active APR on the offer supplied to the accrual path

The CLI does not currently expose the full administrative BUFFER flow. In particular, README examples should not assume CLI support for:

- `set_main_offer`
- `set_buffer_fee_config`
- management/performance fee vault withdrawals through `withdraw_configurable_vault`

CLI commands that modify state can either sign locally and send, or output a base58-encoded transaction for external signing such as Squad multisig. Read-only scripts print results directly.

## Tests

Tests are Rust integration tests with **LiteSVM** for fast local testing without a validator. There is no TypeScript test suite configured in this repo; TypeScript is used for CLI and operational scripts.

The LiteSVM harness in `programs/onreapp/tests/common/svm.rs` embeds
`target/deploy/onreapp.so`, so always build before running Rust tests. Do not run
the build and test commands in parallel.

```bash
# Run all tests
anchor build && cargo test --manifest-path programs/onreapp/Cargo.toml --tests

# Run a single test file
anchor build && cargo test --manifest-path programs/onreapp/Cargo.toml --test redemption

# Run the Dockerized Rust test environment
docker compose up --build --abort-on-container-exit
```

Tests live under `programs/onreapp/tests/`. Shared LiteSVM setup and helpers are in `common/`; the instruction tests are flat Rust test files, not nested folders.

```
programs/onreapp/tests/
├── common/                     # LiteSVM setup, builders, readers, token helpers
├── buffer.rs
├── market_info.rs
├── mint_authority.rs
├── prop_amm.rs
├── redemption.rs
├── state_operations.rs
├── take_offer.rs
├── take_offer_permissionless.rs
└── vault_operations.rs
```

## Coverage

Coverage uses the Rust LiteSVM trace flow documented in `COVERAGE.md`. It requires external tools:

```bash
cargo install sbpf-coverage
brew install lcov
```

Run the coverage flow from the repo root:

```bash
rm -rf sbf_trace_dir coverage
cargo build-sbf --debug --tools-version v1.52 --arch v1
SBF_TRACE_DIR=$PWD/sbf_trace_dir cargo test -p onreapp --tests -- --nocapture
sbpf-coverage \
  --src-path=$PWD/programs/onreapp/src \
  --sbf-path=$PWD/target/deploy \
  --sbf-trace-dir=$PWD/sbf_trace_dir
genhtml --output-directory coverage sbf_trace_dir/*.lcov --rc branch_coverage=1
open coverage/index.html
```

Generated `sbf_trace_dir/` and `coverage/` directories are local build artifacts.

## Cross-Chain Transfers

The `scripts/cross_chain_transfer/` directory contains CCTP v1 and v2 implementations for cross-chain USDC transfers between Ethereum and Solana.

## Updating the Program ID

```bash
cp ~/.config/solana/<keypair>.json target/deploy/onreapp-keypair.json
anchor keys sync
anchor build
```

There are no package-level `set-program:*` scripts. After copying the keypair,
run `anchor keys sync` and review the resulting `declare_id!` / Anchor metadata
diff before rebuilding.
