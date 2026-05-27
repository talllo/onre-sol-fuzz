# Prop AMM Pricing Model

This document explains the current Prop AMM pricing path implemented in:

- `programs/onreapp/src/instructions/prop_amm/quote.rs`
- `programs/onreapp/src/instructions/prop_amm/sell.rs`
- `programs/onreapp/src/instructions/prop_amm/buy.rs`

The important distinction is that buys and sells use different mechanics:

- Buy: normal offer pricing is used. The only Prop AMM change is where incoming pair assets are routed.
- Sell: normal redemption pricing is used first, then the hard-wall reserve curve converts the raw sell value into the actual pair-asset output.

Prop AMM configuration and pressure tracking are per canonical offer pair. A pair is enabled by its `PropAmmPairState` PDA, derived from the canonical `asset -> ONYC` offer.

## Formula History

The first hard-wall implementation in commit `d93b231` used the blended
endpoint penalty from the original spec:

```text
effective_liquidity = min(actual_liquidity, hard_wall_reserve)
u = raw / effective_liquidity
w = linear_weight_bps / 10_000
penalty(u) = w * u + (1 - w) * u^base_exponent
liquidity_factor = max(0, 1 - penalty(u))
out = raw * liquidity_factor
```

That version had these Prop AMM state fields:

```text
pool_target_bps
linear_weight_bps
base_exponent
```

The older Notion-style notation sometimes wrote the linear weight as
`linear_weight / 500`. That is not how the Rust implementation stored it:
the implemented `linear_weight_bps` was divided by `10_000`. With the old
defaults, `linear_weight_bps = 2_000` and `base_exponent = 3`, so:

```text
penalty(u) = 0.20u + 0.80u^3
```

Commit `880be62` replaced that blended penalty model with dynamic-wall
pricing. It removed `linear_weight_bps` and `base_exponent`, added sell/buy
pressure tracking, and changed the curve to:

```text
effective_volume = decayed_previous_sell_pressure + current_net_sell_pressure + raw
W = actual_liquidity / (1 + wall_sensitivity * effective_volume / actual_liquidity)
u = raw / W
haircut(u) = min_liquidation_haircut + curve_peg_haircut * u^curve_exponent
out = raw * max(0, 1 - haircut(u))
```

Commit `5e86ebe` then removed `min_liquidation_haircut`, leaving only the
curve peg haircut. Commit `2f91c58` added cadence pricing by reducing the
curve exponent as current-epoch sell count rises. Later commits moved the
Prop AMM state to per-pair PDAs and changed the fixed reserve target source
from Prop AMM config to `redemption_offer.vault_target_bps`.

The current implemented formula is therefore not the original blended
`linear + nonlinear` penalty. It is the dynamic-wall, cadence-adjusted
haircut described in the rest of this document.

## Variables

| Symbol | Code variable | Meaning |
| --- | --- | --- |
| `TVL` | `market_stats.tvl` | Protocol TVL from the market stats PDA, stored in ONYC/base precision. |
| `target_bps` | `redemption_offer.vault_target_bps` | Target redemption liquidity as basis points of TVL. Defaults to `0`, which disables automatic redemption-vault refill and sends net pair-asset inflow to proceeds. |
| `R` | `hard_wall_reserve` | Effective hard-wall reserve. If `vault_target_bps == 0`, this is the actual vault balance. Otherwise it is `min(actual vault balance, TVL-derived target)`, converted into output token decimals. |
| `L` | `actual_liquidity` | Current redemption vault balance for the pair asset being paid out. |
| `V` | effective sell volume | Previous epoch pressure after decay plus current net sell pressure plus this sell's raw value. |
| `W` | dynamic wall position | Vault-based effective pool size after applying net sell pressure. |
| `raw` | `result.token_out_amount` before hard wall | Pair-asset output from normal redemption pricing after redemption fee. |
| `out` | final `result.token_out_amount` | Actual pair-asset output transferred to the seller. |
| `h_peg` | `curve_peg_haircut_bps / 10_000` | Additional haircut when utilization is exactly 1. Default is `700`, or 7%. |
| `e_base` | `curve_exponent_scaled / 10_000` | Base haircut curve exponent. Default is `25_000`, or 2.5. |
| `e_effective` | `effective_curve_exponent_scaled(...) / 10_000` | Cadence-adjusted exponent used by the sell curve. It can be reduced during high sell cadence, down to `min_cadence_exponent_scaled`. |
| `min_sell_fee` | `minimum_sell_haircut_onyc` | Minimum token-in fee for Prop AMM sells, denominated in ONYC base units. Default is `5_000_000_000`, or 5 ONYC. |
| `S` | `HARD_WALL_SCALE` | Fixed-point scale, currently `1_000_000_000_000`. |

All on-chain math is integer fixed-point math. In formulas below, values are shown as real numbers for readability.

ONYC always uses 9 decimals. The dynamic wall tracker stores pressure in the pair asset mint's base units, not ONYC base units. USDC examples assume 6 decimals:

```text
1 ONYC at NAV = 1.00 pair asset
ONYC amount = 1_000_000_000
asset value = 1_000_000
```

So:

- selling ONYC records the raw asset redemption value before dampening
- buying ONYC records the net asset input used to buy ONYC
- both sides are comparable because both are stored in the pair asset mint's base units

## Buy Flow

The buy quote is unchanged:

```text
pair asset input -> process_offer_core(...) -> ONYC output
```

In formula form, the offer engine deducts the offer fee from the input first:

```text
buy_net = token_in_amount - ceil(token_in_amount * offer_fee_bps / 10_000)
token_out_amount = buy_net * 10^(token_out_decimals + 9)
                 / (current_offer_price * 10^token_in_decimals)
```

The buy execution does change the routing of incoming assets. A buy quote can
exist even when buy execution later rejects because the offer's permissionless
mode is disabled: `open_swap_buy` requires `offer.allow_permissionless()`, while
`quote_swap_buy` only validates pricing.

### Step 1: Calculate Target Redemption Liquidity

The target is based on TVL:

```text
target_in_onyc_decimals = TVL * target_bps / 10_000
```

Then the target is converted from ONYC decimals into the asset input mint decimals:

```text
target_liquidity = target_in_onyc_decimals
                 * 10^asset_decimals
                 / 10^onyc_decimals
```

Example:

```text
TVL = 1,000 ONYC
target_bps = 1,500
ONYC decimals = 9
USDC decimals = 6

target_in_onyc_decimals = 1,000e9 * 1,500 / 10,000
                         = 150e9

target_liquidity = 150e9 * 10^6 / 10^9
                 = 150e6 USDC base units
                 = 150 USDC
```

### Step 2: Refill Redemption Vault First

If the redemption vault is below target:

```text
deficit = target_liquidity - current_redemption_vault_balance
refill_amount = min(deficit, buy_net_asset_amount)
```

Any remaining net asset goes to the Prop AMM proceeds vault:

```text
proceeds_amount = buy_net_asset_amount - refill_amount
```

So buys self-heal the redemption vault until the TVL-based hard-wall target is reached. The buy net asset amount is also recorded as current-epoch buy relief. It can reduce net sell pressure, but it cannot create negative pressure.

## Sell Flow Overview

Sell execution has three conceptual stages.

### Step 1: Redemption Fee

The sell first runs normal redemption pricing:

```text
raw = process_redemption_core(
  offer,
  token_in_amount,
  token_in_mint,
  token_out_mint,
  redemption_fee_bps
).token_out_amount
```

The redemption fee comes from the redemption offer if initialized and enabled.
If the redemption offer PDA is the correct derived address but uninitialized,
the fee and target are treated as zero. If the redemption offer exists but is
disabled, the sell rejects. A zero redemption fee does not bypass
`minimum_sell_haircut_onyc`.

Conceptually:

```text
pct_fee = ceil(token_in_amount * redemption_fee_bps / 10_000)
token_in_fee = max(pct_fee, minimum_sell_haircut_onyc)
reject if token_in_amount < token_in_fee
token_in_net = token_in_amount - token_in_fee
raw = token_in_net * current_offer_price * 10^token_out_decimals
    / (10^token_in_decimals * 10^9)
```

Example:

```text
User sells: 1 ONYC
Redemption fee: 500 bps = 5%
Minimum sell haircut: 0 ONYC for this example
NAV/offer price: 1 ONYC = 1 USDC

token_in_net = 1.00 * (1 - 0.05)
             = 0.95 ONYC

raw = 0.95 USDC
```

This `raw` value is not necessarily what the user receives. It is the amount that is passed into the current endpoint dampening curve.

### Step 2: Calculate Net Sell Pressure

Prop AMM tracks sell pressure across the current and previous epoch:

```text
curr_net = max(0, curr_sell_value_stable - curr_buy_value_stable)
effective_volume = decayed_prev_net + curr_net + raw
```

The current sell's own `raw` pair-asset value is included in `effective_volume`, so the order pays against the pressure it creates. ONYC buy pressure relief is the pair-asset net input paid by the buyer, not the 9-decimal ONYC amount minted. The code uses field names ending in `_stable` for this value, but the unit is the canonical pair asset's base units.

If an epoch rolls over, current net sell pressure moves into `prev_net_sell_value_stable`; if two or more epochs elapsed, pressure resets to zero. Previous pressure decays linearly through the next epoch.

### Step 3: Calculate the Dynamic Wall

The dynamic wall is based on the actual redemption vault balance and effective sell pressure:

```text
W = L / (1 + wall_sensitivity * (effective_volume / L))
```

With the default `wall_sensitivity_scaled = 20_000`, `wall_sensitivity = 2.0`.

### Step 4: Calculate the TVL Hard-Wall Reserve

When `target_bps > 0`, the sell path reads `market_stats.tvl` and calculates the hard-wall reserve:

```text
R = TVL * target_bps / 10_000
```

Then it converts from ONYC decimals to the output pair-asset decimals:

```text
R = R_onyc_decimals * 10^token_out_decimals / 10^onyc_decimals
```

For non-USDC assets, `token_out_decimals` is the actual output asset mint's
decimals:

```text
target_asset = floor(floor(TVL * target_bps / 10_000)
               * 10^asset_decimals / 10^ONYC_decimals)
```

Example:

```text
TVL = 66,666.666666666 ONYC
target_bps = 1,500

R = 66,666.666666666 * 0.15
  = 10,000 USDC
```

Here `R = 10,000 USDC` means the fixed hard-wall reserve target is `10,000 USDC`.

The effective hard-wall reserve used by the curve is:

```text
hard_wall_reserve =
  if target_bps == 0:
    L
  else:
    min(L, R)
```

This means extra redemption-vault balance above the configured target does not loosen the sell curve. When the target is zero, the curve uses the actual vault balance.

### Step 5: Apply Endpoint Dampening

This is the core hard-wall logic:

```text
effective_liquidity = min(W, hard_wall_reserve)
u = raw / effective_liquidity
haircut = h_peg * u^e_effective
liquidity_factor = max(0, 1 - haircut)
out = raw * liquidity_factor
```

The implementation rejects the sell if:

```text
L == 0
R == 0
raw > L
```

The dynamic wall is a pricing input, not a hard execution cap. If `raw` is at or below the actual vault balance, the order can execute even when `raw` is greater than the pressure-adjusted wall. In that case the haircut can reach or exceed `1`, the liquidity factor saturates at `0`, and `out` becomes `0`. The sell still has to satisfy `minimum_out`, so a zero-output sell only succeeds when the caller explicitly allows `minimum_out = 0`.

This is still an endpoint formula, so it is not mathematically split-proof. The dynamic wall makes splitting materially worse because every sell adds pair-local pressure and shrinks the wall for subsequent sells on the same pair.

## Effective Liquidity

With dynamic wall sensitivity enabled, effective liquidity is the pressure-adjusted wall capped by the hard-wall reserve:

```text
effective_liquidity = min(dynamic_wall_position, hard_wall_reserve)
```

When sensitivity is disabled, the fixed hard-wall behavior is:

```text
effective_liquidity = min(actual_liquidity, hard_wall_reserve)
```

The code contains this fallback, but normal `configure_prop_amm` validation requires `wall_sensitivity_scaled > 0`.

Dynamic wall examples with `L = 10,000` and sensitivity `2.0`:

```text
effective_volume = 0      -> W = 10,000
effective_volume = 2,500  -> W = 6,666
effective_volume = 5,000  -> W = 5,000
effective_volume = 10,000 -> W = 3,333
```

This makes the same order more expensive as net sell pressure accumulates.

## Utilization

Utilization is based on the current order's raw sell value and the effective liquidity:

```text
u = raw / effective_liquidity
```

So:

```text
u = 0.10 means this order is 10% of effective liquidity before dampening
u = 0.50 means this order is 50% of effective liquidity before dampening
u = 1.00 means the order receives the peg haircut
large u means the order can be dampened to zero output
```

## Haircut Function

The sell-side haircut is:

```text
haircut(u) = h_peg * u^e_effective
```

Where:

```text
h_peg = curve_peg_haircut_bps / 10_000
e_base = curve_exponent_scaled / 10_000
quote_trade_count = current sell trade count if current epoch is active, else 0
reduction_scaled =
  floor(cadence_sensitivity_scaled * quote_trade_count / cadence_threshold / 1,000)
  * 1,000
effective_curve_exponent_scaled =
  max(min_cadence_exponent_scaled, curve_exponent_scaled - reduction_scaled)
e_effective = effective_curve_exponent_scaled / 10_000
```

The cadence adjustment is based on already-recorded current-epoch sell trades.
The current sell's raw value is included in pressure immediately, but its
sell-trade-count cadence effect starts with later sells.

With no cadence adjustment, current defaults are:

```text
vault_target_bps = redemption_offer.vault_target_bps
h_peg = 700 / 10,000 = 0.07
e_effective = 25,000 / 10,000 = 2.5
min_cadence_exponent_scaled = 1,000
cadence_threshold = 20
cadence_sensitivity_scaled = 10,000
epoch_duration_seconds = 86,400
wall_sensitivity_scaled = 20,000
minimum_sell_haircut_onyc = 5,000,000,000
```

So:

```text
haircut(u) = 0.07u^2.5
```

### Power Approximation

The program computes fractional powers without a table:

```text
u^e = 2^(e * log2(u))
```

`u` is fixed-point scaled by `HARD_WALL_SCALE = 1e12`. Integer exponents use
repeated fixed-point multiplication with saturation at extreme values. Fractional exponents use Q40
intermediate math:

```text
log2(u) = log2(u_scaled) - log2(HARD_WALL_SCALE)
```

The logarithm normalizes the input into a mantissa `m` and approximates:

```text
ln(m) = 2 * (z + z^3/3 + z^5/5 + ...)
z = (m - 1) / (m + 1)
```

using seven odd terms total (`z` through `z^13/13`), then multiplies by `log2_e`. The exponent step splits
`e * log2(u)` into integer and fractional parts, approximates
`exp(frac * ln(2))` with ten Taylor terms, and applies the integer power-of-two
shift. This is the cheap approximation used instead of an on-chain nth-root
calculation.

Examples:

```text
u = 0.10
haircut = 0.07 * 0.10^2.5
        ~= 0.00022
        ~= 0.02%

u = 0.50
haircut = 0.07 * 0.50^2.5
        ~= 0.01237
        ~= 1.24%

u = 1.00
haircut = 0.07
        = 7.0%
```

The haircut grows slowly at first, then faster as the order consumes more of the wall. The final liquidity factor is:

```text
liquidity_factor = max(0, 1 - haircut(u))
out = raw * liquidity_factor
```

## Full Sell Example

Assume:

```text
TVL = 66,666.666666666 ONYC
target_bps = 1,500
R = 10,000 USDC
L = 10,000 USDC
redemption_fee_bps = 500
user sells enough ONYC that the normal redemption output before fee would be 5,000 USDC
```

### 1. Apply Redemption Fee

```text
raw = 5,000 * (1 - 500 / 10,000)
    = 5,000 * 0.95
    = 4,750 USDC
```

The user has `4,750 USDC` of raw redemption value to pass through the dampening curve.

### 2. Apply Dampening

The vault is at the target reserve and default wall sensitivity is `2.0`, so the current sell's own raw value moves the dynamic wall before utilization is calculated:

```text
effective_liquidity = 10,000 / (1 + 2.0 * (4,750 / 10,000))
                    ~= 5,128

u = 4,750 / 5,128
  ~= 0.926
```

With the default curve:

```text
haircut = 0.07 * 0.926^2.5
        ~= 0.0578

liquidity_factor = 1 - 0.0578
                 = 0.9422

out = 4,750 * 0.9422
    ~= 4,475 USDC
```

So the user expected about `5,000 USDC` before fee, has `4,750 USDC` raw value after fee, and actually receives about `4,475 USDC` after dynamic-wall dampening.

### 3. Vault State Updates

The vault loses the actual output:

```text
vault_after = 10,000 - 4,475
            = 5,525 USDC
```

The next seller starts from the new lower vault balance.

## Split-Order Behavior

Suppose a user tries:

```text
One sell with raw budget 5,000
```

versus:

```text
Five sells with raw budget 1,000 each
```

The current model prices each order independently:

```text
effective_liquidity = min(
  dynamic_wall_position(current_vault, effective_sell_volume, wall_sensitivity),
  hard_wall_reserve
)
out = raw * f(raw / effective_liquidity)
```

That means each smaller order receives a smaller utilization and therefore a smaller haircut. However, each sell also increases pair-local net sell pressure, so later split orders on the same pair see a smaller wall.

The test `test_dynamic_wall_accumulates_sell_pressure_and_buys_relieve_it` documents that sell pressure worsens later sell quotes and ONyc buys relieve current-epoch pressure.

## Configuration Constraints

Normal Prop AMM configuration requires:

```text
PropAmmPairState.enabled == true for swaps and quotes
redemption_offer.vault_target_bps <= 10,000
curve_peg_haircut_bps <= 10,000
curve_exponent_scaled in [1,000, 100,000], in 1,000 increments
min_cadence_exponent_scaled in [1,000, 10,000], in 1,000 increments
cadence_threshold > 0
cadence_sensitivity_scaled <= 100,000
epoch_duration_seconds > 0
wall_sensitivity_scaled > 0
minimum_sell_haircut_onyc is denominated in ONYC base units
```
