import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

import { MINTS, PROP_AMM_DEFAULTS } from "../constants";
import { assertBigIntGt, assertPublicKeyEq, tokenBalance } from "../assertions";
import { ata, buyAccounts, sellAccounts } from "../accounts";
import { offerPda, PDAS, propAmmPairPda } from "../pdas";
import { bn, SmokeRuntime, sendIxs } from "../runtime";
import { setTokenBalance } from "../surfpool";

const USDG_BUY_AMOUNT = 5_000_000;
const USDG_SELL_ONYC_AMOUNT = PROP_AMM_DEFAULTS.minimumSellHaircutOnyc + 1_000_000_000;
const USER_ONYC_PROP_AMM_BALANCE = USDG_SELL_ONYC_AMOUNT * 2;

export async function configureUsdgPropAmmSmoke(runtime: SmokeRuntime): Promise<void> {
    console.log("\n== USDG Prop AMM configuration ==");

    const offer = offerPda(MINTS.usdg, MINTS.onyc);
    const ix = await runtime.program.methods
        .configurePropAmm(
            PROP_AMM_DEFAULTS.enabled,
            PROP_AMM_DEFAULTS.curvePegHaircutBps,
            PROP_AMM_DEFAULTS.curveExponentScaled,
            PROP_AMM_DEFAULTS.minCadenceExponentScaled,
            PROP_AMM_DEFAULTS.cadenceThreshold,
            PROP_AMM_DEFAULTS.cadenceSensitivityScaled,
            bn(PROP_AMM_DEFAULTS.epochDurationSeconds),
            PROP_AMM_DEFAULTS.wallSensitivityScaled,
            bn(PROP_AMM_DEFAULTS.minimumSellHaircutOnyc),
        )
        .accountsPartial({
            state: PDAS.state,
            offer,
            assetMint: MINTS.usdg,
            propAmmPairState: propAmmPairPda(offer),
            boss: runtime.authority.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .instruction();

    await sendIxs(runtime, "configure USDG Prop AMM", [ix]);

    const pair = await runtime.program.account.propAmmPairState.fetch(propAmmPairPda(offer));
    assertPublicKeyEq(pair.offer, offer, "USDG Prop AMM offer");
    assertPublicKeyEq(pair.assetMint, MINTS.usdg, "USDG Prop AMM asset mint");
    assertPublicKeyEq(pair.onycMint, MINTS.onyc, "USDG Prop AMM ONYC mint");
    if (!pair.enabled) {
        throw new Error("USDG Prop AMM pair is not enabled after configuration");
    }
    console.log(`  ok USDG Prop AMM configured: ${propAmmPairPda(offer).toBase58()}`);
}

export async function runUsdgPropAmmSmoke(runtime: SmokeRuntime, mainOffer: PublicKey): Promise<void> {
    console.log("\n== USDG Prop AMM swaps ==");

    const beforeBuyOnyc = await tokenBalance(runtime, ata(MINTS.onyc, runtime.authority.publicKey));
    const buyIx = await runtime.program.methods
        .openSwapBuy(bn(USDG_BUY_AMOUNT), bn(1))
        .accountsPartial(buyAccounts(MINTS.usdg, runtime.authority.publicKey, mainOffer))
        .instruction();
    await sendIxs(runtime, "Prop AMM buy USDG->ONYC", [buyIx]);
    const afterBuyOnyc = await tokenBalance(runtime, ata(MINTS.onyc, runtime.authority.publicKey));
    assertBigIntGt(afterBuyOnyc, beforeBuyOnyc, "Prop AMM buy ONYC output");

    await setTokenBalance(runtime.authority.publicKey, MINTS.onyc, USER_ONYC_PROP_AMM_BALANCE, TOKEN_PROGRAM_ID);

    const beforeSellUsdg = await tokenBalance(runtime, ata(MINTS.usdg, runtime.authority.publicKey));
    const sellIx = await runtime.program.methods
        .openSwapSell(bn(USDG_SELL_ONYC_AMOUNT), bn(1))
        .accountsPartial(sellAccounts(MINTS.usdg, runtime.authority.publicKey, mainOffer))
        .instruction();
    await sendIxs(runtime, "Prop AMM sell ONYC->USDG", [sellIx]);
    const afterSellUsdg = await tokenBalance(runtime, ata(MINTS.usdg, runtime.authority.publicKey));
    assertBigIntGt(afterSellUsdg, beforeSellUsdg, "Prop AMM sell USDG output");
}
