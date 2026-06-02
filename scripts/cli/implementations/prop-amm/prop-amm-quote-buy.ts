import type { GlobalOptions } from "../../prompts";
import { executeCommand } from "../../helpers";
import { propAmmQuoteParams } from "../../params";
import { printSwapQuote, simulateSwapQuote } from "./prop-amm-quote-utils";

export async function executePropAmmQuoteBuy(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, propAmmQuoteParams, async ({ helper, params }) => {
        const ix = await helper.buildQuoteSwapBuyIx({
            tokenInAmount: params.amount,
            tokenInMint: params.tokenIn,
            tokenOutMint: params.tokenOut,
        });
        const quote = await simulateSwapQuote(helper, ix);
        printSwapQuote(quote, opts.json);
    });
}
