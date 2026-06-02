import { config } from "../../../utils/script-helper";
import type { GlobalOptions } from "../../prompts";
import { executeCommand } from "../../helpers";
import { printCirculatingSupply } from "../../utils/display";

export async function executeMarketSupplyV2(opts: GlobalOptions): Promise<void> {
    await executeCommand(opts, [], async (context) => {
        const { helper } = context;

        const supply = await helper.program.methods
            .getCirculatingSupplyV2()
            .accountsPartial({
                onycMint: config.mints.onyc,
                state: helper.statePda,
                excludedBalance: helper.pdas.circulatingSupplyExcludedBalancePda,
            })
            .view();

        printCirculatingSupply(supply.toString(), opts.json);
    });
}
