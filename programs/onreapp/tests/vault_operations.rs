mod common;

use common::*;
use solana_sdk::instruction::AccountMeta;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;

fn setup_vault() -> (litesvm::LiteSVM, Keypair, solana_sdk::pubkey::Pubkey) {
    let (svm, payer, onyc_mint) = setup_initialized();
    (svm, payer, onyc_mint)
}

// ---------------------------------------------------------------------------
// Offer Vault Deposit
// ---------------------------------------------------------------------------

#[test]
fn test_offer_vault_deposit_success() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_mint = create_mint(&mut svm, &payer, 9, &boss);
    let _boss_ata = create_token_account(&mut svm, &token_mint, &boss, 1_000_000_000_000);

    let (vault_authority, _) = find_offer_vault_authority_pda();
    let vault_ata = get_associated_token_address(&vault_authority, &token_mint);

    let ix = build_offer_vault_deposit_ix(&boss, &token_mint, 100_000_000_000, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    assert_eq!(get_token_balance(&svm, &vault_ata), 100_000_000_000);
    let boss_ata = get_associated_token_address(&boss, &token_mint);
    assert_eq!(get_token_balance(&svm, &boss_ata), 900_000_000_000);
}

#[test]
fn test_offer_vault_deposit_any_user_can_deposit() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_mint = create_mint(&mut svm, &payer, 9, &boss);

    let non_boss = Keypair::new();
    svm.airdrop(&non_boss.pubkey(), INITIAL_LAMPORTS).unwrap();
    create_token_account(&mut svm, &token_mint, &non_boss.pubkey(), 1_000_000_000_000);

    let (vault_authority, _) = find_offer_vault_authority_pda();
    let vault_ata = get_associated_token_address(&vault_authority, &token_mint);

    let ix = build_offer_vault_deposit_ix(
        &non_boss.pubkey(),
        &token_mint,
        10_000_000_000,
        &TOKEN_PROGRAM_ID,
    );
    send_tx(&mut svm, &[ix], &[&non_boss]).unwrap();

    assert_eq!(get_token_balance(&svm, &vault_ata), 10_000_000_000);
}

#[test]
fn test_offer_vault_deposit_rejects_when_killed() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_mint = create_mint(&mut svm, &payer, 9, &boss);
    create_token_account(&mut svm, &token_mint, &boss, 1_000_000_000_000);

    let ix = build_set_kill_switch_ix(&boss, true);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    let ix = build_offer_vault_deposit_ix(&boss, &token_mint, 100_000_000_000, &TOKEN_PROGRAM_ID);
    let result = send_tx(&mut svm, &[ix], &[&payer]);
    assert!(
        result.is_err(),
        "kill switch should block offer vault deposits"
    );
}

// ---------------------------------------------------------------------------
// Offer Vault Withdraw
// ---------------------------------------------------------------------------

#[test]
fn test_offer_vault_withdraw_success() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_mint = create_mint(&mut svm, &payer, 9, &boss);
    let boss_ata = create_token_account(&mut svm, &token_mint, &boss, 1_000_000_000_000);

    let ix = build_offer_vault_deposit_ix(&boss, &token_mint, 100_000_000_000, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    advance_slot(&mut svm);

    let ix = build_offer_vault_withdraw_ix(&boss, &token_mint, 50_000_000_000, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    let (vault_authority, _) = find_offer_vault_authority_pda();
    let vault_ata = get_associated_token_address(&vault_authority, &token_mint);

    assert_eq!(get_token_balance(&svm, &vault_ata), 50_000_000_000);
    assert_eq!(get_token_balance(&svm, &boss_ata), 950_000_000_000);
}

#[test]
fn test_offer_vault_withdraw_rejects_non_boss() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_mint = create_mint(&mut svm, &payer, 9, &boss);
    create_token_account(&mut svm, &token_mint, &boss, 1_000_000_000_000);

    let ix = build_offer_vault_deposit_ix(&boss, &token_mint, 100_000_000_000, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    advance_slot(&mut svm);

    let non_boss = Keypair::new();
    svm.airdrop(&non_boss.pubkey(), INITIAL_LAMPORTS).unwrap();

    let ix = build_offer_vault_withdraw_ix(
        &non_boss.pubkey(),
        &token_mint,
        10_000_000_000,
        &TOKEN_PROGRAM_ID,
    );
    let result = send_tx(&mut svm, &[ix], &[&non_boss]);
    assert!(result.is_err(), "non-boss should not be able to withdraw");
}

#[test]
fn test_offer_vault_withdraw_rejects_when_killed() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_mint = create_mint(&mut svm, &payer, 9, &boss);
    create_token_account(&mut svm, &token_mint, &boss, 1_000_000_000_000);

    let ix = build_offer_vault_deposit_ix(&boss, &token_mint, 100_000_000_000, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();
    advance_slot(&mut svm);

    let ix = build_set_kill_switch_ix(&boss, true);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    let ix = build_offer_vault_withdraw_ix(&boss, &token_mint, 10_000_000_000, &TOKEN_PROGRAM_ID);
    let result = send_tx(&mut svm, &[ix], &[&payer]);
    assert!(
        result.is_err(),
        "kill switch should block offer vault withdrawals"
    );
}

// ---------------------------------------------------------------------------
// Redemption Vault Deposit
// ---------------------------------------------------------------------------

#[test]
fn test_redemption_vault_deposit_preserves_legacy_account_order() {
    let depositor = solana_sdk::pubkey::Pubkey::new_unique();
    let token_mint = solana_sdk::pubkey::Pubkey::new_unique();
    let (state, _) = find_state_pda();
    let (vault_authority, _) = find_redemption_vault_authority_pda();
    let depositor_token_account = get_associated_token_address(&depositor, &token_mint);
    let vault_token_account = get_associated_token_address(&vault_authority, &token_mint);

    let ix = build_redemption_vault_deposit_ix(&depositor, &token_mint, 1, &TOKEN_PROGRAM_ID);

    assert_eq!(
        ix.accounts,
        vec![
            AccountMeta::new_readonly(vault_authority, false),
            AccountMeta::new_readonly(token_mint, false),
            AccountMeta::new(depositor_token_account, false),
            AccountMeta::new(vault_token_account, false),
            AccountMeta::new(depositor, true),
            AccountMeta::new_readonly(state, false),
            AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
            AccountMeta::new_readonly(ATA_PROGRAM_ID, false),
            AccountMeta::new_readonly(SYSTEM_PROGRAM_ID, false),
        ]
    );
}

#[test]
fn test_redemption_vault_deposit_success() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_mint = create_mint(&mut svm, &payer, 9, &boss);
    let _boss_ata = create_token_account(&mut svm, &token_mint, &boss, 1_000_000_000_000);

    let (redemption_vault_authority, _) = find_redemption_vault_authority_pda();
    let vault_ata = get_associated_token_address(&redemption_vault_authority, &token_mint);

    let ix =
        build_redemption_vault_deposit_ix(&boss, &token_mint, 100_000_000_000, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    assert_eq!(get_token_balance(&svm, &vault_ata), 100_000_000_000);
    let boss_ata = get_associated_token_address(&boss, &token_mint);
    assert_eq!(get_token_balance(&svm, &boss_ata), 900_000_000_000);
}

#[test]
fn test_redemption_vault_deposit_any_user_can_deposit() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_mint = create_mint(&mut svm, &payer, 9, &boss);

    let non_boss = Keypair::new();
    svm.airdrop(&non_boss.pubkey(), INITIAL_LAMPORTS).unwrap();
    create_token_account(&mut svm, &token_mint, &non_boss.pubkey(), 1_000_000_000_000);

    let (redemption_vault_authority, _) = find_redemption_vault_authority_pda();
    let vault_ata = get_associated_token_address(&redemption_vault_authority, &token_mint);

    let ix = build_redemption_vault_deposit_ix(
        &non_boss.pubkey(),
        &token_mint,
        10_000_000_000,
        &TOKEN_PROGRAM_ID,
    );
    send_tx(&mut svm, &[ix], &[&non_boss]).unwrap();

    assert_eq!(get_token_balance(&svm, &vault_ata), 10_000_000_000);
}

#[test]
fn test_redemption_vault_deposit_rejects_when_killed() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_mint = create_mint(&mut svm, &payer, 9, &boss);
    create_token_account(&mut svm, &token_mint, &boss, 1_000_000_000_000);

    let ix = build_set_kill_switch_ix(&boss, true);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    let ix =
        build_redemption_vault_deposit_ix(&boss, &token_mint, 100_000_000_000, &TOKEN_PROGRAM_ID);
    let result = send_tx(&mut svm, &[ix], &[&payer]);
    assert!(
        result.is_err(),
        "kill switch should block redemption vault deposits"
    );
}

// ---------------------------------------------------------------------------
// Redemption Vault Withdraw
// ---------------------------------------------------------------------------

#[test]
fn test_redemption_vault_withdraw_success() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_mint = create_mint(&mut svm, &payer, 9, &boss);
    let boss_ata = create_token_account(&mut svm, &token_mint, &boss, 1_000_000_000_000);

    let ix =
        build_redemption_vault_deposit_ix(&boss, &token_mint, 100_000_000_000, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    advance_slot(&mut svm);

    let ix =
        build_redemption_vault_withdraw_ix(&boss, &token_mint, 50_000_000_000, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    let (redemption_vault_authority, _) = find_redemption_vault_authority_pda();
    let vault_ata = get_associated_token_address(&redemption_vault_authority, &token_mint);

    assert_eq!(get_token_balance(&svm, &vault_ata), 50_000_000_000);
    assert_eq!(get_token_balance(&svm, &boss_ata), 950_000_000_000);
}

#[test]
fn test_redemption_vault_withdraw_rejects_non_boss() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_mint = create_mint(&mut svm, &payer, 9, &boss);
    create_token_account(&mut svm, &token_mint, &boss, 1_000_000_000_000);

    let ix =
        build_redemption_vault_deposit_ix(&boss, &token_mint, 100_000_000_000, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    advance_slot(&mut svm);

    let non_boss = Keypair::new();
    svm.airdrop(&non_boss.pubkey(), INITIAL_LAMPORTS).unwrap();

    let ix = build_redemption_vault_withdraw_ix(
        &non_boss.pubkey(),
        &token_mint,
        10_000_000_000,
        &TOKEN_PROGRAM_ID,
    );
    let result = send_tx(&mut svm, &[ix], &[&non_boss]);
    assert!(
        result.is_err(),
        "non-boss should not be able to withdraw from redemption vault"
    );
}

#[test]
fn test_redemption_vault_withdraw_rejects_when_killed() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_mint = create_mint(&mut svm, &payer, 9, &boss);
    create_token_account(&mut svm, &token_mint, &boss, 1_000_000_000_000);

    let ix =
        build_redemption_vault_deposit_ix(&boss, &token_mint, 100_000_000_000, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();
    advance_slot(&mut svm);

    let ix = build_set_kill_switch_ix(&boss, true);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    let ix =
        build_redemption_vault_withdraw_ix(&boss, &token_mint, 10_000_000_000, &TOKEN_PROGRAM_ID);
    let result = send_tx(&mut svm, &[ix], &[&payer]);
    assert!(
        result.is_err(),
        "kill switch should block redemption vault withdrawals"
    );
}

// ---------------------------------------------------------------------------
// Full cycle test
// ---------------------------------------------------------------------------

#[test]
fn test_deposit_withdraw_full_cycle() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_mint = create_mint(&mut svm, &payer, 9, &boss);
    let boss_ata = create_token_account(&mut svm, &token_mint, &boss, 1_000_000_000_000);

    // Deposit to offer vault
    let ix = build_offer_vault_deposit_ix(&boss, &token_mint, 200_000_000_000, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();
    advance_slot(&mut svm);

    // Withdraw entire amount
    let ix = build_offer_vault_withdraw_ix(&boss, &token_mint, 200_000_000_000, &TOKEN_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    // Balance should be back to original
    assert_eq!(get_token_balance(&svm, &boss_ata), 1_000_000_000_000);
}

// ===========================================================================
// Token-2022 Tests
// ===========================================================================

#[test]
fn test_offer_vault_deposit_withdraw_token2022() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_mint = create_mint_2022(&mut svm, &payer, 9, &boss);
    let boss_ata = create_token_account_2022(&mut svm, &token_mint, &boss, 1_000_000_000_000);

    let (vault_authority, _) = find_offer_vault_authority_pda();
    let vault_ata = get_associated_token_address_2022(&vault_authority, &token_mint);

    // Deposit
    let ix =
        build_offer_vault_deposit_ix(&boss, &token_mint, 100_000_000_000, &TOKEN_2022_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    assert_eq!(get_token_balance(&svm, &vault_ata), 100_000_000_000);
    assert_eq!(get_token_balance(&svm, &boss_ata), 900_000_000_000);

    advance_slot(&mut svm);

    // Withdraw
    let ix =
        build_offer_vault_withdraw_ix(&boss, &token_mint, 50_000_000_000, &TOKEN_2022_PROGRAM_ID);
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    assert_eq!(get_token_balance(&svm, &vault_ata), 50_000_000_000);
    assert_eq!(get_token_balance(&svm, &boss_ata), 950_000_000_000);
}

#[test]
fn test_redemption_vault_deposit_withdraw_token2022() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_mint = create_mint_2022(&mut svm, &payer, 9, &boss);
    let boss_ata = create_token_account_2022(&mut svm, &token_mint, &boss, 1_000_000_000_000);

    let (redemption_vault_authority, _) = find_redemption_vault_authority_pda();
    let vault_ata = get_associated_token_address_2022(&redemption_vault_authority, &token_mint);

    // Deposit
    let ix = build_redemption_vault_deposit_ix(
        &boss,
        &token_mint,
        100_000_000_000,
        &TOKEN_2022_PROGRAM_ID,
    );
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    assert_eq!(get_token_balance(&svm, &vault_ata), 100_000_000_000);
    assert_eq!(get_token_balance(&svm, &boss_ata), 900_000_000_000);

    advance_slot(&mut svm);

    // Withdraw
    let ix = build_redemption_vault_withdraw_ix(
        &boss,
        &token_mint,
        50_000_000_000,
        &TOKEN_2022_PROGRAM_ID,
    );
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    assert_eq!(get_token_balance(&svm, &vault_ata), 50_000_000_000);
    assert_eq!(get_token_balance(&svm, &boss_ata), 950_000_000_000);
}

#[test]
fn test_vault_wrong_token_program_fails() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    // Create a Token-2022 mint but try to deposit using SPL Token program
    let token_mint = create_mint_2022(&mut svm, &payer, 9, &boss);
    create_token_account_2022(&mut svm, &token_mint, &boss, 1_000_000_000_000);

    // Using the standard builder (which passes TOKEN_PROGRAM_ID) with a Token-2022 mint
    let ix = build_offer_vault_deposit_ix(&boss, &token_mint, 100_000_000_000, &TOKEN_PROGRAM_ID);
    let result = send_tx(&mut svm, &[ix], &[&payer]);
    assert!(result.is_err(), "wrong token program should fail");
}

// ---------------------------------------------------------------------------
// Vault initialization via make_offer
// ---------------------------------------------------------------------------

#[test]
fn test_vault_initialized_correctly() {
    let (mut svm, payer, _) = setup_vault();
    let boss = payer.pubkey();

    let token_in = create_mint(&mut svm, &payer, 9, &boss);
    let token_out = create_mint(&mut svm, &payer, 9, &boss);

    // Making an offer should create the vault ATA for token_in under the vault authority
    let ix = build_make_offer_ix(
        &boss,
        &token_in,
        &token_out,
        0,
        false,
        false,
        &TOKEN_PROGRAM_ID,
    );
    send_tx(&mut svm, &[ix], &[&payer]).unwrap();

    // Verify the offer vault account exists and has zero balance
    let (vault_authority, _) = find_offer_vault_authority_pda();
    let vault_ata = get_associated_token_address(&vault_authority, &token_in);
    assert_eq!(get_token_balance(&svm, &vault_ata), 0);
}
