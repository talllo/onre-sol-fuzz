use crate::constants::seeds;
use crate::instructions::market_info::read_market_stats_account;
use crate::instructions::offer::process_offer_core;
use crate::instructions::redemption::{
    load_optional_checked_redemption_offer, process_redemption_core,
};
use crate::instructions::Offer;
use crate::state::State;
use crate::utils::has_transfer_fee;
use anchor_lang::solana_program::program::set_return_data;
use anchor_lang::{prelude::*, Accounts, AnchorDeserialize, AnchorSerialize};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use super::config::{
    PropAmmPairState, CURVE_EXPONENT_STEP, DEFAULT_CADENCE_THRESHOLD,
    DEFAULT_MIN_CADENCE_EXPONENT_SCALED, WALL_SENSITIVITY_SCALE,
};
use super::hard_wall_math::{
    bps_to_hard_wall_scale, utilization_power_scaled, validate_curve_exponent_scaled,
    HARD_WALL_SCALE,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum SwapSide {
    Buy,
    Sell,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct SwapQuote {
    pub offer: Pubkey,
    pub token_in_mint: Pubkey,
    pub token_out_mint: Pubkey,
    pub token_in_amount: u64,
    pub token_in_net_amount: u64,
    pub token_in_fee_amount: u64,
    pub token_out_amount: u64,
    pub minimum_out: u64,
    pub current_price: u64,
    pub quoted_at: i64,
}

struct SwapQuoteComputation {
    current_price: u64,
    token_in_net_amount: u64,
    token_in_fee_amount: u64,
    token_out_amount: u64,
}

#[derive(Accounts)]
pub struct QuoteSwapBuy<'info> {
    pub offer: AccountLoader<'info, Offer>,

    #[account(
        seeds = [seeds::PROP_AMM_PAIR_STATE, offer.key().as_ref()],
        bump = prop_amm_pair_state.bump
    )]
    pub prop_amm_pair_state: Box<Account<'info, PropAmmPairState>>,

    #[account(
        seeds = [seeds::STATE],
        bump = state.bump,
        constraint = !state.is_killed @ crate::OnreError::KillSwitchActivated
    )]
    pub state: Box<Account<'info, State>>,

    pub token_in_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_out_mint: Box<InterfaceAccount<'info, Mint>>,
}

#[derive(Accounts)]
pub struct QuoteSwapSell<'info> {
    pub offer: AccountLoader<'info, Offer>,

    #[account(
        seeds = [seeds::PROP_AMM_PAIR_STATE, offer.key().as_ref()],
        bump = prop_amm_pair_state.bump
    )]
    pub prop_amm_pair_state: Box<Account<'info, PropAmmPairState>>,

    #[account(
        seeds = [
            seeds::REDEMPTION_OFFER,
            token_in_mint.key().as_ref(),
            token_out_mint.key().as_ref()
        ],
        bump
    )]
    /// CHECK: PDA address is validated by seeds; data is optional and loaded in instruction logic.
    pub redemption_offer: UncheckedAccount<'info>,

    #[account(
        seeds = [seeds::STATE],
        bump = state.bump,
        constraint = !state.is_killed @ crate::OnreError::KillSwitchActivated
    )]
    pub state: Box<Account<'info, State>>,

    /// CHECK: PDA derivation validated by seeds constraint
    #[account(seeds = [seeds::REDEMPTION_OFFER_VAULT_AUTHORITY], bump)]
    pub redemption_vault_authority: UncheckedAccount<'info>,

    #[account(
        associated_token::mint = token_out_mint,
        associated_token::authority = redemption_vault_authority,
        associated_token::token_program = token_out_program
    )]
    pub redemption_vault_token_out_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_in_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_out_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_out_program: Interface<'info, TokenInterface>,

    /// CHECK: PDA address is validated in instruction logic; data is loaded only if initialized.
    pub market_stats: UncheckedAccount<'info>,
}

pub(crate) fn resolve_swap_side(
    state: &State,
    token_in_mint: Pubkey,
    token_out_mint: Pubkey,
) -> Result<(SwapSide, Pubkey)> {
    require!(
        token_in_mint != token_out_mint,
        crate::OnreError::InvalidSwapPair
    );

    if token_out_mint == state.onyc_mint && token_in_mint != state.onyc_mint {
        return Ok((SwapSide::Buy, token_in_mint));
    }

    if token_in_mint == state.onyc_mint && token_out_mint != state.onyc_mint {
        return Ok((SwapSide::Sell, token_out_mint));
    }

    Err(error!(crate::OnreError::InvalidSwapPair))
}

pub(crate) fn validate_canonical_offer(
    program_id: &Pubkey,
    state: &State,
    offer_key: Pubkey,
    token_in_mint: Pubkey,
    token_out_mint: Pubkey,
) -> Result<SwapSide> {
    let (side, asset_mint) = resolve_swap_side(state, token_in_mint, token_out_mint)?;
    let (expected_offer, _) = Pubkey::find_program_address(
        &[seeds::OFFER, asset_mint.as_ref(), state.onyc_mint.as_ref()],
        program_id,
    );
    require_keys_eq!(offer_key, expected_offer, crate::OnreError::OfferMismatch);
    Ok(side)
}

pub(crate) fn validate_prop_amm_pair_state(
    state: &State,
    prop_amm_pair_state: &PropAmmPairState,
    offer_key: Pubkey,
    token_in_mint: Pubkey,
    token_out_mint: Pubkey,
) -> Result<SwapSide> {
    let (side, asset_mint) = resolve_swap_side(state, token_in_mint, token_out_mint)?;
    require_keys_eq!(
        prop_amm_pair_state.offer,
        offer_key,
        crate::OnreError::InvalidPropAmmPairState
    );
    require_keys_eq!(
        prop_amm_pair_state.asset_mint,
        asset_mint,
        crate::OnreError::InvalidPropAmmPairState
    );
    require_keys_eq!(
        prop_amm_pair_state.onyc_mint,
        state.onyc_mint,
        crate::OnreError::InvalidPropAmmPairState
    );
    require!(
        prop_amm_pair_state.enabled,
        crate::OnreError::PropAmmPairDisabled
    );
    Ok(side)
}

pub(crate) fn validate_prop_amm_pair_for_side(
    program_id: &Pubkey,
    state: &State,
    prop_amm_pair_state: &PropAmmPairState,
    offer_key: Pubkey,
    token_in_mint: Pubkey,
    token_out_mint: Pubkey,
    expected_side: SwapSide,
) -> Result<()> {
    let side =
        validate_canonical_offer(program_id, state, offer_key, token_in_mint, token_out_mint)?;
    require!(side == expected_side, crate::OnreError::InvalidSwapPair);
    let pair_side = validate_prop_amm_pair_state(
        state,
        prop_amm_pair_state,
        offer_key,
        token_in_mint,
        token_out_mint,
    )?;
    require!(
        pair_side == expected_side,
        crate::OnreError::InvalidSwapPair
    );
    Ok(())
}

pub(crate) struct RedemptionOfferConfig {
    pub fee_basis_points_prop_amm_sell: u16,
    pub vault_target_bps: u16,
}

pub(crate) fn redemption_offer_config(
    program_id: &Pubkey,
    redemption_offer_account: &UncheckedAccount,
    offer_key: Pubkey,
    token_in_mint: Pubkey,
    token_out_mint: Pubkey,
) -> Result<RedemptionOfferConfig> {
    let Some(redemption_offer) = load_optional_checked_redemption_offer(
        program_id,
        redemption_offer_account,
        offer_key,
        token_in_mint,
        token_out_mint,
    )?
    else {
        return Ok(RedemptionOfferConfig {
            fee_basis_points_prop_amm_sell: 0,
            vault_target_bps: 0,
        });
    };
    redemption_offer.require_enabled()?;

    Ok(RedemptionOfferConfig {
        fee_basis_points_prop_amm_sell: redemption_offer.fee_basis_points_prop_amm_sell,
        vault_target_bps: redemption_offer.vault_target_bps,
    })
}

pub(crate) fn resolve_hard_wall_reserve(
    market_stats_account: &UncheckedAccount,
    actual_liquidity: u64,
    vault_target_bps: u16,
    token_out_decimals: u8,
    onyc_decimals: u8,
) -> Result<u64> {
    if vault_target_bps == 0 {
        return Ok(actual_liquidity);
    }

    // The sell curve cannot use liquidity that is not actually in the redemption
    // vault. If operators configure a target below the vault's current balance,
    // surplus balance is ignored for pricing by taking min(actual, TVL target).
    let market_stats = read_market_stats_account(&market_stats_account.to_account_info())?;
    let target_reserve = hard_wall_reserve_from_tvl(
        market_stats.tvl,
        vault_target_bps,
        token_out_decimals,
        onyc_decimals,
    )?;
    Ok(actual_liquidity.min(target_reserve))
}

pub(crate) fn apply_hard_wall_liquidity_factor(
    token_out_amount: u64,
    actual_liquidity: u64,
    hard_wall_reserve: u64,
    prop_amm_pair_state: &PropAmmPairState,
) -> Result<u64> {
    let now = Clock::get()?.unix_timestamp;
    apply_hard_wall_liquidity_factor_at_time(
        token_out_amount,
        actual_liquidity,
        hard_wall_reserve,
        prop_amm_pair_state,
        now,
    )
}

pub fn apply_hard_wall_liquidity_factor_at_time(
    token_out_amount: u64,
    actual_liquidity: u64,
    hard_wall_reserve: u64,
    prop_amm_pair_state: &PropAmmPairState,
    now: i64,
) -> Result<u64> {
    require!(actual_liquidity > 0, crate::OnreError::InsufficientBalance);
    require!(hard_wall_reserve > 0, crate::OnreError::InsufficientBalance);
    require!(
        token_out_amount <= actual_liquidity,
        crate::OnreError::InsufficientBalance
    );

    // Final sell output is:
    //   effective_liquidity = min(dynamic_wall(actual, sell_pressure), hard_wall_reserve)
    //   utilization = token_out_amount / effective_liquidity
    //   haircut = peg_haircut * utilization^effective_exponent
    //   output = token_out_amount * max(0, 1 - haircut)
    //
    // `actual_liquidity` is the solvency bound. `hard_wall_reserve` is either the
    // same actual balance or min(actual balance, TVL target), depending on
    // redemption-offer configuration. The exponent power is approximated in
    // hard_wall_math.rs.
    let effective_liquidity = dynamic_wall_liquidity_at_time(
        token_out_amount,
        actual_liquidity,
        hard_wall_reserve,
        prop_amm_pair_state,
        now,
    )?;

    let utilization_scaled = if token_out_amount == 0 {
        0
    } else if token_out_amount == effective_liquidity {
        HARD_WALL_SCALE
    } else {
        (token_out_amount as u128)
            .checked_mul(HARD_WALL_SCALE)
            .ok_or(crate::OnreError::MathOverflow)?
            .checked_div(effective_liquidity as u128)
            .ok_or(crate::OnreError::DivByZero)?
    };
    let haircut = redemption_haircut_scaled(
        utilization_scaled,
        prop_amm_pair_state.curve_peg_haircut_bps,
        effective_curve_exponent_scaled(prop_amm_pair_state, now)?,
    )?;
    let liquidity_factor = HARD_WALL_SCALE.saturating_sub(haircut);
    let dampened_amount = (token_out_amount as u128)
        .checked_mul(liquidity_factor)
        .ok_or(crate::OnreError::MathOverflow)?
        .checked_div(HARD_WALL_SCALE)
        .ok_or(crate::OnreError::DivByZero)?;

    require!(
        dampened_amount <= u64::MAX as u128,
        crate::OnreError::MathOverflow
    );
    Ok(dampened_amount as u64)
}

pub fn roll_prop_amm_volume_tracker(
    prop_amm_pair_state: &mut PropAmmPairState,
    now: i64,
) -> Result<()> {
    let epoch_duration = prop_amm_pair_state.epoch_duration_seconds;
    require!(epoch_duration > 0, crate::OnreError::InvalidAmount);

    if prop_amm_pair_state.epoch_start == 0 || now < prop_amm_pair_state.epoch_start {
        prop_amm_pair_state.epoch_start = now;
        prop_amm_pair_state.prev_net_sell_value_stable = 0;
        prop_amm_pair_state.curr_sell_value_stable = 0;
        prop_amm_pair_state.curr_buy_value_stable = 0;
        prop_amm_pair_state.curr_sell_trade_count = 0;
        return Ok(());
    }

    let elapsed = now
        .checked_sub(prop_amm_pair_state.epoch_start)
        .ok_or(crate::OnreError::ArithmeticUnderflow)?;
    if elapsed >= epoch_duration.saturating_mul(2) {
        prop_amm_pair_state.prev_net_sell_value_stable = 0;
        prop_amm_pair_state.curr_sell_value_stable = 0;
        prop_amm_pair_state.curr_buy_value_stable = 0;
        prop_amm_pair_state.curr_sell_trade_count = 0;
        prop_amm_pair_state.epoch_start = now;
    } else if elapsed >= epoch_duration {
        prop_amm_pair_state.prev_net_sell_value_stable = prop_amm_pair_state
            .curr_sell_value_stable
            .saturating_sub(prop_amm_pair_state.curr_buy_value_stable);
        prop_amm_pair_state.curr_sell_value_stable = 0;
        prop_amm_pair_state.curr_buy_value_stable = 0;
        prop_amm_pair_state.curr_sell_trade_count = 0;
        prop_amm_pair_state.epoch_start = now;
    }

    Ok(())
}

pub fn record_prop_amm_sell(
    prop_amm_pair_state: &mut PropAmmPairState,
    sell_value_stable: u64,
    now: i64,
) -> Result<()> {
    roll_prop_amm_volume_tracker(prop_amm_pair_state, now)?;
    prop_amm_pair_state.curr_sell_value_stable = prop_amm_pair_state
        .curr_sell_value_stable
        .checked_add(sell_value_stable)
        .ok_or(crate::OnreError::MathOverflow)?;
    prop_amm_pair_state.curr_sell_trade_count = prop_amm_pair_state
        .curr_sell_trade_count
        .checked_add(1)
        .ok_or(crate::OnreError::MathOverflow)?;
    Ok(())
}

pub fn record_prop_amm_buy(
    prop_amm_pair_state: &mut PropAmmPairState,
    buy_value_stable: u64,
    now: i64,
) -> Result<()> {
    roll_prop_amm_volume_tracker(prop_amm_pair_state, now)?;
    prop_amm_pair_state.curr_buy_value_stable = prop_amm_pair_state
        .curr_buy_value_stable
        .checked_add(buy_value_stable)
        .ok_or(crate::OnreError::MathOverflow)?;
    Ok(())
}

pub fn preview_effective_sell_volume(
    prop_amm_pair_state: &PropAmmPairState,
    current_sell_value_stable: u64,
    now: i64,
) -> Result<u64> {
    let epoch_duration = prop_amm_pair_state.epoch_duration_seconds;
    require!(epoch_duration > 0, crate::OnreError::InvalidAmount);

    let current_net = prop_amm_pair_state
        .curr_sell_value_stable
        .saturating_sub(prop_amm_pair_state.curr_buy_value_stable);
    let (prev_net, curr_net, elapsed) =
        if prop_amm_pair_state.epoch_start == 0 || now < prop_amm_pair_state.epoch_start {
            (0_u64, 0_u64, 0_i64)
        } else {
            let elapsed = now
                .checked_sub(prop_amm_pair_state.epoch_start)
                .ok_or(crate::OnreError::ArithmeticUnderflow)?;
            if elapsed >= epoch_duration.saturating_mul(2) {
                (0, 0, 0)
            } else if elapsed >= epoch_duration {
                (current_net, 0, 0)
            } else {
                (
                    prop_amm_pair_state.prev_net_sell_value_stable,
                    current_net,
                    elapsed,
                )
            }
        };

    let remaining = epoch_duration
        .checked_sub(elapsed)
        .ok_or(crate::OnreError::ArithmeticUnderflow)?;
    let decayed_prev = (prev_net as u128)
        .checked_mul(remaining as u128)
        .ok_or(crate::OnreError::MathOverflow)?
        .checked_div(epoch_duration as u128)
        .ok_or(crate::OnreError::DivByZero)?;
    let effective = decayed_prev
        .checked_add(curr_net as u128)
        .and_then(|value| value.checked_add(current_sell_value_stable as u128))
        .ok_or(crate::OnreError::MathOverflow)?;
    require!(
        effective <= u64::MAX as u128,
        crate::OnreError::MathOverflow
    );
    Ok(effective as u64)
}

pub fn dynamic_wall_position(
    actual_liquidity: u64,
    effective_sell_volume: u64,
    wall_sensitivity_scaled: u32,
) -> Result<u64> {
    require!(actual_liquidity > 0, crate::OnreError::InsufficientBalance);
    if effective_sell_volume == 0 {
        return Ok(actual_liquidity);
    }

    // W = L / (1 + sensitivity * V / L)
    //
    // `L` is the current redemption-vault balance and `V` is decayed sell
    // pressure plus this order's raw sell value. Larger sell pressure lowers W,
    // making the same raw sell amount consume more of the wall.
    let sensitivity_component = (wall_sensitivity_scaled as u128)
        .checked_mul(effective_sell_volume as u128)
        .ok_or(crate::OnreError::MathOverflow)?
        .checked_div(actual_liquidity as u128)
        .ok_or(crate::OnreError::DivByZero)?;
    let denominator = WALL_SENSITIVITY_SCALE
        .checked_add(sensitivity_component)
        .ok_or(crate::OnreError::MathOverflow)?;
    let wall = (actual_liquidity as u128)
        .checked_mul(WALL_SENSITIVITY_SCALE)
        .ok_or(crate::OnreError::MathOverflow)?
        .checked_div(denominator)
        .ok_or(crate::OnreError::DivByZero)?;
    require!(wall <= u64::MAX as u128, crate::OnreError::MathOverflow);
    Ok((wall as u64).max(1))
}

pub fn dynamic_wall_liquidity(
    current_sell_value_stable: u64,
    actual_liquidity: u64,
    hard_wall_reserve: u64,
    prop_amm_pair_state: &PropAmmPairState,
) -> Result<u64> {
    let now = Clock::get()?.unix_timestamp;
    dynamic_wall_liquidity_at_time(
        current_sell_value_stable,
        actual_liquidity,
        hard_wall_reserve,
        prop_amm_pair_state,
        now,
    )
}

pub fn dynamic_wall_liquidity_at_time(
    current_sell_value_stable: u64,
    actual_liquidity: u64,
    hard_wall_reserve: u64,
    prop_amm_pair_state: &PropAmmPairState,
    now: i64,
) -> Result<u64> {
    if prop_amm_pair_state.wall_sensitivity_scaled == 0 {
        return Ok(actual_liquidity.min(hard_wall_reserve));
    }

    let effective_sell_volume =
        preview_effective_sell_volume(prop_amm_pair_state, current_sell_value_stable, now)?;
    if effective_sell_volume == 0 {
        require!(actual_liquidity > 0, crate::OnreError::InsufficientBalance);
        return Ok(actual_liquidity.min(hard_wall_reserve));
    }

    let wall_position = dynamic_wall_position(
        actual_liquidity,
        effective_sell_volume,
        prop_amm_pair_state.wall_sensitivity_scaled,
    )?;
    Ok(wall_position.min(hard_wall_reserve))
}

pub fn apply_hard_wall_reserve_curve_with_params(
    token_out_amount: u64,
    actual_liquidity: u64,
    hard_wall_reserve: u64,
    curve_peg_haircut_bps: u16,
    curve_exponent_scaled: u32,
) -> Result<u64> {
    let prop_amm_pair_state = PropAmmPairState {
        curve_peg_haircut_bps,
        curve_exponent_scaled,
        min_cadence_exponent_scaled: DEFAULT_MIN_CADENCE_EXPONENT_SCALED,
        cadence_threshold: DEFAULT_CADENCE_THRESHOLD,
        cadence_sensitivity_scaled: 0,
        epoch_duration_seconds: super::config::DEFAULT_EPOCH_DURATION_SECONDS,
        wall_sensitivity_scaled: 0,
        curr_sell_value_stable: 0,
        curr_buy_value_stable: 0,
        prev_net_sell_value_stable: 0,
        curr_sell_trade_count: 0,
        epoch_start: Clock::get().map(|clock| clock.unix_timestamp).unwrap_or(0),
        bump: 0,
        ..Default::default()
    };
    apply_hard_wall_liquidity_factor_at_time(
        token_out_amount,
        actual_liquidity,
        hard_wall_reserve,
        &prop_amm_pair_state,
        prop_amm_pair_state.epoch_start,
    )
}

pub fn hard_wall_reserve_from_tvl(
    tvl: u64,
    vault_target_bps: u16,
    token_out_decimals: u8,
    onyc_decimals: u8,
) -> Result<u64> {
    let target_in_onyc_decimals = (tvl as u128)
        .checked_mul(vault_target_bps as u128)
        .ok_or(crate::OnreError::MathOverflow)?
        .checked_div(crate::constants::MAX_BASIS_POINTS as u128)
        .ok_or(crate::OnreError::DivByZero)?;
    let token_out_scale = 10_u128
        .checked_pow(token_out_decimals as u32)
        .ok_or(crate::OnreError::MathOverflow)?;
    let onyc_scale = 10_u128
        .checked_pow(onyc_decimals as u32)
        .ok_or(crate::OnreError::MathOverflow)?;
    let target = target_in_onyc_decimals
        .checked_mul(token_out_scale)
        .ok_or(crate::OnreError::MathOverflow)?
        .checked_div(onyc_scale)
        .ok_or(crate::OnreError::DivByZero)?;
    require!(target > 0, crate::OnreError::InsufficientBalance);
    require!(target <= u64::MAX as u128, crate::OnreError::MathOverflow);
    Ok(target as u64)
}
fn redemption_haircut_scaled(
    u: u128,
    curve_peg_haircut_bps: u16,
    curve_exponent_scaled: u32,
) -> Result<u128> {
    let peg_haircut = bps_to_hard_wall_scale(curve_peg_haircut_bps)?;
    if peg_haircut == 0 {
        validate_curve_exponent_scaled(curve_exponent_scaled)?;
        return Ok(0);
    }

    let utilization_power = utilization_power_scaled(u, curve_exponent_scaled)?;
    let curve_haircut = peg_haircut
        .saturating_mul(utilization_power)
        .checked_div(HARD_WALL_SCALE)
        .ok_or(crate::OnreError::DivByZero)?;
    Ok(curve_haircut)
}

pub fn effective_curve_exponent_scaled(
    prop_amm_pair_state: &PropAmmPairState,
    now: i64,
) -> Result<u32> {
    let threshold = prop_amm_pair_state.cadence_threshold;
    require!(threshold > 0, crate::OnreError::InvalidAmount);

    let base_exponent = prop_amm_pair_state
        .curve_exponent_scaled
        .max(prop_amm_pair_state.min_cadence_exponent_scaled);
    if prop_amm_pair_state.cadence_sensitivity_scaled == 0 {
        require!(
            prop_amm_pair_state.epoch_duration_seconds > 0,
            crate::OnreError::InvalidAmount
        );
        return Ok(base_exponent);
    }

    let quote_trade_count = preview_current_sell_trade_count(prop_amm_pair_state, now)?;
    if quote_trade_count == 0 {
        return Ok(base_exponent);
    }

    let raw_reduction = (prop_amm_pair_state.cadence_sensitivity_scaled as u128)
        .checked_mul(quote_trade_count as u128)
        .ok_or(crate::OnreError::MathOverflow)?
        .checked_div(threshold as u128)
        .ok_or(crate::OnreError::DivByZero)?;
    let reduction =
        raw_reduction.saturating_div(CURVE_EXPONENT_STEP as u128) * CURVE_EXPONENT_STEP as u128;
    require!(
        reduction <= u32::MAX as u128,
        crate::OnreError::MathOverflow
    );
    Ok(prop_amm_pair_state
        .curve_exponent_scaled
        .saturating_sub(reduction as u32)
        .max(prop_amm_pair_state.min_cadence_exponent_scaled))
}

fn preview_current_sell_trade_count(
    prop_amm_pair_state: &PropAmmPairState,
    now: i64,
) -> Result<u32> {
    let epoch_duration = prop_amm_pair_state.epoch_duration_seconds;
    require!(epoch_duration > 0, crate::OnreError::InvalidAmount);

    if prop_amm_pair_state.epoch_start == 0 || now < prop_amm_pair_state.epoch_start {
        return Ok(0);
    }
    let elapsed = now
        .checked_sub(prop_amm_pair_state.epoch_start)
        .ok_or(crate::OnreError::ArithmeticUnderflow)?;
    if elapsed >= epoch_duration {
        return Ok(0);
    }
    Ok(prop_amm_pair_state.curr_sell_trade_count)
}

#[allow(clippy::too_many_arguments)]
pub fn build_swap_buy_quote(
    program_id: &Pubkey,
    state: &State,
    offer_key: Pubkey,
    offer: &Offer,
    prop_amm_pair_state: &PropAmmPairState,
    token_in_amount: u64,
    token_in_mint: &InterfaceAccount<Mint>,
    token_out_mint: &InterfaceAccount<Mint>,
) -> Result<SwapQuote> {
    let quoted_at = Clock::get()?.unix_timestamp;
    offer.require_enabled()?;

    validate_prop_amm_pair_for_side(
        program_id,
        state,
        prop_amm_pair_state,
        offer_key,
        token_in_mint.key(),
        token_out_mint.key(),
        SwapSide::Buy,
    )?;

    let result = process_offer_core(
        offer,
        token_in_amount,
        token_in_mint,
        token_out_mint,
        offer.permissionless_fee_basis_points(),
    )
    .map(|result| SwapQuoteComputation {
        current_price: result.current_price,
        token_in_net_amount: result.token_in_net_amount,
        token_in_fee_amount: result.token_in_fee_amount,
        token_out_amount: result.token_out_amount,
    })?;

    Ok(SwapQuote {
        offer: offer_key,
        token_in_mint: token_in_mint.key(),
        token_out_mint: token_out_mint.key(),
        token_in_amount,
        token_in_net_amount: result.token_in_net_amount,
        token_in_fee_amount: result.token_in_fee_amount,
        token_out_amount: result.token_out_amount,
        minimum_out: result.token_out_amount,
        current_price: result.current_price,
        quoted_at,
    })
}

#[allow(clippy::too_many_arguments)]
pub fn build_swap_sell_quote(
    program_id: &Pubkey,
    state: &State,
    offer_key: Pubkey,
    offer: &Offer,
    prop_amm_pair_state: &PropAmmPairState,
    actual_liquidity: u64,
    hard_wall_reserve: u64,
    redemption_fee_basis_points: u16,
    token_in_amount: u64,
    token_in_mint: &InterfaceAccount<Mint>,
    token_out_mint: &InterfaceAccount<Mint>,
) -> Result<SwapQuote> {
    let quoted_at = Clock::get()?.unix_timestamp;
    offer.require_enabled()?;

    validate_prop_amm_pair_for_side(
        program_id,
        state,
        prop_amm_pair_state,
        offer_key,
        token_in_mint.key(),
        token_out_mint.key(),
        SwapSide::Sell,
    )?;

    let mut result = process_redemption_core(
        offer,
        token_in_amount,
        token_in_mint,
        token_out_mint,
        redemption_fee_basis_points,
        prop_amm_pair_state.minimum_sell_haircut_onyc,
    )
    .map(|result| SwapQuoteComputation {
        current_price: result.price,
        token_in_net_amount: result.token_in_net_amount,
        token_in_fee_amount: result.token_in_fee_amount,
        token_out_amount: result.token_out_amount,
    })?;
    result.token_out_amount = apply_hard_wall_liquidity_factor(
        result.token_out_amount,
        actual_liquidity,
        hard_wall_reserve,
        prop_amm_pair_state,
    )?;

    Ok(SwapQuote {
        offer: offer_key,
        token_in_mint: token_in_mint.key(),
        token_out_mint: token_out_mint.key(),
        token_in_amount,
        token_in_net_amount: result.token_in_net_amount,
        token_in_fee_amount: result.token_in_fee_amount,
        token_out_amount: result.token_out_amount,
        minimum_out: result.token_out_amount,
        current_price: result.current_price,
        quoted_at,
    })
}

pub fn quote_swap_buy(ctx: Context<QuoteSwapBuy>, token_in_amount: u64) -> Result<()> {
    let offer = ctx.accounts.offer.load()?;
    require!(
        !has_transfer_fee(&ctx.accounts.token_in_mint)?,
        crate::OnreError::TransferFeeNotSupported
    );
    require!(
        !has_transfer_fee(&ctx.accounts.token_out_mint)?,
        crate::OnreError::TransferFeeNotSupported
    );
    let quote = build_swap_buy_quote(
        ctx.program_id,
        &ctx.accounts.state,
        ctx.accounts.offer.key(),
        &offer,
        &ctx.accounts.prop_amm_pair_state,
        token_in_amount,
        &ctx.accounts.token_in_mint,
        &ctx.accounts.token_out_mint,
    )?;
    let mut serialized_quote = Vec::new();
    quote.serialize(&mut serialized_quote)?;
    set_return_data(&serialized_quote);

    msg!(
        "Swap buy quote - offer: {}, token_in: {}, minimum_out: {}",
        quote.offer,
        quote.token_in_amount,
        quote.minimum_out
    );

    Ok(())
}

pub fn quote_swap_sell(ctx: Context<QuoteSwapSell>, token_in_amount: u64) -> Result<()> {
    let offer = ctx.accounts.offer.load()?;
    require!(
        !has_transfer_fee(&ctx.accounts.token_in_mint)?,
        crate::OnreError::TransferFeeNotSupported
    );
    require!(
        !has_transfer_fee(&ctx.accounts.token_out_mint)?,
        crate::OnreError::TransferFeeNotSupported
    );
    let (market_stats_pda, _) =
        Pubkey::find_program_address(&[seeds::MARKET_STATS], ctx.program_id);
    require_keys_eq!(
        market_stats_pda,
        ctx.accounts.market_stats.key(),
        crate::OnreError::InvalidMarketStatsPda
    );
    let redemption_config = redemption_offer_config(
        ctx.program_id,
        &ctx.accounts.redemption_offer,
        ctx.accounts.offer.key(),
        ctx.accounts.token_in_mint.key(),
        ctx.accounts.token_out_mint.key(),
    )?;
    let actual_liquidity = ctx.accounts.redemption_vault_token_out_account.amount;
    let hard_wall_reserve = resolve_hard_wall_reserve(
        &ctx.accounts.market_stats,
        actual_liquidity,
        redemption_config.vault_target_bps,
        ctx.accounts.token_out_mint.decimals,
        ctx.accounts.token_in_mint.decimals,
    )?;
    let quote = build_swap_sell_quote(
        ctx.program_id,
        &ctx.accounts.state,
        ctx.accounts.offer.key(),
        &offer,
        &ctx.accounts.prop_amm_pair_state,
        actual_liquidity,
        hard_wall_reserve,
        redemption_config.fee_basis_points_prop_amm_sell,
        token_in_amount,
        &ctx.accounts.token_in_mint,
        &ctx.accounts.token_out_mint,
    )?;
    let mut serialized_quote = Vec::new();
    quote.serialize(&mut serialized_quote)?;
    set_return_data(&serialized_quote);

    msg!(
        "Swap sell quote - offer: {}, redemption_offer: {}, token_in: {}, minimum_out: {}",
        quote.offer,
        ctx.accounts.redemption_offer.key(),
        quote.token_in_amount,
        quote.minimum_out
    );

    Ok(())
}
