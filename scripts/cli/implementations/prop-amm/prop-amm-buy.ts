import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { propAmmSwapParams } from "../../params";
import { getTokenProgramId } from "../../utils/token-utils";

export async function executePropAmmBuy(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, propAmmSwapParams, async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => {
                const user = helper.wallet.publicKey;
                return helper.buildOpenSwapBuyIx({
                    tokenInAmount: params.amount,
                    minimumOut: params.minimumOut,
                    tokenInMint: params.tokenIn,
                    tokenOutMint: params.tokenOut,
                    user,
                    tokenInProgram: getTokenProgramId(params.tokenIn),
                    tokenOutProgram: getTokenProgramId(params.tokenOut),
                });
            },
            title: "Prop AMM Buy Transaction",
            description: `Buys ${params.tokenOut.toBase58().slice(0, 8)}... with ${params.amount} of ${params.tokenIn.toBase58().slice(0, 8)}...`,
            payer: context.helper.wallet.publicKey,
            showParamSummary: {
                title: "Opening Prop AMM buy:",
                params: {
                    tokenIn: params.tokenIn,
                    tokenOut: params.tokenOut,
                    amount: params.amount,
                    minimumOut: params.minimumOut,
                },
            },
        });
    });
}
