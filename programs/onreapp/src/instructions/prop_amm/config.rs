use crate::constants::{seeds, MAX_BASIS_POINTS};
use crate::instructions::Offer;
use crate::state::State;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

pub const DEFAULT_CURVE_PEG_HAIRCUT_BPS: u16 = 700;
pub const CURVE_EXPONENT_SCALE: u32 = 10_000;
pub const CURVE_EXPONENT_STEP: u32 = 1_000;
pub const DEFAULT_CURVE_EXPONENT_SCALED: u32 = 25_000;
pub const DEFAULT_MIN_CADENCE_EXPONENT_SCALED: u32 = 1_000;
pub const DEFAULT_CADENCE_THRESHOLD: u32 = 20;
pub const DEFAULT_CADENCE_SENSITIVITY_SCALED: u32 = 10_000;
pub const DEFAULT_EPOCH_DURATION_SECONDS: i64 = 86_400;
pub const WALL_SENSITIVITY_SCALE: u128 = 10_000;
pub const DEFAULT_WALL_SENSITIVITY_SCALED: u32 = 20_000;
pub const DEFAULT_MINIMUM_SELL_HAIRCUT_ONYC: u64 = 5_000_000_000;
pub const PROP_AMM_PAIR_STATE_RESERVED_BYTES: usize = 284;

#[account]
#[derive(InitSpace)]
pub struct PropAmmPairState {
    pub offer: Pubkey,
    pub asset_mint: Pubkey,
    pub onyc_mint: Pubkey,
    pub enabled: bool,
    pub curve_peg_haircut_bps: u16,
    pub curve_exponent_scaled: u32,
    pub min_cadence_exponent_scaled: u32,
    pub cadence_threshold: u32,
    pub cadence_sensitivity_scaled: u32,
    pub epoch_duration_seconds: i64,
    pub wall_sensitivity_scaled: u32,
    pub minimum_sell_haircut_onyc: u64,
    pub curr_sell_value_stable: u64,
    pub curr_buy_value_stable: u64,
    pub prev_net_sell_value_stable: u64,
    pub curr_sell_trade_count: u32,
    pub epoch_start: i64,
    pub bump: u8,
    pub reserved: [u8; PROP_AMM_PAIR_STATE_RESERVED_BYTES],
}

#[event]
pub struct PropAmmConfiguredEvent {
    pub offer: Pubkey,
    pub asset_mint: Pubkey,
    pub onyc_mint: Pubkey,
    pub old_enabled: bool,
    pub new_enabled: bool,
    pub old_curve_peg_haircut_bps: u16,
    pub new_curve_peg_haircut_bps: u16,
    pub old_curve_exponent_scaled: u32,
    pub new_curve_exponent_scaled: u32,
    pub old_min_cadence_exponent_scaled: u32,
    pub new_min_cadence_exponent_scaled: u32,
    pub old_cadence_threshold: u32,
    pub new_cadence_threshold: u32,
    pub old_cadence_sensitivity_scaled: u32,
    pub new_cadence_sensitivity_scaled: u32,
    pub old_epoch_duration_seconds: i64,
    pub new_epoch_duration_seconds: i64,
    pub old_wall_sensitivity_scaled: u32,
    pub new_wall_sensitivity_scaled: u32,
    pub old_minimum_sell_haircut_onyc: u64,
    pub new_minimum_sell_haircut_onyc: u64,
}

#[derive(Accounts)]
pub struct ConfigurePropAmm<'info> {
    #[account(
        seeds = [seeds::STATE],
        bump = state.bump,
        has_one = boss @ crate::OnreError::InvalidBoss
    )]
    pub state: Box<Account<'info, State>>,

    #[account(
        seeds = [
            seeds::OFFER,
            asset_mint.key().as_ref(),
            state.onyc_mint.as_ref()
        ],
        bump = offer.load()?.bump
    )]
    pub offer: AccountLoader<'info, Offer>,

    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = boss,
        space = 8 + PropAmmPairState::INIT_SPACE,
        seeds = [seeds::PROP_AMM_PAIR_STATE, offer.key().as_ref()],
        bump
    )]
    pub prop_amm_pair_state: Box<Account<'info, PropAmmPairState>>,

    #[account(mut)]
    pub boss: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn configure_prop_amm(
    ctx: Context<ConfigurePropAmm>,
    enabled: bool,
    curve_peg_haircut_bps: u16,
    curve_exponent_scaled: u32,
    min_cadence_exponent_scaled: u32,
    cadence_threshold: u32,
    cadence_sensitivity_scaled: u32,
    epoch_duration_seconds: i64,
    wall_sensitivity_scaled: u32,
    minimum_sell_haircut_onyc: u64,
) -> Result<()> {
    require!(
        curve_peg_haircut_bps <= MAX_BASIS_POINTS,
        crate::OnreError::InvalidAmount
    );
    require!(
        (CURVE_EXPONENT_STEP..=CURVE_EXPONENT_SCALE.saturating_mul(10))
            .contains(&curve_exponent_scaled),
        crate::OnreError::InvalidAmount
    );
    require!(
        curve_exponent_scaled % CURVE_EXPONENT_STEP == 0,
        crate::OnreError::InvalidAmount
    );
    require!(
        (CURVE_EXPONENT_STEP..=CURVE_EXPONENT_SCALE).contains(&min_cadence_exponent_scaled),
        crate::OnreError::InvalidAmount
    );
    require!(
        min_cadence_exponent_scaled % CURVE_EXPONENT_STEP == 0,
        crate::OnreError::InvalidAmount
    );
    require!(cadence_threshold > 0, crate::OnreError::InvalidAmount);
    require!(
        cadence_sensitivity_scaled <= CURVE_EXPONENT_SCALE.saturating_mul(10),
        crate::OnreError::InvalidAmount
    );
    require!(epoch_duration_seconds > 0, crate::OnreError::InvalidAmount);
    require!(wall_sensitivity_scaled > 0, crate::OnreError::InvalidAmount);

    let offer = ctx.accounts.offer.load()?;
    offer.require_mints(ctx.accounts.asset_mint.key(), ctx.accounts.state.onyc_mint)?;

    let prop_amm_pair_state = &mut ctx.accounts.prop_amm_pair_state;
    let old_enabled = prop_amm_pair_state.enabled;
    let old_curve_peg_haircut_bps = prop_amm_pair_state.curve_peg_haircut_bps;
    let old_curve_exponent_scaled = prop_amm_pair_state.curve_exponent_scaled;
    let old_min_cadence_exponent_scaled = prop_amm_pair_state.min_cadence_exponent_scaled;
    let old_cadence_threshold = prop_amm_pair_state.cadence_threshold;
    let old_cadence_sensitivity_scaled = prop_amm_pair_state.cadence_sensitivity_scaled;
    let old_epoch_duration_seconds = prop_amm_pair_state.epoch_duration_seconds;
    let old_wall_sensitivity_scaled = prop_amm_pair_state.wall_sensitivity_scaled;
    let old_minimum_sell_haircut_onyc = prop_amm_pair_state.minimum_sell_haircut_onyc;

    prop_amm_pair_state.offer = ctx.accounts.offer.key();
    prop_amm_pair_state.asset_mint = ctx.accounts.asset_mint.key();
    prop_amm_pair_state.onyc_mint = ctx.accounts.state.onyc_mint;
    prop_amm_pair_state.enabled = enabled;
    prop_amm_pair_state.curve_peg_haircut_bps = curve_peg_haircut_bps;
    prop_amm_pair_state.curve_exponent_scaled = curve_exponent_scaled;
    prop_amm_pair_state.min_cadence_exponent_scaled = min_cadence_exponent_scaled;
    prop_amm_pair_state.cadence_threshold = cadence_threshold;
    prop_amm_pair_state.cadence_sensitivity_scaled = cadence_sensitivity_scaled;
    prop_amm_pair_state.epoch_duration_seconds = epoch_duration_seconds;
    prop_amm_pair_state.wall_sensitivity_scaled = wall_sensitivity_scaled;
    prop_amm_pair_state.minimum_sell_haircut_onyc = minimum_sell_haircut_onyc;
    if prop_amm_pair_state.epoch_start == 0 {
        prop_amm_pair_state.epoch_start = Clock::get()?.unix_timestamp;
    }
    prop_amm_pair_state.bump = ctx.bumps.prop_amm_pair_state;

    emit!(PropAmmConfiguredEvent {
        offer: ctx.accounts.offer.key(),
        asset_mint: ctx.accounts.asset_mint.key(),
        onyc_mint: ctx.accounts.state.onyc_mint,
        old_enabled,
        new_enabled: enabled,
        old_curve_peg_haircut_bps,
        new_curve_peg_haircut_bps: curve_peg_haircut_bps,
        old_curve_exponent_scaled,
        new_curve_exponent_scaled: curve_exponent_scaled,
        old_min_cadence_exponent_scaled,
        new_min_cadence_exponent_scaled: min_cadence_exponent_scaled,
        old_cadence_threshold,
        new_cadence_threshold: cadence_threshold,
        old_cadence_sensitivity_scaled,
        new_cadence_sensitivity_scaled: cadence_sensitivity_scaled,
        old_epoch_duration_seconds,
        new_epoch_duration_seconds: epoch_duration_seconds,
        old_wall_sensitivity_scaled,
        new_wall_sensitivity_scaled: wall_sensitivity_scaled,
        old_minimum_sell_haircut_onyc,
        new_minimum_sell_haircut_onyc: minimum_sell_haircut_onyc,
    });

    Ok(())
}

impl Default for PropAmmPairState {
    fn default() -> Self {
        Self {
            offer: Pubkey::default(),
            asset_mint: Pubkey::default(),
            onyc_mint: Pubkey::default(),
            enabled: false,
            curve_peg_haircut_bps: DEFAULT_CURVE_PEG_HAIRCUT_BPS,
            curve_exponent_scaled: DEFAULT_CURVE_EXPONENT_SCALED,
            min_cadence_exponent_scaled: DEFAULT_MIN_CADENCE_EXPONENT_SCALED,
            cadence_threshold: DEFAULT_CADENCE_THRESHOLD,
            cadence_sensitivity_scaled: DEFAULT_CADENCE_SENSITIVITY_SCALED,
            epoch_duration_seconds: DEFAULT_EPOCH_DURATION_SECONDS,
            wall_sensitivity_scaled: DEFAULT_WALL_SENSITIVITY_SCALED,
            minimum_sell_haircut_onyc: DEFAULT_MINIMUM_SELL_HAIRCUT_ONYC,
            curr_sell_value_stable: 0,
            curr_buy_value_stable: 0,
            prev_net_sell_value_stable: 0,
            curr_sell_trade_count: 0,
            epoch_start: 0,
            bump: 0,
            reserved: [0; PROP_AMM_PAIR_STATE_RESERVED_BYTES],
        }
    }
}
