import { PublicKey, SystemProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

import { BUFFER_GROSS_APR_15_PERCENT, DEFAULT_MANAGEMENT_FEE_BPS, DEFAULT_PERFORMANCE_FEE_BPS, MINTS } from "../constants";
import { assertBigIntGte, assertPublicKeyEq, bnToBigInt, tokenBalance } from "../assertions";
import { ata, bufferAccounts, configurableVaultAta } from "../accounts";
import { configurableVaultPda, PDAS } from "../pdas";
import { bn, fetchNullable, SmokeRuntime, sendIxs } from "../runtime";

export async function configureBufferSmoke(runtime: SmokeRuntime, mainOffer: PublicKey): Promise<void> {
    console.log("\n== BUFFER configuration ==");

    const existing = await fetchNullable(() => runtime.program.account.bufferState.fetch(PDAS.bufferState));
    if (!existing) {
        const initIx = await runtime.program.methods
            .initializeBuffer()
            .accountsPartial({
                state: PDAS.state,
                bufferState: PDAS.bufferState,
                reserveVaultAuthority: PDAS.reserveVaultAuthority,
                managementFeeVault: configurableVaultPda("managementFee"),
                performanceFeeVault: configurableVaultPda("performanceFee"),
                boss: runtime.authority.publicKey,
                onycMint: MINTS.onyc,
                offer: mainOffer,
                reserveVaultOnycAccount: ata(MINTS.onyc, PDAS.reserveVaultAuthority, true),
                managementFeeVaultOnycAccount: configurableVaultAta("managementFee", MINTS.onyc),
                performanceFeeVaultOnycAccount: configurableVaultAta("performanceFee", MINTS.onyc),
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .instruction();
        await sendIxs(runtime, "initialize BUFFER", [initIx]);
    } else {
        console.log("  ok BUFFER already initialized");
    }

    const initialized = await runtime.program.account.bufferState.fetch(PDAS.bufferState);
    assertPublicKeyEq(initialized.onycMint, MINTS.onyc, "BUFFER ONyc mint");
    assertBigIntGte(bnToBigInt(initialized.previousSupply), 0n, "BUFFER previous supply initialized");
    assertBigIntGte(await tokenBalance(runtime, ata(MINTS.onyc, PDAS.reserveVaultAuthority, true)), 0n, "BUFFER reserve vault readable");
    assertBigIntGte(await tokenBalance(runtime, configurableVaultAta("managementFee", MINTS.onyc)), 0n, "BUFFER management fee vault readable");
    assertBigIntGte(await tokenBalance(runtime, configurableVaultAta("performanceFee", MINTS.onyc)), 0n, "BUFFER performance fee vault readable");

    const before = await fetchNullable(() => runtime.program.account.marketStats.fetch(PDAS.marketStats));
    const currentBeforeApr = await runtime.program.account.bufferState.fetch(PDAS.bufferState);
    if (!currentBeforeApr.grossApr.eq(bn(BUFFER_GROSS_APR_15_PERCENT))) {
        const grossAprIx = await runtime.program.methods.setBufferGrossApr(bn(BUFFER_GROSS_APR_15_PERCENT)).accountsPartial(bufferConfigAccounts(runtime, mainOffer)).instruction();
        await sendIxs(runtime, "set BUFFER gross APR to 15%", [grossAprIx]);
    } else {
        console.log("  ok BUFFER gross APR already 15%");
    }

    const bufferAfterApr = await runtime.program.account.bufferState.fetch(PDAS.bufferState);
    if (!bufferAfterApr.grossApr.eq(bn(BUFFER_GROSS_APR_15_PERCENT))) {
        throw new Error(`BUFFER gross APR mismatch: ${bufferAfterApr.grossApr.toString()}`);
    }

    if (
        bufferAfterApr.managementFeeBasisPoints !== DEFAULT_MANAGEMENT_FEE_BPS ||
        bufferAfterApr.performanceFeeBasisPoints !== DEFAULT_PERFORMANCE_FEE_BPS ||
        !bufferAfterApr.performanceFeeHighWatermarkEnabled
    ) {
        const feeIx = await runtime.program.methods
            .setBufferFeeConfig(DEFAULT_MANAGEMENT_FEE_BPS, DEFAULT_PERFORMANCE_FEE_BPS, true)
            .accountsPartial(bufferConfigAccounts(runtime, mainOffer))
            .instruction();
        await sendIxs(runtime, `set BUFFER fee config ${DEFAULT_MANAGEMENT_FEE_BPS}/${DEFAULT_PERFORMANCE_FEE_BPS} bps`, [feeIx]);
    } else {
        console.log("  ok BUFFER fee config already set");
    }

    const bufferAfterFees = await runtime.program.account.bufferState.fetch(PDAS.bufferState);
    if (bufferAfterFees.managementFeeBasisPoints !== DEFAULT_MANAGEMENT_FEE_BPS) {
        throw new Error("management fee bps mismatch after setBufferFeeConfig");
    }
    if (bufferAfterFees.performanceFeeBasisPoints !== DEFAULT_PERFORMANCE_FEE_BPS) {
        throw new Error("performance fee bps mismatch after setBufferFeeConfig");
    }
    if (!bufferAfterFees.performanceFeeHighWatermarkEnabled) {
        throw new Error("performance fee high-water mark should be enabled after setBufferFeeConfig");
    }

    const after = await runtime.program.account.marketStats.fetch(PDAS.marketStats);
    if (after.lastUpdatedSlot.lt(before?.lastUpdatedSlot ?? bn(0))) {
        throw new Error("MarketStats regressed while configuring BUFFER");
    }
    console.log(`  ok BUFFER configured; market stats slot ${after.lastUpdatedSlot.toString()}`);
}

function bufferConfigAccounts(runtime: SmokeRuntime, mainOffer: PublicKey) {
    return {
        state: PDAS.state,
        boss: runtime.authority.publicKey,
        mainOffer,
        onycMint: MINTS.onyc,
        offerVaultAuthority: PDAS.offerVaultAuthority,
        mintAuthority: PDAS.mintAuthority,
        bufferAccounts: bufferAccounts(),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        marketStats: PDAS.marketStats,
        circulatingSupplyExcludedBalance: PDAS.circulatingSupplyExcludedBalance,
    };
}
