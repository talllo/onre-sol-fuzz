import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";

/** Execute a worker-only BUFFER settlement. */
export async function executeBufferSettle(opts: GlobalOptions): Promise<void> {
    await executeCommand(opts, [], async (context) => {
        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => helper.buildSettleBufferIx({ worker: helper.wallet.publicKey }),
            payer: context.helper.wallet.publicKey,
            title: "Settle BUFFER Transaction",
            description: "Accrues BUFFER and refreshes market stats through the current timestamp",
            showParamSummary: {
                title: "Settling BUFFER:",
                params: { worker: context.helper.wallet.publicKey },
            },
        });
    });
}
