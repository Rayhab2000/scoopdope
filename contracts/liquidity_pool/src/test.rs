#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, symbol_short, Address, Env};

fn setup_pool() -> (Env, LiquidityPoolContractClient<'static>, Address) {
    let env         = Env::default();
    env.mock_all_auths();
    let id          = env.register_contract(None, LiquidityPoolContract);
    let client      = LiquidityPoolContractClient::new(&env, &id);
    let admin       = Address::generate(&env);
    let bst_token   = Address::generate(&env);
    let fee_coll    = Address::generate(&env);
    client.initialize(&admin, &bst_token, &fee_coll);
    (env, client, admin)
}

#[test]
fn add_liquidity_initial_deposit_returns_nonzero_shares() {
    let (_, client, _) = setup_pool();
    let provider = Address::generate(&client.env);
    let shares = client.add_liquidity(&provider, &1_000_000, &1_000_000, &0, &0);
    assert!(shares > 0);
    let stats = client.get_pool_stats();
    assert_eq!(stats.reserve_a, 1_000_000);
    assert_eq!(stats.reserve_b, 1_000_000);
}

#[test]
fn remove_liquidity_returns_tokens_proportionally() {
    let (_, client, _) = setup_pool();
    let provider = Address::generate(&client.env);
    let shares = client.add_liquidity(&provider, &2_000_000, &2_000_000, &0, &0);
    let (out_a, out_b) = client.remove_liquidity(&provider, &(shares / 2));
    assert!(out_a > 0 && out_b > 0);
    assert!(out_a <= 2_000_000 && out_b <= 2_000_000);
}

#[test]
fn swap_bst_to_xlm_with_slippage_protection() {
    let (_, client, _) = setup_pool();
    let provider = Address::generate(&client.env);
    let trader   = Address::generate(&client.env);
    client.add_liquidity(&provider, &10_000_000, &10_000_000, &0, &0);
    let out = client.swap(&trader, &symbol_short!("bst"), &100_000, &1);
    assert!(out > 0 && out < 100_000);
}

#[test]
#[should_panic]
fn swap_fails_slippage_check_when_min_out_too_high() {
    let (_, client, _) = setup_pool();
    let provider = Address::generate(&client.env);
    let trader   = Address::generate(&client.env);
    client.add_liquidity(&provider, &1_000_000, &1_000_000, &0, &0);
    client.swap(&trader, &symbol_short!("bst"), &10_000, &999_999);
}

#[test]
fn get_pool_stats_reflects_current_state() {
    let (_, client, _) = setup_pool();
    let provider = Address::generate(&client.env);
    client.add_liquidity(&provider, &5_000_000, &3_000_000, &0, &0);
    let stats = client.get_pool_stats();
    assert_eq!(stats.reserve_a, 5_000_000);
    assert_eq!(stats.reserve_b, 3_000_000);
}

#[test]
fn get_user_liquidity_tracks_provider_balance() {
    let (_, client, _) = setup_pool();
    let provider = Address::generate(&client.env);
    let shares = client.add_liquidity(&provider, &1_000_000, &1_000_000, &0, &0);
    assert_eq!(client.get_user_liquidity(&provider), shares);
}

#[test]
fn sqrt_handles_basic_values() {
    let (_, _client, _) = setup_pool();

    // Test zero
    let sqrt_0 = LiquidityPoolContract::sqrt(0);
    assert_eq!(sqrt_0, 0, "sqrt(0) should be 0");

    // Test one
    let sqrt_1 = LiquidityPoolContract::sqrt(1);
    assert_eq!(sqrt_1, 1, "sqrt(1) should be 1");

    // Test perfect squares
    let sqrt_4 = LiquidityPoolContract::sqrt(4);
    assert!(sqrt_4 >= 1 && sqrt_4 <= 3, "sqrt(4) should be close to 2");

    let sqrt_100 = LiquidityPoolContract::sqrt(100);
    assert!(sqrt_100 >= 9 && sqrt_100 <= 11, "sqrt(100) should be close to 10");
}

#[test]
fn sqrt_safely_handles_large_values() {
    let (_, _client, _) = setup_pool();

    // Test with large value within safe range (i128::MAX / 2)
    let large_value = 1_000_000_000_000_000_000i128; // 10^18
    let result = LiquidityPoolContract::sqrt(large_value);

    // sqrt(10^18) ≈ 10^9
    assert!(result > 0, "sqrt of large value should be positive");
    assert!(result < large_value, "sqrt result should be less than input");
}

#[test]
#[should_panic(expected = "Input value too large")]
fn sqrt_panics_on_overflow_input() {
    let (_, _client, _) = setup_pool();

    // This should panic - value exceeds i128::MAX / 2
    let overflow_value = i128::MAX;
    let _result = LiquidityPoolContract::sqrt(overflow_value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: replicates the contract AMM formula so boundary tests can derive
// the exact expected output without a prior read-only call.
// ─────────────────────────────────────────────────────────────────────────────
fn compute_expected_out(
    amount_in: i128,
    reserve_in: i128,
    reserve_out: i128,
    fee_num: i128,
    fee_denom: i128,
) -> i128 {
    let amount_in_with_fee = amount_in * (fee_denom - fee_num);
    let numerator = amount_in_with_fee * reserve_out;
    let denominator = (reserve_in * fee_denom) + amount_in_with_fee;
    numerator / denominator
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Slippage boundary — min_out exactly equals computed output must succeed.
// ─────────────────────────────────────────────────────────────────────────────
#[test]
fn swap_min_out_boundary_exactly_equals_computed_output() {
    let (_, client, _) = setup_pool();
    let provider = Address::generate(&client.env);
    let trader   = Address::generate(&client.env);
    client.add_liquidity(&provider, &10_000_000, &10_000_000, &0, &0);

    let amount_in    = 100_000_i128;
    let expected_out = compute_expected_out(amount_in, 10_000_000, 10_000_000, 3, 1000);

    // min_out == computed output — the ≥ check must pass at the boundary.
    let out = client.swap(&trader, &symbol_short!("bst"), &amount_in, &expected_out);
    assert_eq!(out, expected_out);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Slippage boundary — min_out one unit above computed output must fail.
// ─────────────────────────────────────────────────────────────────────────────
#[test]
#[should_panic]
fn swap_min_out_one_above_computed_output_panics() {
    let (_, client, _) = setup_pool();
    let provider = Address::generate(&client.env);
    let trader   = Address::generate(&client.env);
    client.add_liquidity(&provider, &10_000_000, &10_000_000, &0, &0);

    let amount_in    = 100_000_i128;
    let expected_out = compute_expected_out(amount_in, 10_000_000, 10_000_000, 3, 1000);

    // expected_out + 1 exceeds what the pool can give — must panic.
    client.swap(&trader, &symbol_short!("bst"), &amount_in, &(expected_out + 1));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Minimum deposit: 1001×1001 → sqrt = 1001, shares = 1001 − 1000 = 1.
// ─────────────────────────────────────────────────────────────────────────────
#[test]
fn add_liquidity_minimum_deposit_yields_one_share() {
    let (_, client, _) = setup_pool();
    let provider = Address::generate(&client.env);
    // 1001^2 = 1_002_001, so sqrt = 1001 exactly. Shares = 1001 − MINIMUM_LIQUIDITY(1000) = 1.
    let shares = client.add_liquidity(&provider, &1001, &1001, &0, &0);
    assert_eq!(shares, 1);
    assert_eq!(client.get_user_liquidity(&provider), 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Deposit too small: sqrt(1000×1000) = 1000 − 1000 = 0 → panics.
// ─────────────────────────────────────────────────────────────────────────────
#[test]
#[should_panic(expected = "Insufficient liquidity minted")]
fn add_liquidity_deposit_too_small_to_mint_shares_panics() {
    let (_, client, _) = setup_pool();
    let provider = Address::generate(&client.env);
    // sqrt(1_000_000) = 1000; 1000 − MINIMUM_LIQUIDITY = 0 → assert fires.
    client.add_liquidity(&provider, &1000, &1000, &0, &0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. sqrt overflow boundary: i128::MAX / 2 is the largest valid input
//    (the contract's assert uses <=). Must succeed and return a correct floor.
// ─────────────────────────────────────────────────────────────────────────────
#[test]
fn sqrt_accepts_max_safe_boundary_input() {
    let boundary = i128::MAX / 2;
    let result   = LiquidityPoolContract::sqrt(boundary);
    assert!(result > 0);
    // Floor-sqrt invariant: result² ≤ boundary. Use checked_mul to guard
    // against the assertion itself overflowing on 128-bit.
    if let Some(sq) = result.checked_mul(result) {
        assert!(sq <= boundary);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Full pool drain: a sole provider who holds all minted shares can remove
//    all tokens, leaving reserves and total_liquidity at zero.
// ─────────────────────────────────────────────────────────────────────────────
#[test]
fn remove_liquidity_fully_drains_pool() {
    let (_, client, _) = setup_pool();
    let provider = Address::generate(&client.env);
    // sqrt(2e6 × 2e6) = 2_000_000; shares = 2_000_000 − 1000 = 1_999_000.
    let shares = client.add_liquidity(&provider, &2_000_000, &2_000_000, &0, &0);

    let (out_a, out_b) = client.remove_liquidity(&provider, &shares);
    assert_eq!(out_a, 2_000_000);
    assert_eq!(out_b, 2_000_000);

    let stats = client.get_pool_stats();
    assert_eq!(stats.reserve_a,       0);
    assert_eq!(stats.reserve_b,       0);
    assert_eq!(stats.total_liquidity, 0);
    assert_eq!(client.get_user_liquidity(&provider), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Fee precision: amount_in = 100 → fee = (100 × 3) / 1000 = 0 (integer
//    truncation). The swap must still execute and reserve must update.
// ─────────────────────────────────────────────────────────────────────────────
#[test]
fn fee_rounds_to_zero_for_tiny_swap_amount() {
    let (_, client, _) = setup_pool();
    let provider = Address::generate(&client.env);
    let trader   = Address::generate(&client.env);
    client.add_liquidity(&provider, &10_000_000, &10_000_000, &0, &0);

    let out = client.swap(&trader, &symbol_short!("bst"), &100, &0);
    assert!(out > 0);
    // Reserve A must have absorbed the full amount_in regardless of zero fee.
    let stats = client.get_pool_stats();
    assert_eq!(stats.reserve_a, 10_000_100);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. XLM → BST direction: reserve_b grows by amount_in; reserve_a shrinks.
// ─────────────────────────────────────────────────────────────────────────────
#[test]
fn swap_xlm_to_bst_updates_reserves_correctly() {
    let (_, client, _) = setup_pool();
    let provider = Address::generate(&client.env);
    let trader   = Address::generate(&client.env);
    client.add_liquidity(&provider, &10_000_000, &10_000_000, &0, &0);

    let out = client.swap(&trader, &symbol_short!("xlm"), &100_000, &1);
    assert!(out > 0 && out < 100_000);

    let stats = client.get_pool_stats();
    assert_eq!(stats.reserve_b, 10_100_000); // XLM reserve increased by amount_in
    assert!(stats.reserve_a < 10_000_000);   // BST reserve decreased by amount_out
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. remove_liquidity panics when provider requests more than their balance.
// ─────────────────────────────────────────────────────────────────────────────
#[test]
#[should_panic(expected = "Insufficient liquidity")]
fn remove_liquidity_panics_with_insufficient_shares() {
    let (_, client, _) = setup_pool();
    let provider = Address::generate(&client.env);
    let shares   = client.add_liquidity(&provider, &2_000_000, &2_000_000, &0, &0);
    client.remove_liquidity(&provider, &(shares + 1));
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Two providers adding identical amounts receive identical share counts.
// ─────────────────────────────────────────────────────────────────────────────
#[test]
fn multiple_providers_receive_proportional_shares() {
    let (_, client, _) = setup_pool();
    let provider_a = Address::generate(&client.env);
    let provider_b = Address::generate(&client.env);

    // First deposit sets the pool (sqrt(1e6*1e6)=1e6, shares=999_000).
    let shares_a = client.add_liquidity(&provider_a, &1_000_000, &1_000_000, &0, &0);
    // Second deposit with same ratio and same amounts gets equal shares.
    let shares_b = client.add_liquidity(&provider_b, &1_000_000, &1_000_000, &0, &0);

    assert_eq!(shares_a, shares_b);
    assert_eq!(client.get_user_liquidity(&provider_a), shares_a);
    assert_eq!(client.get_user_liquidity(&provider_b), shares_b);
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Slippage on subsequent deposit: pool is 2:1 (A:B); demanding amount_b_min
//     above the proportional optimal must panic.
// ─────────────────────────────────────────────────────────────────────────────
#[test]
#[should_panic(expected = "Insufficient B amount")]
fn add_liquidity_subsequent_b_slippage_panics() {
    let (_, client, _) = setup_pool();
    let provider  = Address::generate(&client.env);
    let provider2 = Address::generate(&client.env);
    // Pool ratio is 2:1 (A:B).
    client.add_liquidity(&provider, &2_000_000, &1_000_000, &0, &0);
    // For 1_000_000 A, the optimal B = quote(1e6, 2e6, 1e6) = 500_000.
    // Demanding ≥ 600_000 must fail.
    client.add_liquidity(&provider2, &1_000_000, &1_000_000, &0, &600_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. Swap history is recorded per-swap and returned in insertion order.
// ─────────────────────────────────────────────────────────────────────────────
#[test]
fn get_swap_history_records_correct_entries() {
    let (_, client, _) = setup_pool();
    let provider = Address::generate(&client.env);
    let trader   = Address::generate(&client.env);
    client.add_liquidity(&provider, &10_000_000, &10_000_000, &0, &0);

    client.swap(&trader, &symbol_short!("bst"), &100_000, &1);
    client.swap(&trader, &symbol_short!("xlm"), &50_000,  &1);

    let history = client.get_swap_history(&0, &10);
    assert_eq!(history.len(), 2);
    assert_eq!(history.get(0).unwrap().amount_in, 100_000);
    assert_eq!(history.get(1).unwrap().amount_in, 50_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. Mining rewards return 0 for a user who never added liquidity.
// ─────────────────────────────────────────────────────────────────────────────
#[test]
fn claim_mining_rewards_returns_zero_with_no_liquidity() {
    let (_, client, _) = setup_pool();
    let user = Address::generate(&client.env);
    assert_eq!(client.claim_mining_rewards(&user), 0);
}
