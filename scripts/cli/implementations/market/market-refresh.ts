import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { tokenPairParams } from "../../params";

export async function executeMarketRefresh(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, tokenPairParams.slice(0, 1), async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => helper.buildRefreshMarketStatsIx({
                tokenInMint: params.tokenIn,
                signer: helper.wallet.publicKey,
            }),
            payer: context.helper.wallet.publicKey,
            title: "Refresh Market Stats Transaction",
            description: "Refreshes cached market stats from the current main offer",
            showParamSummary: {
                title: "Refreshing market stats:",
                params: {
                    tokenIn: params.tokenIn,
                },
            },
        });
    });
}
