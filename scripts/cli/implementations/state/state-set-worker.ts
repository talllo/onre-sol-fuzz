import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { workerParams } from "../../params";

/** Execute the boss-only state set-worker command. */
export async function executeStateSetWorker(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, workerParams, async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => {
                const boss = await helper.getBoss();
                return helper.buildSetWorkerIx({
                    worker: params.worker,
                    boss,
                });
            },
            title: "Set Worker Transaction",
            description: `Sets worker to ${params.worker.toBase58()}`,
            showParamSummary: {
                title: "Setting worker:",
                params: { worker: params.worker },
            },
        });
    });
}
