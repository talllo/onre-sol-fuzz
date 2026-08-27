import type { GlobalOptions } from "../../prompts";
import { executeCommand } from "../../helpers";
import { propAmmQuoteParams } from "../../params";
import { getTokenProgramId } from "../../utils/token-utils";
import { printSwapQuote, simulateSwapQuote } from "./prop-amm-quote-utils";

export async function executePropAmmQuoteSell(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, propAmmQuoteParams, async ({ helper, params }) => {
        const ix = await helper.buildQuoteSwapSellIx({
            tokenInAmount: params.amount,
            tokenInMint: params.tokenIn,
            tokenOutMint: params.tokenOut,
            tokenOutProgram: getTokenProgramId(params.tokenOut),
        });
        const quote = await simulateSwapQuote(helper, ix);
        printSwapQuote(quote, opts.json);
    });
}
