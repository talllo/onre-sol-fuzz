import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

import { Connection, Keypair, PublicKey } from "@solana/web3.js";

import { LOCAL_RPC_URL, ONRE_SO_PATH, PROGRAM_ID, STUDIO_URL } from "./constants";
import { repoPath, resolveAuthorityPath } from "./runtime";

export function regressionFlag(name: string): boolean {
    return process.env[`SURFPOOL_REGRESSION_${name}`] === "1" || process.env[`SURFPOOL_SMOKE_${name}`] === "1";
}

export async function requireSurfpoolRunning(timeoutMs = 5_000): Promise<void> {
    await waitForRpc(timeoutMs);
    if (!regressionFlag("NO_STUDIO")) {
        await waitForStudio(timeoutMs);
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

export async function solanaProgramDeploy(authorityPath = resolveAuthorityPath()): Promise<void> {
    if (process.env.SURFPOOL_REGRESSION_TRANSACTIONAL_DEPLOY === "1") {
        const maxSignAttempts = process.env.SURFPOOL_REGRESSION_DEPLOY_MAX_SIGN_ATTEMPTS ?? "20";
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
            "--skip-preflight",
            "--max-sign-attempts",
            maxSignAttempts,
        ]);
        return;
    }

    const binaryPath = repoPath(ONRE_SO_PATH);
    const program = readFileSync(binaryPath);
    const chunkSize = Number(process.env.SURFPOOL_REGRESSION_WRITE_PROGRAM_CHUNK_BYTES ?? `${512 * 1024}`);
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
        throw new Error(`Invalid SURFPOOL_REGRESSION_WRITE_PROGRAM_CHUNK_BYTES: ${chunkSize}`);
    }

    console.log(`Writing program with surfnet_writeProgram: ${binaryPath} (${program.length} bytes)`);
    for (let offset = 0; offset < program.length; offset += chunkSize) {
        const chunk = program.subarray(offset, Math.min(offset + chunkSize, program.length));
        await surfnetRpc("surfnet_writeProgram", [PROGRAM_ID.toBase58(), chunk.toString("hex"), offset]);
        console.log(`  ok program chunk ${offset}-${offset + chunk.length}`);
    }
    await setProgramAuthority(readAuthorityPubkey(authorityPath));
    console.log(`  ok fork program bytes -> ${PROGRAM_ID.toBase58()}`);
}

function readAuthorityPubkey(authorityPath: string): PublicKey {
    const secretKey = JSON.parse(readFileSync(authorityPath, "utf8")) as number[];
    if (!Array.isArray(secretKey)) {
        throw new Error(`Invalid authority keypair file: ${authorityPath}`);
    }
    return Keypair.fromSecretKey(Uint8Array.from(secretKey)).publicKey;
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
