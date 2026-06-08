import type { GlobalOptions } from "../../prompts";
import { executeCommand } from "../../helpers";
import { tokenPairParams } from "../../params";
import { printTvl } from "../../utils/display";

export async function executeMarketTvlV2(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, tokenPairParams, async (context) => {
        const { helper, params } = context;

        const tvl = await helper.program.methods
            .getTvlV2()
            .accountsPartial({
                offer: helper.getOfferPda(params.tokenIn, params.tokenOut),
                tokenInMint: params.tokenIn,
                tokenOutMint: params.tokenOut,
                state: helper.statePda,
                circulatingSupplyExcludedBalance: helper.pdas.circulatingSupplyExcludedBalancePda,
            })
            .view();

        printTvl(tvl.toString(), opts.json);
    });
}
