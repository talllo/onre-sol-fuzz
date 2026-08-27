import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { bufferReserveVaultParams } from "../../params";
import { getTokenProgramId } from "../../utils/token-utils";

export async function executeBufferReserveWithdraw(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, bufferReserveVaultParams, async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => {
                const boss = await helper.getBoss();
                return helper.buildWithdrawReserveVaultIx({
                    onycMint: params.onycMint,
                    amount: params.amount,
                    boss,
                    tokenProgram: getTokenProgramId(params.onycMint),
                });
            },
            title: "Withdraw BUFFER Reserve Vault Transaction",
            description: "Withdraws ONyc from the BUFFER reserve vault",
            showParamSummary: {
                title: "Withdrawing BUFFER reserve:",
                params: {
                    onycMint: params.onycMint,
                    amount: params.amount,
                },
            },
        });
    });
}
