use onreapp::instructions::prop_amm::pricing::{
    apply_hard_wall_liquidity_factor_at_time, cadence_wave_target_haircut_scaled,
    cadence_wave_y_for_quote_scaled, record_prop_amm_sell, roll_prop_amm_volume_tracker,
};
use onreapp::instructions::PropAmmPairState;

const SCALE: u128 = 1_000_000_000_000;

fn next(seed: &mut u64) -> u64 {
    *seed = seed
        .wrapping_mul(6_364_136_223_846_793_005)
        .wrapping_add(1_442_695_040_888_963_407);
    *seed
}

fn main() {
    for wave_y in (0_u128..=50_000).step_by(1_000) {
        for index in 0_u128..=2_000 {
            let utilization = index * (SCALE / 1_000);
            let target = cadence_wave_target_haircut_scaled(utilization, wave_y).unwrap();
            println!("T\t{utilization}\t{wave_y}\t{target}");
        }
    }
    println!(
        "T\t{}\t50000\t{}",
        u128::MAX,
        cadence_wave_target_haircut_scaled(u128::MAX, 50_000).unwrap()
    );

    let mut seed = 0x4f4e_5245_4341_4445_u64;
    for index in 0..63_750_u64 {
        let threshold = (index % 250 + 1) as u32;
        let wave = ((index / 250) % 51) as u32 * 1_000;
        let count = match index / (250 * 51) {
            0 => 0,
            1 => 1,
            2 => threshold.saturating_sub(1),
            3 => threshold,
            _ => threshold.saturating_add(1),
        };
        let duration = (next(&mut seed) % 604_800 + 1) as i64;
        let epoch_start: i64 = if index % 7 == 0 { 0 } else { 1_000_000 };
        let now = match index % 6 {
            0 => epoch_start.saturating_sub(1),
            1 => epoch_start,
            2 => epoch_start.saturating_add(duration.saturating_sub(1)),
            3 => epoch_start.saturating_add(duration),
            4 => epoch_start.saturating_add(duration.saturating_mul(2)),
            _ => epoch_start.saturating_add((next(&mut seed) % duration as u64) as i64),
        };
        let state = PropAmmPairState {
            cadence_threshold: threshold,
            cadence_wave_scaled: wave,
            epoch_duration_seconds: duration,
            curr_sell_trade_count: count,
            epoch_start,
            ..Default::default()
        };
        let result = cadence_wave_y_for_quote_scaled(&state, now).unwrap();
        println!("Y\t{threshold}\t{wave}\t{count}\t{duration}\t{epoch_start}\t{now}\t{result}");
    }

    for index in 0..51_000_u64 {
        let actual = next(&mut seed) % 1_000_000_000_000 + 1;
        let raw = next(&mut seed) % (actual + 1);
        let reserve = next(&mut seed) % actual + 1;
        let peg_bps = (next(&mut seed) % 10_001) as u16;
        let exponent = (index % 100 + 1) as u32 * 1_000;
        let threshold = (next(&mut seed) % 250 + 1) as u32;
        let wave = ((index / 100) % 51) as u32 * 1_000;
        let duration = (next(&mut seed) % 604_800 + 1) as i64;
        let sensitivity = (next(&mut seed) % 200_000 + 1) as u32;
        let curr_sell = next(&mut seed) % 1_000_000_000_000;
        let curr_buy = next(&mut seed) % 1_000_000_000_000;
        let prev_sell = next(&mut seed) % 1_000_000_000_000;
        let count = (next(&mut seed) % 1_001) as u32;
        let epoch_start: i64 = if index % 11 == 0 { 0 } else { 1_000_000 };
        let now = match index % 6 {
            0 => epoch_start.saturating_sub(1),
            1 => epoch_start,
            2 => epoch_start.saturating_add(duration.saturating_sub(1)),
            3 => epoch_start.saturating_add(duration),
            4 => epoch_start.saturating_add(duration.saturating_mul(2)),
            _ => epoch_start.saturating_add((next(&mut seed) % duration as u64) as i64),
        };
        let state = PropAmmPairState {
            curve_peg_haircut_bps: peg_bps,
            curve_exponent_scaled: exponent,
            cadence_threshold: threshold,
            cadence_wave_scaled: wave,
            epoch_duration_seconds: duration,
            wall_sensitivity_scaled: sensitivity,
            curr_sell_value_stable: curr_sell,
            curr_buy_value_stable: curr_buy,
            prev_net_sell_value_stable: prev_sell,
            curr_sell_trade_count: count,
            epoch_start,
            ..Default::default()
        };
        let output =
            apply_hard_wall_liquidity_factor_at_time(raw, actual, reserve, &state, now).unwrap();
        println!(
            "F\t{raw}\t{actual}\t{reserve}\t{peg_bps}\t{exponent}\t{threshold}\t{wave}\t{duration}\t{sensitivity}\t{curr_sell}\t{curr_buy}\t{prev_sell}\t{count}\t{epoch_start}\t{now}\t{output}"
        );
    }

    for index in 0..50_000_u64 {
        let operation = index % 2;
        let amount = next(&mut seed) % 1_000_000_000_000;
        let duration = (next(&mut seed) % 604_800 + 1) as i64;
        let epoch_start: i64 = if index % 11 == 0 { 0 } else { 1_000_000 };
        let now = match index % 6 {
            0 => epoch_start.saturating_sub(1),
            1 => epoch_start,
            2 => epoch_start.saturating_add(duration.saturating_sub(1)),
            3 => epoch_start.saturating_add(duration),
            4 => epoch_start.saturating_add(duration.saturating_mul(2)),
            _ => epoch_start.saturating_add((next(&mut seed) % duration as u64) as i64),
        };
        let curr_sell = next(&mut seed) % 1_000_000_000_000;
        let curr_buy = next(&mut seed) % 1_000_000_000_000;
        let prev_sell = next(&mut seed) % 1_000_000_000_000;
        let count = (next(&mut seed) % 1_001) as u32;
        let mut state = PropAmmPairState {
            epoch_duration_seconds: duration,
            curr_sell_value_stable: curr_sell,
            curr_buy_value_stable: curr_buy,
            prev_net_sell_value_stable: prev_sell,
            curr_sell_trade_count: count,
            epoch_start,
            ..Default::default()
        };
        if operation == 0 {
            roll_prop_amm_volume_tracker(&mut state, now).unwrap();
        } else {
            record_prop_amm_sell(&mut state, amount, now).unwrap();
        }
        println!(
            "R\t{operation}\t{now}\t{amount}\t{duration}\t{epoch_start}\t{curr_sell}\t{curr_buy}\t{prev_sell}\t{count}\t{}\t{}\t{}\t{}\t{}",
            state.epoch_start,
            state.curr_sell_value_stable,
            state.curr_buy_value_stable,
            state.prev_net_sell_value_stable,
            state.curr_sell_trade_count,
        );
    }
}
