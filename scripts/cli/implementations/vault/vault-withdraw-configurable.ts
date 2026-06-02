import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { withdrawConfigurableVaultParams } from "../../params";
import { getTokenProgramId } from "../../utils/token-utils";

export async function executeVaultWithdrawConfigurable(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, withdrawConfigurableVaultParams, async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => helper.buildWithdrawConfigurableVaultIx({
                kind: params.kind,
                mint: params.tokenMint,
                amount: params.amount,
                caller: helper.wallet.publicKey,
                tokenProgram: getTokenProgramId(params.tokenMint),
            }),
            payer: context.helper.wallet.publicKey,
            title: "Withdraw Configurable Vault Transaction",
            description: "Withdraws from a configurable accounting vault",
            showParamSummary: {
                title: "Withdrawing configurable vault:",
                params: {
                    kind: params.kind,
                    tokenMint: params.tokenMint,
                    amount: params.amount,
                },
            },
        });
    });
}
