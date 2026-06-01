import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import { Connection, PublicKey } from "@solana/web3.js";

import { LOCAL_RPC_URL, ONRE_SO_PATH, PROGRAM_ID, STUDIO_URL } from "./constants";
import { repoPath, resolveAuthorityPath } from "./runtime";

export function regressionFlag(name: string): boolean {
    return process.env[`SURFPOOL_REGRESSION_${name}`] === "1" || process.env[`SURFPOOL_SMOKE_${name}`] === "1";
}

export async function requireSurfpoolRunning(): Promise<void> {
    await waitForRpc(5_000);
    if (!regressionFlag("NO_STUDIO")) {
        await waitForStudio(5_000);
    }

    console.log(`Using existing Surfpool RPC: ${LOCAL_RPC_URL}`);
    if (!regressionFlag("NO_STUDIO")) {
        console.log(`Using existing Surfpool Studio: ${STUDIO_URL}`);
    }
}

export async function waitForRpc(timeoutMs = 90_000): Promise<void> {
    const connection = new Connection(LOCAL_RPC_URL, "confirmed");
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            await connection.getVersion();
            return;
        } catch {
            await sleep(500);
        }
    }
    throw new Error(`Surfpool RPC did not become ready at ${LOCAL_RPC_URL}`);
}

export async function waitForStudio(timeoutMs = 90_000): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            const response = await fetch(STUDIO_URL);
            if (response.ok) {
                return;
            }
        } catch {
            await sleep(500);
        }
    }
    throw new Error(`Surfpool Studio did not become ready at ${STUDIO_URL}`);
}

export async function surfnetRpc<T>(method: string, params: unknown): Promise<T> {
    const rpcParams = Array.isArray(params) ? params : [params];
    const response = await fetch(LOCAL_RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "surfpool-regression", method, params: rpcParams }),
    });
    const body = await response.json();
    if (body.error) {
        throw new Error(`${method} failed: ${JSON.stringify(body.error)}`);
    }
    return body.result as T;
}

export async function setProgramAuthority(newAuthority: PublicKey): Promise<void> {
    await surfnetRpc("surfnet_setProgramAuthority", [PROGRAM_ID.toBase58(), newAuthority.toBase58()]);
    console.log(`  ok fork upgrade authority -> ${newAuthority.toBase58()}`);
}

export async function setTokenBalance(owner: PublicKey, mint: PublicKey, amount: number, tokenProgram: PublicKey): Promise<void> {
    await surfnetRpc("surfnet_setTokenAccount", [
        owner.toBase58(),
        mint.toBase58(),
        {
            amount,
            state: "initialized",
        },
        tokenProgram.toBase58(),
    ]);
    console.log(`  ok funded ${owner.toBase58()} ${mint.toBase58()} = ${amount}`);
}

export function anchorBuild(): void {
    if (regressionFlag("SKIP_BUILD")) {
        console.log("Skipping anchor build because SURFPOOL_REGRESSION_SKIP_BUILD=1");
        return;
    }
    run("anchor", ["build"]);
}

export function solanaProgramDeploy(authorityPath = resolveAuthorityPath()): void {
    run("solana", [
        "program",
        "deploy",
        repoPath(ONRE_SO_PATH),
        "--url",
        LOCAL_RPC_URL,
        "--program-id",
        PROGRAM_ID.toBase58(),
        "--upgrade-authority",
        authorityPath,
        "--keypair",
        authorityPath,
        "--use-rpc",
    ]);
}

function run(command: string, args: string[]): void {
    console.log(`Running: ${command} ${args.join(" ")}`);
    const result = spawnSync(command, args, {
        cwd: process.cwd(),
        stdio: "inherit",
        env: process.env,
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
    }
}
