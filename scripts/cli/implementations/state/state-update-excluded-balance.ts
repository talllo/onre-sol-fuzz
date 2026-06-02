import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { updateExcludedBalanceParams } from "../../params";
import { getTokenProgramId } from "../../utils/token-utils";

export async function executeStateUpdateExcludedBalance(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, updateExcludedBalanceParams, async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => helper.buildUpdateCirculatingSupplyExcludedBalanceIx({
                onycMint: params.onycMint,
                signer: helper.wallet.publicKey,
                tokenProgram: getTokenProgramId(params.onycMint),
            }),
            payer: context.helper.wallet.publicKey,
            title: "Update Circulating Supply Excluded Balance Transaction",
            description: "Recomputes excluded ONyc balance from configured owner ATAs",
            showParamSummary: {
                title: "Updating excluded balance:",
                params: {
                    onycMint: params.onycMint,
                },
            },
        });
    });
}
