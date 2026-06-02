import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import type { ScriptHelper } from "../../../utils/script-helper";
import type { TransactionInstruction } from "@solana/web3.js";

export interface SwapQuoteResult {
    offer: PublicKey;
    tokenInMint: PublicKey;
    tokenOutMint: PublicKey;
    tokenInAmount: BN;
    tokenInNetAmount: BN;
    tokenInFeeAmount: BN;
    tokenOutAmount: BN;
    minimumOut: BN;
    currentPrice: BN;
    quotedAt: BN;
}

const SWAP_QUOTE_RESULT_SIZE = 152;

function readPubkey(data: Buffer, offset: number): [PublicKey, number] {
    return [new PublicKey(data.subarray(offset, offset + 32)), offset + 32];
}

function readU64(data: Buffer, offset: number): [BN, number] {
    return [new BN(data.subarray(offset, offset + 8), "le"), offset + 8];
}

export function decodeSwapQuote(data: Buffer): SwapQuoteResult {
    if (data.length < SWAP_QUOTE_RESULT_SIZE) {
        throw new Error(`Invalid swap quote data length: expected at least ${SWAP_QUOTE_RESULT_SIZE} bytes, got ${data.length}`);
    }

    let offset = 0;
    const [offer, afterOffer] = readPubkey(data, offset);
    offset = afterOffer;
    const [tokenInMint, afterTokenInMint] = readPubkey(data, offset);
    offset = afterTokenInMint;
    const [tokenOutMint, afterTokenOutMint] = readPubkey(data, offset);
    offset = afterTokenOutMint;

    const [tokenInAmount, afterTokenInAmount] = readU64(data, offset);
    offset = afterTokenInAmount;
    const [tokenInNetAmount, afterTokenInNetAmount] = readU64(data, offset);
    offset = afterTokenInNetAmount;
    const [tokenInFeeAmount, afterTokenInFeeAmount] = readU64(data, offset);
    offset = afterTokenInFeeAmount;
    const [tokenOutAmount, afterTokenOutAmount] = readU64(data, offset);
    offset = afterTokenOutAmount;
    const [minimumOut, afterMinimumOut] = readU64(data, offset);
    offset = afterMinimumOut;
    const [currentPrice, afterCurrentPrice] = readU64(data, offset);
    offset = afterCurrentPrice;
    const [quotedAt] = readU64(data, offset);

    return {
        offer,
        tokenInMint,
        tokenOutMint,
        tokenInAmount,
        tokenInNetAmount,
        tokenInFeeAmount,
        tokenOutAmount,
        minimumOut,
        currentPrice,
        quotedAt,
    };
}

export async function simulateSwapQuote(helper: ScriptHelper, ix: TransactionInstruction): Promise<SwapQuoteResult> {
    const tx = await helper.prepareTransaction({ ix, payer: helper.wallet.publicKey });
    const result = helper.walletKeypair
        ? await helper.connection.simulateTransaction(tx, [helper.walletKeypair], false)
        : await helper.connection.simulateTransaction(tx, [], false);

    if (result.value.err) {
        const logs = result.value.logs?.join("\n") ?? "No simulation logs";
        throw new Error(`Quote simulation failed: ${JSON.stringify(result.value.err)}\n${logs}`);
    }

    const returnData = result.value.returnData;
    if (!returnData) {
        throw new Error("Quote simulation did not return data");
    }

    const [encoded, encoding] = returnData.data;
    return decodeSwapQuote(Buffer.from(encoded, encoding as BufferEncoding));
}

export function printSwapQuote(quote: SwapQuoteResult, json = false): void {
    const payload = {
        offer: quote.offer.toBase58(),
        tokenInMint: quote.tokenInMint.toBase58(),
        tokenOutMint: quote.tokenOutMint.toBase58(),
        tokenInAmount: quote.tokenInAmount.toString(),
        tokenInNetAmount: quote.tokenInNetAmount.toString(),
        tokenInFeeAmount: quote.tokenInFeeAmount.toString(),
        tokenOutAmount: quote.tokenOutAmount.toString(),
        minimumOut: quote.minimumOut.toString(),
        currentPrice: quote.currentPrice.toString(),
        quotedAt: quote.quotedAt.toString(),
    };

    if (json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
    }

    console.log("Prop AMM quote:");
    console.log(`  Offer:              ${payload.offer}`);
    console.log(`  Token in mint:      ${payload.tokenInMint}`);
    console.log(`  Token out mint:     ${payload.tokenOutMint}`);
    console.log(`  Token in amount:    ${payload.tokenInAmount}`);
    console.log(`  Token in net:       ${payload.tokenInNetAmount}`);
    console.log(`  Token in fee:       ${payload.tokenInFeeAmount}`);
    console.log(`  Token out amount:   ${payload.tokenOutAmount}`);
    console.log(`  Minimum out:        ${payload.minimumOut}`);
    console.log(`  Current price:      ${payload.currentPrice}`);
    console.log(`  Quoted at:          ${payload.quotedAt}`);
}
