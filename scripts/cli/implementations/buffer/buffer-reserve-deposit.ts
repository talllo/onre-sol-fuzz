import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { bufferReserveVaultParams } from "../../params";
import { getTokenProgramId } from "../../utils/token-utils";

export async function executeBufferReserveDeposit(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, bufferReserveVaultParams, async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => helper.buildDepositReserveVaultIx({
                onycMint: params.onycMint,
                amount: params.amount,
                depositor: helper.wallet.publicKey,
                tokenProgram: getTokenProgramId(params.onycMint),
            }),
            payer: context.helper.wallet.publicKey,
            title: "Deposit BUFFER Reserve Vault Transaction",
            description: "Deposits ONyc into the BUFFER reserve vault",
            showParamSummary: {
                title: "Depositing BUFFER reserve:",
                params: {
                    onycMint: params.onycMint,
                    amount: params.amount,
                },
            },
        });
    });
}
