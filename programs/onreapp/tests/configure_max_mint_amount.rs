mod common;

use common::*;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;

#[test]
fn test_boss_can_configure_max_mint_amount() {
    let (mut svm, payer, _onyc_mint) = setup_initialized();
    let boss = payer.pubkey();

    let ix = build_configure_max_mint_amount_ix(&boss, 50_000_000_000);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    let state = read_state(&svm);
    assert_eq!(state.max_mint_amount, 50_000_000_000);
}

#[test]
fn test_configure_max_mint_amount_to_zero() {
    let (mut svm, payer, _onyc_mint) = setup_initialized();
    let boss = payer.pubkey();

    let ix = build_configure_max_mint_amount_ix(&boss, 50_000_000_000);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();
    advance_slot(&mut svm);

    let ix = build_configure_max_mint_amount_ix(&boss, 0);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    let state = read_state(&svm);
    assert_eq!(state.max_mint_amount, 0);
}

#[test]
fn test_non_boss_cannot_configure_max_mint_amount() {
    let (mut svm, _payer, _onyc_mint) = setup_initialized();

    let non_boss = Keypair::new();
    svm.airdrop(&non_boss.pubkey(), INITIAL_LAMPORTS).unwrap();

    let ix = build_configure_max_mint_amount_ix(&non_boss.pubkey(), 50_000_000_000);
    let result = send_tx(&mut svm, &[ix], &[&non_boss]);
    assert!(
        result.is_err(),
        "non-boss should not configure max mint per mint"
    );
}

#[test]
fn test_mint_to_cannot_exceed_max_mint_amount() {
    let (mut svm, payer, onyc_mint) = setup_initialized();
    let boss = payer.pubkey();

    let ix = build_configure_max_mint_amount_ix(&boss, 50_000_000_000);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();
    advance_slot(&mut svm);

    let ix = build_transfer_mint_authority_to_program_ix(&boss, &onyc_mint, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();
    advance_slot(&mut svm);

    let ix = build_mint_to_ix(&boss, &onyc_mint, 50_000_000_001, &TOKEN_PROGRAM_ID);
    let result = send_tx(&mut svm, &[ix], &[&payer]);
    assert!(result.is_err(), "should not exceed per-mint cap");
}

#[test]
fn test_mint_to_multiple_mints_can_reach_supply_above_per_mint_cap() {
    let (mut svm, payer, onyc_mint) = setup_initialized();
    let boss = payer.pubkey();

    let ix = build_configure_max_mint_amount_ix(&boss, 50_000_000_000);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();
    advance_slot(&mut svm);

    let ix = build_transfer_mint_authority_to_program_ix(&boss, &onyc_mint, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();
    advance_slot(&mut svm);

    let ix = build_mint_to_ix(&boss, &onyc_mint, 50_000_000_000, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();
    advance_slot(&mut svm);

    let ix = build_mint_to_ix(&boss, &onyc_mint, 50_000_000_000, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    let boss_ata = get_associated_token_address(&boss, &onyc_mint);
    assert_eq!(get_token_balance(&svm, &boss_ata), 100_000_000_000);
}
