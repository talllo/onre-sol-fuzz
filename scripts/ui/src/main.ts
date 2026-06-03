import { Buffer } from "buffer";
import bs58 from "bs58";
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction, type TransactionSignature } from "@solana/web3.js";
import idlJson from "../../../target/idl/onreapp.json";
import "./styles.css";

globalThis.Buffer = Buffer;

const MAINNET_PROGRAM_ID = new PublicKey("onreuGhHHgVzMWSkj2oQDLDtvvGvoepBPkqyaubFcwe");
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25EFGzzguxxG6L");
const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey("Sysvar1nstructions1111111111111111111111111");
const PLACEHOLDER_BLOCKHASH = "11111111111111111111111111111111";

const MAINNET_MINTS = {
    usdc: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    usdt: new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
    onyc: new PublicKey("5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5"),
    usdg: new PublicKey("2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH"),
};

const TOKEN_CHOICES = [
    { label: "USDC", value: MAINNET_MINTS.usdc },
    { label: "USDT", value: MAINNET_MINTS.usdt },
    { label: "ONyc", value: MAINNET_MINTS.onyc },
    { label: "USDG", value: MAINNET_MINTS.usdg },
] as const;

const CONFIGURABLE_VAULT_KIND_SEEDS: Record<string, string> = {
    OfferFee: "offer_fee",
    ManagementFee: "management_fee",
    PerformanceFee: "performance_fee",
    PropAmmFee: "prop_amm_fee",
    OfferProceeds: "offer_proceeds",
    PropAmmProceeds: "prop_amm_proceeds",
};

const CONFIGURABLE_VAULT_ACCOUNT_SEEDS: Record<string, string> = {
    offer_fee_vault: "offer_fee",
    management_fee_vault: "management_fee",
    performance_fee_vault: "performance_fee",
    prop_amm_fee_vault: "prop_amm_fee",
    offer_proceeds_vault: "offer_proceeds",
    prop_amm_proceeds_vault: "prop_amm_proceeds",
};

const PDA_SEEDS: Record<string, string> = {
    state: "state",
    offer_vault_authority: "offer_vault_authority",
    vault_authority: "offer_vault_authority",
    permissionless_authority: "permissionless-1",
    mint_authority: "mint_authority",
    buffer_state: "buffer_state",
    reserve_vault_authority: "reserve_vault_authority",
    redemption_vault_authority: "redemption_offer_vault_authority",
    market_stats: "market_stats",
    circulating_supply_excluded_balance: "circ_supply_excl_balance",
    excluded_balance: "circ_supply_excl_balance",
    excluded_accounts: "circ_supply_excl_accounts",
};

const idl = { ...idlJson, address: MAINNET_PROGRAM_ID.toBase58() } as Idl;
const instructionByName = new Map(idl.instructions.map((ix) => [ix.name, ix]));
const typeByName = new Map((idl.types ?? []).map((typeDef) => [typeDef.name, typeDef]));

type PrimitiveIdlType = "bool" | "i64" | "pubkey" | "string" | "u8" | "u16" | "u32" | "u64";
type IdlType = PrimitiveIdlType | { option: IdlType } | { vec: IdlType } | { array: [IdlType, number] } | { defined: { name: string } };

interface Idl {
    address: string;
    instructions: IdlInstruction[];
    types?: IdlTypeDef[];
}

interface IdlInstruction {
    name: string;
    docs?: string[];
    discriminator: number[];
    accounts?: IdlAccount[];
    args?: IdlArg[];
    returns?: IdlType;
}

interface IdlArg {
    name: string;
    type: IdlType;
}

interface IdlAccount {
    name: string;
    docs?: string[];
    signer?: boolean;
    writable?: boolean;
    address?: string;
    pda?: IdlPda;
    accounts?: IdlAccount[];
}

interface IdlPda {
    seeds: IdlSeed[];
    program?: IdlSeed;
}

type IdlSeed = { kind: "const"; value: number[] } | { kind: "account"; path: string; account?: string } | { kind: "arg"; path: string };

interface IdlTypeDef {
    name: string;
    type: { kind: "struct"; fields: IdlArg[] } | { kind: "enum"; variants: Array<{ name: string; fields?: IdlArg[] | IdlType[] }> };
}

interface FlatAccount {
    account: IdlAccount;
    fullName: string;
    group?: string;
}

interface SolanaWallet {
    isPhantom?: boolean;
    isSolflare?: boolean;
    publicKey?: PublicKey;
    connect: () => Promise<{ publicKey: PublicKey } | void>;
    disconnect?: () => Promise<void>;
    signTransaction?: (transaction: Transaction) => Promise<Transaction>;
}

interface StateAccountInfo {
    boss: PublicKey;
    proposedBoss: PublicKey;
    onycMint: PublicKey;
    redemptionAdmin: PublicKey;
    mainOffer: PublicKey;
}

interface OfferAccountInfo {
    tokenInMint: PublicKey;
    tokenOutMint: PublicKey;
}

interface RedemptionOfferAccountInfo {
    offer: PublicKey;
    tokenInMint: PublicKey;
    tokenOutMint: PublicKey;
    requestCounter: bigint;
}

interface RedemptionRequestAccountInfo {
    offer: PublicKey;
    requestId: bigint;
    redeemer: PublicKey;
}

interface ConfigurableVaultAccountInfo {
    kind: number;
    withdrawalDestination: PublicKey;
}

type DecodedAccount =
    | { kind: "offer"; value: OfferAccountInfo }
    | { kind: "redemption_offer"; value: RedemptionOfferAccountInfo }
    | { kind: "redemption_request"; value: RedemptionRequestAccountInfo }
    | { kind: "configurable_vault"; value: ConfigurableVaultAccountInfo };

interface AppState {
    rpcUrl: string;
    connection: Connection;
    selectedInstructionName: string;
    search: string;
    accountValues: Record<string, string>;
    accountAuto: Record<string, boolean>;
    argValues: Record<string, string>;
    wallet?: SolanaWallet;
    walletPublicKey?: PublicKey;
    stateInfo?: StateAccountInfo;
    decodedAccounts: Record<string, DecodedAccount>;
    output: string;
    lastTransaction?: Transaction;
    lastSignature?: TransactionSignature;
}

const state: AppState = {
    rpcUrl: localStorage.getItem("onre-ui-rpc-url") || DEFAULT_RPC_URL,
    connection: new Connection(localStorage.getItem("onre-ui-rpc-url") || DEFAULT_RPC_URL, "confirmed"),
    selectedInstructionName: idl.instructions[0]?.name ?? "",
    search: "",
    accountValues: {},
    accountAuto: {},
    argValues: {},
    decodedAccounts: {},
    output: "",
};

const accountFetchesInFlight = new Set<string>();

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
    throw new Error("App root not found");
}
const appRoot = app;

function boot(): void {
    initializeSelectedInstruction();
    render();
    void refreshStateDerivedAccounts();
}

function initializeSelectedInstruction(): void {
    const instruction = selectedInstruction();
    state.accountValues = {};
    state.accountAuto = {};
    state.argValues = {};

    for (const arg of instruction.args ?? []) {
        state.argValues[arg.name] = defaultArgValue(arg.type);
    }

    for (const flat of flattenAccounts(instruction.accounts ?? [])) {
        const value = defaultAccountValue(flat.account, flat.fullName);
        state.accountValues[flat.fullName] = value;
        state.accountAuto[flat.fullName] = value.length > 0 || shouldAutoDeriveByDefault(flat.account);
    }

    deriveAccounts();
}

async function refreshStateDerivedAccounts(): Promise<void> {
    try {
        const statePda = PublicKey.findProgramAddressSync([Buffer.from("state")], MAINNET_PROGRAM_ID)[0];
        const accountInfo = await state.connection.getAccountInfo(statePda, "confirmed");
        if (!accountInfo) return;
        const stateInfo = decodeStateAccount(accountInfo.data);
        if (!stateInfo || sameStateInfo(state.stateInfo, stateInfo)) return;
        state.stateInfo = stateInfo;
        deriveAccounts();
        render();
        void refreshDecodedDerivedAccounts();
    } catch (error) {
        console.warn(`State fetch warning: ${errorMessage(error)}`);
    }
}

function selectedInstruction(): IdlInstruction {
    const instruction = instructionByName.get(state.selectedInstructionName);
    if (!instruction) {
        throw new Error(`Instruction not found: ${state.selectedInstructionName}`);
    }
    return instruction;
}

function render(): void {
    const instruction = selectedInstruction();
    appRoot.innerHTML = `
        <main class="shell">
            <header class="topbar">
                <div class="brand">
                    <span class="brand-mark">OnRe</span>
                    <span class="muted monospace">${MAINNET_PROGRAM_ID.toBase58()}</span>
                </div>
                <div class="walletbar">
                    <span class="status-dot ${state.walletPublicKey ? "online" : ""}"></span>
                    <span class="wallet-key monospace">${state.walletPublicKey?.toBase58() ?? "No wallet"}</span>
                    <button id="wallet-button" class="primary">${state.walletPublicKey ? "Disconnect" : "Connect Wallet"}</button>
                </div>
            </header>

            <section class="rpc-band">
                <label for="rpc-url">RPC URL</label>
                <input id="rpc-url" value="${escapeHtml(state.rpcUrl)}" />
                <button id="apply-rpc">Apply</button>
                <button id="ping-rpc">Ping</button>
                <button id="refresh-accounts">Refresh Accounts</button>
            </section>

            <section class="workspace">
                <aside class="sidebar">
                    <input id="instruction-search" class="search" placeholder="Search instructions" value="${escapeHtml(state.search)}" />
                    <div class="instruction-list">
                        ${renderInstructionList()}
                    </div>
                </aside>

                <section class="panel">
                    <div class="panel-head">
                        <div>
                            <h1>${displayName(instruction.name)}</h1>
                            <div class="muted">${instruction.args?.length ?? 0} args · ${flattenAccounts(instruction.accounts ?? []).length} accounts${instruction.returns ? " · returns " + typeLabel(instruction.returns) : ""}</div>
                        </div>
                        <div class="actions">
                            <button id="build-tx">Build</button>
                            <button id="simulate-tx">Simulate</button>
                            <button id="send-tx" class="primary">Sign & Send</button>
                        </div>
                    </div>

                    <div class="form-grid">
                        <section class="section">
                            <div class="section-title">Arguments</div>
                            ${renderArgs(instruction)}
                        </section>
                        <section class="section">
                            <div class="section-title">Accounts</div>
                            ${renderAccounts(instruction)}
                        </section>
                    </div>
                </section>

                <aside class="output">
                    <div class="section-title">Output</div>
                    <pre id="output-text">${escapeHtml(state.output || "Ready.")}</pre>
                    <div class="output-actions">
                        <button id="copy-base58" ${state.lastTransaction ? "" : "disabled"}>Copy Base58</button>
                        <button id="clear-output">Clear</button>
                    </div>
                </aside>
            </section>
        </main>
    `;

    bindEvents();
    scrollOutputToBottom();
}

function renderInstructionList(): string {
    const needle = state.search.trim().toLowerCase();
    return idl.instructions
        .filter((instruction) => instruction.name.toLowerCase().includes(needle))
        .map((instruction) => {
            const active = instruction.name === state.selectedInstructionName ? "active" : "";
            return `<button class="instruction ${active}" data-instruction="${instruction.name}">${displayName(instruction.name)}</button>`;
        })
        .join("");
}

function renderArgs(instruction: IdlInstruction): string {
    const args = instruction.args ?? [];
    if (!args.length) {
        return `<div class="empty">No arguments</div>`;
    }

    return args
        .map((arg) => {
            const value = state.argValues[arg.name] ?? defaultArgValue(arg.type);
            return `
                <label class="field">
                    <span>${arg.name}<small>${typeLabel(arg.type)}</small></span>
                    ${renderArgInput(arg, value)}
                </label>
            `;
        })
        .join("");
}

function renderArgInput(arg: IdlArg, value: string): string {
    if (arg.type === "bool") {
        const checked = parseBoolean(value) ? "checked" : "";
        return `<input type="checkbox" data-arg="${arg.name}" ${checked} />`;
    }

    const enumType = enumTypeDef(arg.type);
    if (enumType?.type.kind === "enum") {
        return `
            <div class="segmented" role="group" aria-label="${arg.name}">
                ${enumType.type.variants
                    .map((variant) => {
                        const active = normalizeName(variant.name) === normalizeName(value) ? "active" : "";
                        return `<button type="button" class="${active}" data-arg-choice="${arg.name}" data-arg-value="${variant.name}">${displayName(variant.name)}</button>`;
                    })
                    .join("")}
            </div>
        `;
    }

    const complex = typeof arg.type !== "string" || arg.type === "pubkey" || arg.type === "string";
    const inputMode = typeof arg.type === "string" && integerByteLength(arg.type) ? "numeric" : "text";
    return `
        <div class="input-stack">
            <input data-arg="${arg.name}" inputmode="${inputMode}" class="${complex ? "monospace" : ""}" value="${escapeHtml(value)}" />
            ${arg.type === "pubkey" && state.walletPublicKey ? `<button type="button" data-arg-wallet="${arg.name}">Use Wallet</button>` : ""}
        </div>
    `;
}

function renderAccounts(instruction: IdlInstruction): string {
    const accounts = flattenAccounts(instruction.accounts ?? []);
    if (!accounts.length) {
        return `<div class="empty">No accounts</div>`;
    }

    return accounts
        .map((flat) => {
            const account = flat.account;
            const value = state.accountValues[flat.fullName] ?? "";
            const flags = [account.signer ? "signer" : "", account.writable ? "writable" : "", account.pda ? "pda" : "", account.address ? "fixed" : ""].filter(Boolean).join(" ");
            const group = flat.group ? `<small>${flat.group}</small>` : "";
            return `
                <label class="field account-field">
                    <span>${flat.fullName}${group}<small>${flags || "readonly"}</small></span>
                    ${renderAccountControl(flat, value)}
                </label>
            `;
        })
        .join("");
}

function renderAccountControl(flat: FlatAccount, value: string): string {
    if (isTokenMintAccount(flat.account.name)) {
        const selected = tokenLabel(value);
        return `
            <div class="token-picker">
                ${TOKEN_CHOICES.map((token) => {
                    const active = selected === token.label ? "active" : "";
                    return `<button type="button" class="${active}" data-account-token="${flat.fullName}" data-token-value="${token.value.toBase58()}">${token.label}</button>`;
                }).join("")}
                <button type="button" class="${selected ? "" : "active"}" data-account-custom="${flat.fullName}">Custom</button>
            </div>
            ${
                selected
                    ? `<input type="hidden" data-account="${flat.fullName}" value="${escapeHtml(value)}" />`
                    : `<input data-account="${flat.fullName}" class="monospace custom-account" value="${escapeHtml(value)}" placeholder="Custom mint address" />`
            }
        `;
    }

    if (isManagedAccount(flat, value)) {
        return `
            <div class="derived-row">
                <code>${escapeHtml(compactAddress(value))}</code>
                <button type="button" data-copy-value="${escapeHtml(value)}">Copy</button>
                ${flat.account.signer ? `<button type="button" data-account-wallet="${flat.fullName}" ${state.walletPublicKey ? "" : "disabled"}>Wallet</button>` : ""}
                ${flat.account.pda ? `<button type="button" data-account-derive="${flat.fullName}">Rederive</button>` : ""}
            </div>
            <input type="hidden" data-account="${flat.fullName}" value="${escapeHtml(value)}" />
        `;
    }

    return `
        <div class="account-row">
            <input data-account="${flat.fullName}" class="monospace" value="${escapeHtml(value)}" placeholder="Paste address" />
            <button type="button" data-account-wallet="${flat.fullName}" ${state.walletPublicKey ? "" : "disabled"}>Wallet</button>
            <button type="button" data-account-derive="${flat.fullName}" ${flat.account.pda ? "" : "disabled"}>Derive</button>
        </div>
    `;
}

function bindEvents(): void {
    document.querySelector("#wallet-button")?.addEventListener("click", () => void toggleWallet());
    document.querySelector("#apply-rpc")?.addEventListener("click", applyRpcUrl);
    document.querySelector("#ping-rpc")?.addEventListener("click", () => void pingRpc());
    document.querySelector("#refresh-accounts")?.addEventListener("click", () => void refreshAccountsFromChain());
    document.querySelector("#build-tx")?.addEventListener("click", () => void buildAndReport());
    document.querySelector("#simulate-tx")?.addEventListener("click", () => void simulate());
    document.querySelector("#send-tx")?.addEventListener("click", () => void send());
    document.querySelector("#copy-base58")?.addEventListener("click", () => void copyBase58());
    document.querySelector("#clear-output")?.addEventListener("click", () => {
        state.output = "";
        render();
    });

    document.querySelector<HTMLInputElement>("#instruction-search")?.addEventListener("input", (event) => {
        state.search = (event.target as HTMLInputElement).value;
        render();
    });

    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-instruction]")) {
        button.addEventListener("click", () => {
            state.selectedInstructionName = button.dataset.instruction ?? state.selectedInstructionName;
            initializeSelectedInstruction();
            render();
            void refreshStateDerivedAccounts();
            void refreshDecodedDerivedAccounts();
        });
    }

    document.querySelector<HTMLInputElement>("#rpc-url")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            applyRpcUrl();
        }
    });

    for (const input of document.querySelectorAll<HTMLInputElement>("[data-arg]")) {
        input.addEventListener("input", () => {
            const name = input.dataset.arg!;
            state.argValues[name] = input.type === "checkbox" ? String(input.checked) : input.value;
            deriveAccounts();
            updateAccountInputs();
            void refreshDecodedDerivedAccounts();
        });
    }

    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-arg-choice]")) {
        button.addEventListener("click", () => {
            const name = button.dataset.argChoice!;
            state.argValues[name] = button.dataset.argValue ?? "";
            deriveAccounts();
            render();
            void refreshDecodedDerivedAccounts();
        });
    }

    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-arg-wallet]")) {
        button.addEventListener("click", () => {
            const name = button.dataset.argWallet!;
            if (!state.walletPublicKey) return;
            state.argValues[name] = state.walletPublicKey.toBase58();
            deriveAccounts();
            render();
            void refreshDecodedDerivedAccounts();
        });
    }

    for (const input of document.querySelectorAll<HTMLInputElement>("[data-account]")) {
        input.addEventListener("input", () => {
            const name = input.dataset.account!;
            state.accountValues[name] = input.value.trim();
            state.accountAuto[name] = false;
            deriveAccounts();
            updateAccountInputs();
            void refreshDecodedDerivedAccounts();
        });
    }

    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-account-token]")) {
        button.addEventListener("click", () => {
            const name = button.dataset.accountToken!;
            state.accountValues[name] = button.dataset.tokenValue ?? "";
            state.accountAuto[name] = false;
            deriveAccounts();
            render();
            void refreshDecodedDerivedAccounts();
        });
    }

    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-account-custom]")) {
        button.addEventListener("click", () => {
            const name = button.dataset.accountCustom!;
            state.accountValues[name] = "";
            state.accountAuto[name] = false;
            deriveAccounts();
            render();
            void refreshDecodedDerivedAccounts();
        });
    }

    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-account-wallet]")) {
        button.addEventListener("click", () => {
            const name = button.dataset.accountWallet!;
            if (!state.walletPublicKey) return;
            state.accountValues[name] = state.walletPublicKey.toBase58();
            state.accountAuto[name] = false;
            updateAccountInputs();
            void refreshDecodedDerivedAccounts();
        });
    }

    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-account-derive]")) {
        button.addEventListener("click", () => {
            const name = button.dataset.accountDerive!;
            state.accountAuto[name] = true;
            deriveAccounts();
            updateAccountInputs();
            void refreshDecodedDerivedAccounts();
        });
    }

    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy-value]")) {
        button.addEventListener("click", () => {
            void navigator.clipboard.writeText(button.dataset.copyValue ?? "");
        });
    }
}

function updateAccountInputs(): void {
    for (const input of document.querySelectorAll<HTMLInputElement>("[data-account]")) {
        const name = input.dataset.account!;
        input.value = state.accountValues[name] ?? "";
    }
}

async function toggleWallet(): Promise<void> {
    if (state.walletPublicKey) {
        await state.wallet?.disconnect?.();
        state.wallet = undefined;
        state.walletPublicKey = undefined;
        appendOutput("Wallet disconnected.");
        initializeSelectedInstruction();
        render();
        void refreshStateDerivedAccounts();
        return;
    }

    const wallet = findWallet();
    if (!wallet) {
        appendOutput("No injected Solana wallet found.");
        render();
        return;
    }

    const result = await wallet.connect();
    state.wallet = wallet;
    state.walletPublicKey = result?.publicKey ?? wallet.publicKey;
    if (!state.walletPublicKey) {
        appendOutput("Wallet connected without a public key.");
    } else {
        appendOutput(`Wallet connected: ${state.walletPublicKey.toBase58()}`);
    }
    initializeSelectedInstruction();
    render();
    void refreshStateDerivedAccounts();
}

function findWallet(): SolanaWallet | undefined {
    const win = window as Window & {
        solana?: SolanaWallet;
        solflare?: SolanaWallet;
    };
    if (win.solana?.isPhantom || win.solana?.signTransaction) return win.solana;
    if (win.solflare?.signTransaction) return win.solflare;
    return win.solana ?? win.solflare;
}

function applyRpcUrl(): void {
    const input = document.querySelector<HTMLInputElement>("#rpc-url");
    const rpcUrl = input?.value.trim() || DEFAULT_RPC_URL;
    state.rpcUrl = rpcUrl;
    state.connection = new Connection(rpcUrl, "confirmed");
    state.stateInfo = undefined;
    state.decodedAccounts = {};
    accountFetchesInFlight.clear();
    localStorage.setItem("onre-ui-rpc-url", rpcUrl);
    appendOutput(`RPC set: ${rpcUrl}`);
    render();
    void refreshStateDerivedAccounts();
}

async function pingRpc(): Promise<void> {
    try {
        const slot = await state.connection.getSlot("confirmed");
        appendOutput(`RPC ok. Confirmed slot: ${slot}`);
    } catch (error) {
        appendOutput(`RPC error: ${errorMessage(error)}`);
    }
    render();
}

async function refreshAccountsFromChain(): Promise<void> {
    await refreshStateDerivedAccounts();
    await refreshDecodedDerivedAccounts();
    appendOutput("Account resolver refreshed from RPC.");
    render();
}

async function buildAndReport(): Promise<Transaction | undefined> {
    try {
        const { tx, offlineBlockhashReason } = await buildTransaction({ allowOfflineBlockhash: true });
        state.lastTransaction = tx;
        const base58 = serializeBase58(tx);
        appendOutput(
            [
                `Built ${selectedInstruction().name}`,
                `Fee payer: ${tx.feePayer?.toBase58()}`,
                `Recent blockhash: ${tx.recentBlockhash}`,
                offlineBlockhashReason ? `Blockhash note: ${offlineBlockhashReason}` : undefined,
                `Instructions: ${tx.instructions.length}`,
                `Base58: ${base58}`,
            ]
                .filter(Boolean)
                .join("\n"),
        );
        render();
        return tx;
    } catch (error) {
        appendOutput(`Build error: ${errorMessage(error)}`);
        render();
        return undefined;
    }
}

async function simulate(): Promise<void> {
    try {
        const { tx } = await buildTransaction({ allowOfflineBlockhash: false });
        state.lastTransaction = tx;
        const versionedTx = new VersionedTransaction(
            new TransactionMessage({
                payerKey: tx.feePayer!,
                recentBlockhash: tx.recentBlockhash!,
                instructions: tx.instructions,
            }).compileToV0Message(),
        );
        const result = await state.connection.simulateTransaction(versionedTx, {
            sigVerify: false,
            replaceRecentBlockhash: true,
        });
        const returnData = result.value.returnData;
        const decodedReturn = returnData ? decodeReturnData(returnData.data[0]) : undefined;
        appendOutput(
            JSON.stringify(
                {
                    err: result.value.err,
                    unitsConsumed: result.value.unitsConsumed,
                    returnData: returnData
                        ? {
                              programId: returnData.programId,
                              rawBase64: returnData.data[0],
                              decoded: decodedReturn,
                          }
                        : null,
                    logs: result.value.logs,
                },
                jsonReplacer,
                2,
            ),
        );
    } catch (error) {
        appendOutput(`Simulation error: ${errorMessage(error)}`);
    }
    render();
}

async function send(): Promise<void> {
    if (!state.walletPublicKey || !state.wallet?.signTransaction) {
        appendOutput("Connect a wallet with signTransaction support first.");
        render();
        return;
    }

    try {
        const { tx } = await buildTransaction({ allowOfflineBlockhash: false });
        const signed = await state.wallet.signTransaction(tx);
        const signature = await state.connection.sendRawTransaction(signed.serialize(), {
            skipPreflight: false,
        });
        await state.connection.confirmTransaction(signature, "confirmed");
        state.lastTransaction = tx;
        state.lastSignature = signature;
        appendOutput(`Confirmed: ${signature}\nhttps://solscan.io/tx/${signature}`);
    } catch (error) {
        appendOutput(`Send error: ${errorMessage(error)}`);
    }
    render();
}

async function copyBase58(): Promise<void> {
    if (!state.lastTransaction) return;
    const base58 = serializeBase58(state.lastTransaction);
    await navigator.clipboard.writeText(base58);
    appendOutput("Base58 copied.");
    render();
}

async function buildTransaction(options: { allowOfflineBlockhash: boolean }): Promise<{ tx: Transaction; offlineBlockhashReason?: string }> {
    const instruction = buildInstruction();
    const tx = new Transaction();
    tx.add(instruction);
    tx.feePayer = state.walletPublicKey ?? firstSigner(instruction) ?? MAINNET_PROGRAM_ID;
    const blockhash = await getBlockhash(options.allowOfflineBlockhash);
    tx.recentBlockhash = blockhash.blockhash;
    return { tx, offlineBlockhashReason: blockhash.offlineReason };
}

async function getBlockhash(allowOfflineBlockhash: boolean): Promise<{ blockhash: string; offlineReason?: string }> {
    try {
        return { blockhash: (await state.connection.getLatestBlockhash("confirmed")).blockhash };
    } catch (error) {
        if (!allowOfflineBlockhash) throw error;
        return {
            blockhash: PLACEHOLDER_BLOCKHASH,
            offlineReason: `RPC blockhash fetch failed, using placeholder for inspection/export only: ${errorMessage(error)}`,
        };
    }
}

function buildInstruction(): TransactionInstruction {
    const instruction = selectedInstruction();
    const accounts = flattenAccounts(instruction.accounts ?? []);
    const keys = accounts.map((flat) => {
        const value = state.accountValues[flat.fullName]?.trim();
        if (!value) {
            throw new Error(`Missing account: ${flat.fullName}`);
        }
        return {
            pubkey: new PublicKey(value),
            isSigner: Boolean(flat.account.signer),
            isWritable: Boolean(flat.account.writable),
        };
    });

    const data = Buffer.concat([Buffer.from(instruction.discriminator), ...((instruction.args ?? []).map((arg) => encodeType(arg.type, parseArgValue(arg))) ?? [])]);

    return new TransactionInstruction({
        programId: MAINNET_PROGRAM_ID,
        keys,
        data,
    });
}

function parseArgValue(arg: IdlArg): unknown {
    const raw = state.argValues[arg.name] ?? "";
    if (arg.type === "bool") return parseBoolean(raw);
    if (typeof arg.type === "string" && arg.type !== "pubkey" && arg.type !== "string") return raw.trim();
    if (arg.type === "pubkey" || arg.type === "string") return raw.trim();
    return raw.trim() ? JSON.parse(raw) : null;
}

function firstSigner(instruction: TransactionInstruction): PublicKey | undefined {
    return instruction.keys.find((key) => key.isSigner)?.pubkey;
}

function serializeBase58(tx: Transaction): string {
    return bs58.encode(
        tx.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        }),
    );
}

function deriveAccounts(): void {
    const instruction = selectedInstruction();
    for (const flat of flattenAccounts(instruction.accounts ?? [])) {
        if (!state.accountAuto[flat.fullName]) continue;
        const value = deriveAccountValue(flat.account, flat.fullName);
        if (value) {
            state.accountValues[flat.fullName] = value;
        } else if (flat.account.pda) {
            state.accountValues[flat.fullName] = "";
        }
    }
}

function deriveAccountValue(account: IdlAccount, fullName: string): string {
    const lowerName = account.name.toLowerCase();
    if (lowerName === "boss" && state.stateInfo) return state.stateInfo.boss.toBase58();
    if (lowerName === "boss" && state.accountValues[fullName]) return state.accountValues[fullName];
    if (lowerName === "new_boss" && state.stateInfo && !isDefaultPublicKey(state.stateInfo.proposedBoss)) return state.stateInfo.proposedBoss.toBase58();
    if (lowerName === "redemption_admin" && state.stateInfo) return state.stateInfo.redemptionAdmin.toBase58();
    if (lowerName === "main_offer" && state.stateInfo) return state.stateInfo.mainOffer.toBase58();
    if (lowerName === "redeemer") {
        const redemptionRequest = decodedAccountByName("redemption_request", "redemption_request");
        if (redemptionRequest?.kind === "redemption_request") return redemptionRequest.value.redeemer.toBase58();
    }
    if (lowerName === "destination") {
        const vault = decodedAccountByName("configurable_vault", "configurable_vault");
        if (vault?.kind === "configurable_vault") return vault.value.withdrawalDestination.toBase58();
    }
    if (account.signer && state.walletPublicKey) return state.walletPublicKey.toBase58();
    if (lowerName === "system_program") return SystemProgram.programId.toBase58();
    if (lowerName === "token_program" || lowerName === "token_in_program" || lowerName === "token_out_program") return TOKEN_PROGRAM_ID.toBase58();
    if (lowerName === "associated_token_program") return ASSOCIATED_TOKEN_PROGRAM_ID.toBase58();
    if (lowerName === "instructions_sysvar") return SYSVAR_INSTRUCTIONS_PUBKEY.toBase58();
    if (lowerName === "program") return MAINNET_PROGRAM_ID.toBase58();
    if (lowerName === "onyc_mint") return onycMint().toBase58();
    if (lowerName === "token_in_mint") return defaultTokenInMint().toBase58();
    if (lowerName === "token_out_mint") return defaultTokenOutMint().toBase58();
    if (lowerName === "asset_mint") return MAINNET_MINTS.usdc.toBase58();
    if (lowerName === "mint" || lowerName === "token_mint") return defaultGenericMint().toBase58();
    if (lowerName === "usdc_mint") return MAINNET_MINTS.usdc.toBase58();
    if (lowerName === "usdt_mint") return MAINNET_MINTS.usdt.toBase58();
    if (lowerName === "usdg_mint") return MAINNET_MINTS.usdg.toBase58();

    const fixedPda = deriveFixedPda(lowerName);
    if (fixedPda) return fixedPda.toBase58();

    if (lowerName === "offer") {
        const offer = deriveOfferPda();
        if (offer) return offer.toBase58();
        const redemptionOffer = decodedAccountByName("redemption_offer", "redemption_offer");
        if (redemptionOffer?.kind === "redemption_offer") return redemptionOffer.value.offer.toBase58();
    }

    if (lowerName === "redemption_offer") {
        const redemptionOffer = deriveRedemptionOfferPda();
        if (redemptionOffer) return redemptionOffer.toBase58();
    }

    if (lowerName === "redemption_request") {
        const redemptionRequest = deriveRedemptionRequestPda();
        if (redemptionRequest) return redemptionRequest.toBase58();
    }

    if (lowerName === "prop_amm_pair_state") {
        const offer = publicKeyFromAccountValue("offer");
        if (offer) return findPda(["prop_amm_pair", offer]).toBase58();
    }

    if (isTokenAccountName(lowerName)) {
        const owner = inferTokenAccountOwner(lowerName);
        const mint = inferTokenAccountMint(lowerName);
        if (owner && mint) return getAssociatedTokenAddress(mint, owner).toBase58();
    }

    if (account.address) return account.address;

    if (account.pda) {
        const derived = tryDerivePda(account.pda);
        if (derived) return derived.toBase58();
    }

    return state.accountValues[fullName] ?? "";
}

function defaultAccountValue(account: IdlAccount, fullName: string): string {
    return deriveAccountValue(account, fullName);
}

function shouldAutoDeriveByDefault(account: IdlAccount): boolean {
    const lowerName = account.name.toLowerCase();
    return (
        Boolean(account.pda || account.address) ||
        lowerName === "boss" ||
        lowerName === "new_boss" ||
        lowerName === "redemption_admin" ||
        lowerName === "main_offer" ||
        lowerName === "redeemer" ||
        lowerName === "destination" ||
        Boolean(PDA_SEEDS[lowerName] || CONFIGURABLE_VAULT_ACCOUNT_SEEDS[lowerName]) ||
        isTokenAccountName(lowerName)
    );
}

function isManagedAccount(flat: FlatAccount, value: string): boolean {
    if (!value) return false;
    if (isTokenMintAccount(flat.account.name)) return false;

    const lowerName = flat.account.name.toLowerCase();
    if (flat.account.address) return true;
    if (flat.account.pda && state.accountAuto[flat.fullName]) return true;
    if (deriveFixedPda(lowerName) || isTokenAccountName(lowerName)) return true;
    return (
        lowerName === "boss" ||
        lowerName === "redemption_admin" ||
        lowerName === "main_offer" ||
        lowerName.startsWith("boss_") ||
        ["system_program", "token_program", "token_in_program", "token_out_program", "associated_token_program", "instructions_sysvar", "program"].includes(lowerName)
    );
}

function inferTokenAccountMint(lowerName: string): PublicKey | undefined {
    if (lowerName.includes("onyc")) return onycMint();
    if (lowerName.includes("usdc")) return MAINNET_MINTS.usdc;
    if (lowerName.includes("usdt")) return MAINNET_MINTS.usdt;
    if (lowerName.includes("usdg")) return MAINNET_MINTS.usdg;
    if (lowerName.includes("token_in")) return publicKeyFromAccountValue("token_in_mint");
    if (lowerName.includes("token_out")) return publicKeyFromAccountValue("token_out_mint");
    if (lowerName.includes("token_account")) return publicKeyFromAccountValue("token_mint") ?? publicKeyFromAccountValue("mint") ?? publicKeyFromAccountValue("token_in_mint");
    if (lowerName.includes("vault_token_account")) return publicKeyFromAccountValue("token_mint") ?? publicKeyFromAccountValue("mint") ?? publicKeyFromAccountValue("token_in_mint");
    if (lowerName.includes("boss_token_account")) return publicKeyFromAccountValue("token_mint") ?? publicKeyFromAccountValue("mint") ?? publicKeyFromAccountValue("token_in_mint");
    if (lowerName.includes("destination_token_account")) return publicKeyFromAccountValue("mint") ?? publicKeyFromAccountValue("token_mint");
    return undefined;
}

function inferTokenAccountOwner(lowerName: string): PublicKey | undefined {
    if (lowerName.includes("offer_fee")) return deriveConfigurableVaultPda("offer_fee");
    if (lowerName.includes("management_fee")) return deriveConfigurableVaultPda("management_fee");
    if (lowerName.includes("performance_fee")) return deriveConfigurableVaultPda("performance_fee");
    if (lowerName.includes("prop_amm_fee")) return deriveConfigurableVaultPda("prop_amm_fee");
    if (lowerName.includes("offer_proceeds")) return deriveConfigurableVaultPda("offer_proceeds");
    if (lowerName.includes("prop_amm_proceeds")) return deriveConfigurableVaultPda("prop_amm_proceeds");
    if (lowerName.includes("reserve_vault")) return deriveFixedPda("reserve_vault_authority");
    if (lowerName.includes("redemption_vault") || (selectedInstruction().name.includes("redemption") && lowerName === "vault_token_account")) return deriveFixedPda("redemption_vault_authority");
    if (lowerName.startsWith("offer_vault")) return deriveFixedPda("offer_vault_authority");
    if (lowerName.includes("permissionless")) return deriveFixedPda("permissionless_authority");
    if (lowerName.includes("vault_token")) return publicKeyFromAccountValue("vault_authority") ?? deriveFixedPda("vault_authority");
    if (lowerName.includes("boss")) return state.stateInfo?.boss;
    if (lowerName.includes("redeemer")) return publicKeyFromAccountValue("redeemer") ?? state.walletPublicKey;
    if (lowerName.includes("depositor")) return publicKeyFromAccountValue("depositor") ?? state.walletPublicKey;
    if (lowerName.includes("user")) return publicKeyFromAccountValue("user") ?? state.walletPublicKey;
    if (lowerName.includes("destination")) return publicKeyFromAccountValue("destination");
    return undefined;
}

function defaultTokenInMint(): PublicKey {
    const decoded = decodedAccountByName("redemption_offer", "redemption_offer");
    if (decoded?.kind === "redemption_offer") return decoded.value.tokenInMint;
    const offer = decodedAccountByName("offer", "offer");
    if (offer?.kind === "offer") return offer.value.tokenInMint;
    return instructionDefaultsToRedemptionDirection() ? onycMint() : MAINNET_MINTS.usdc;
}

function defaultTokenOutMint(): PublicKey {
    const decoded = decodedAccountByName("redemption_offer", "redemption_offer");
    if (decoded?.kind === "redemption_offer") return decoded.value.tokenOutMint;
    const offer = decodedAccountByName("offer", "offer");
    if (offer?.kind === "offer") return offer.value.tokenOutMint;
    return instructionDefaultsToRedemptionDirection() ? MAINNET_MINTS.usdc : onycMint();
}

function defaultGenericMint(): PublicKey {
    return publicKeyFromAccountValue("token_mint") ?? publicKeyFromAccountValue("mint") ?? publicKeyFromAccountValue("token_in_mint") ?? onycMint();
}

function onycMint(): PublicKey {
    return state.stateInfo?.onycMint ?? MAINNET_MINTS.onyc;
}

function instructionDefaultsToRedemptionDirection(): boolean {
    return ["make_redemption_offer", "create_redemption_request", "cancel_redemption_request", "fulfill_redemption_request", "open_swap_sell", "quote_swap_sell"].includes(
        selectedInstruction().name,
    );
}

function deriveFixedPda(lowerName: string): PublicKey | undefined {
    const configurableSeed = CONFIGURABLE_VAULT_ACCOUNT_SEEDS[lowerName];
    if (configurableSeed) return deriveConfigurableVaultPda(configurableSeed);
    const seed = PDA_SEEDS[lowerName];
    return seed ? findPda([seed]) : undefined;
}

function deriveConfigurableVaultPda(kindSeed: string): PublicKey {
    return findPda(["configurable_vault", kindSeed]);
}

function deriveOfferPda(): PublicKey | undefined {
    const [tokenInMint, tokenOutMint] = offerSeedMints();
    if (tokenInMint && tokenOutMint) return findPda(["offer", tokenInMint, tokenOutMint]);
    if (state.stateInfo?.mainOffer && selectedInstruction().name !== "set_main_offer") return state.stateInfo.mainOffer;
    return undefined;
}

function deriveRedemptionOfferPda(): PublicKey | undefined {
    const [tokenInMint, tokenOutMint] = redemptionOfferSeedMints();
    return tokenInMint && tokenOutMint ? findPda(["redemption_offer", tokenInMint, tokenOutMint]) : undefined;
}

function deriveRedemptionRequestPda(): PublicKey | undefined {
    const request = decodedAccountByName("redemption_request", "redemption_request");
    if (request?.kind === "redemption_request") {
        return findPda(["redemption_request", request.value.offer, u64Seed(request.value.requestId)]);
    }

    if (selectedInstruction().name !== "create_redemption_request") return undefined;
    const redemptionOfferAddress = publicKeyFromAccountValue("redemption_offer") ?? deriveRedemptionOfferPda();
    const redemptionOffer = decodedAccountByPublicKey(redemptionOfferAddress);
    if (redemptionOffer?.kind !== "redemption_offer") return undefined;
    return findPda(["redemption_request", redemptionOfferAddress!, u64Seed(redemptionOffer.value.requestCounter)]);
}

function offerSeedMints(): [PublicKey | undefined, PublicKey | undefined] {
    const instructionName = selectedInstruction().name;
    const tokenInMint = publicKeyFromAccountValue("token_in_mint");
    const tokenOutMint = publicKeyFromAccountValue("token_out_mint");
    if (["make_redemption_offer", "fulfill_redemption_request", "open_swap_sell", "quote_swap_sell"].includes(instructionName)) {
        return [tokenOutMint ?? MAINNET_MINTS.usdc, tokenInMint ?? onycMint()];
    }
    return [tokenInMint, tokenOutMint];
}

function redemptionOfferSeedMints(): [PublicKey | undefined, PublicKey | undefined] {
    const instructionName = selectedInstruction().name;
    const tokenInMint = publicKeyFromAccountValue("token_in_mint");
    const tokenOutMint = publicKeyFromAccountValue("token_out_mint");
    if (["open_swap_buy", "take_offer_v2", "take_offer_permissionless_v2"].includes(instructionName)) {
        return [tokenOutMint, tokenInMint];
    }
    return [tokenInMint, tokenOutMint];
}

function isTokenAccountName(lowerName: string): boolean {
    return lowerName.endsWith("_account") || lowerName.endsWith("_token_account");
}

function publicKeyFromAccountValue(name: string): PublicKey | undefined {
    const value = accountValueByName(name);
    if (!value) return undefined;
    try {
        return new PublicKey(value);
    } catch {
        return undefined;
    }
}

function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID)[0];
}

function findPda(seeds: Array<string | PublicKey | Uint8Array | Buffer>): PublicKey {
    return PublicKey.findProgramAddressSync(
        seeds.map((seed) => {
            if (typeof seed === "string") return Buffer.from(seed);
            if (seed instanceof PublicKey) return seed.toBuffer();
            return seed;
        }),
        MAINNET_PROGRAM_ID,
    )[0];
}

function isTokenMintAccount(name: string): boolean {
    const lowerName = name.toLowerCase();
    return lowerName === "mint" || lowerName === "asset_mint" || lowerName === "onyc_mint" || lowerName.endsWith("_mint");
}

function tokenLabel(value: string): string | undefined {
    return TOKEN_CHOICES.find((token) => token.value.toBase58() === value)?.label;
}

function compactAddress(value: string): string {
    return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-8)}` : value;
}

function tryDerivePda(pda: IdlPda): PublicKey | undefined {
    try {
        const seeds = pda.seeds.map(resolveSeed);
        if (seeds.some((seed) => !seed)) return undefined;
        const programId = pda.program ? seedToProgramId(pda.program) : MAINNET_PROGRAM_ID;
        if (!programId) return undefined;
        return PublicKey.findProgramAddressSync(seeds as Uint8Array[], programId)[0];
    } catch {
        return undefined;
    }
}

function resolveSeed(seed: IdlSeed): Uint8Array | undefined {
    if (seed.kind === "const") return Uint8Array.from(seed.value);
    if (seed.kind === "account") {
        if (seed.path.includes(".")) return resolveAccountFieldSeed(seed.path);
        const value = accountValueByName(seed.path);
        return value ? new PublicKey(value).toBuffer() : undefined;
    }
    if (seed.kind === "arg") {
        const arg = selectedInstruction().args?.find((candidate) => candidate.name === seed.path);
        if (!arg) return undefined;
        const configurableVaultSeed = configurableVaultKindSeed(arg, state.argValues[arg.name]);
        if (configurableVaultSeed) return Buffer.from(configurableVaultSeed);
        return encodeType(arg.type, parseArgValue(arg));
    }
    return undefined;
}

function resolveAccountFieldSeed(path: string): Uint8Array | undefined {
    const [accountName, fieldName] = path.split(".");
    if (!accountName || !fieldName) return undefined;

    if (accountName === "state" && state.stateInfo) {
        return encodeDecodedField(
            {
                boss: state.stateInfo.boss,
                proposed_boss: state.stateInfo.proposedBoss,
                onyc_mint: state.stateInfo.onycMint,
                redemption_admin: state.stateInfo.redemptionAdmin,
                main_offer: state.stateInfo.mainOffer,
            },
            fieldName,
        );
    }

    const decoded = decodedAccountByName(accountName, accountName);
    if (!decoded) return undefined;
    if (decoded.kind === "offer") {
        return encodeDecodedField(
            {
                token_in_mint: decoded.value.tokenInMint,
                token_out_mint: decoded.value.tokenOutMint,
            },
            fieldName,
        );
    }
    if (decoded.kind === "redemption_offer") {
        return encodeDecodedField(
            {
                offer: decoded.value.offer,
                token_in_mint: decoded.value.tokenInMint,
                token_out_mint: decoded.value.tokenOutMint,
                request_counter: decoded.value.requestCounter,
            },
            fieldName,
        );
    }
    if (decoded.kind === "redemption_request") {
        return encodeDecodedField(
            {
                offer: decoded.value.offer,
                request_id: decoded.value.requestId,
                redeemer: decoded.value.redeemer,
            },
            fieldName,
        );
    }
    if (decoded.kind === "configurable_vault") {
        return encodeDecodedField(
            {
                kind: BigInt(decoded.value.kind),
                withdrawal_destination: decoded.value.withdrawalDestination,
            },
            fieldName,
        );
    }
    return undefined;
}

function encodeDecodedField(fields: Record<string, PublicKey | bigint>, fieldName: string): Uint8Array | undefined {
    const value = fields[fieldName];
    if (value instanceof PublicKey) return value.toBuffer();
    if (typeof value === "bigint") return u64Seed(value);
    return undefined;
}

function configurableVaultKindSeed(arg: IdlArg, value: string): string | undefined {
    if (!isDefinedType(arg.type, "ConfigurableVaultKind")) return undefined;
    return CONFIGURABLE_VAULT_KIND_SEEDS[value];
}

function seedToProgramId(seed: IdlSeed): PublicKey | undefined {
    if (seed.kind === "const") return new PublicKey(Uint8Array.from(seed.value));
    const resolved = resolveSeed(seed);
    return resolved ? new PublicKey(resolved) : undefined;
}

function accountValueByName(name: string): string | undefined {
    const direct = state.accountValues[name];
    if (direct) return direct;

    const suffix = `.${name}`;
    for (const [key, value] of Object.entries(state.accountValues)) {
        if (key.endsWith(suffix) || key === name) return value;
    }
    return undefined;
}

function flattenAccounts(accounts: IdlAccount[], group?: string): FlatAccount[] {
    const flat: FlatAccount[] = [];
    for (const account of accounts) {
        if (account.accounts) {
            flat.push(...flattenAccounts(account.accounts, account.name));
        } else {
            flat.push({
                account,
                fullName: group ? `${group}.${account.name}` : account.name,
                group,
            });
        }
    }
    return flat;
}

async function refreshDecodedDerivedAccounts(): Promise<void> {
    const targets = decodedFetchTargets();
    const fetched = await Promise.all(
        targets.map(async (target) => {
            const key = target.publicKey.toBase58();
            if (state.decodedAccounts[key] || accountFetchesInFlight.has(key)) return false;
            accountFetchesInFlight.add(key);
            try {
                const accountInfo = await state.connection.getAccountInfo(target.publicKey, "confirmed");
                if (!accountInfo) return false;
                const decoded = decodeKnownAccount(target.kind, accountInfo.data);
                if (!decoded) return false;
                state.decodedAccounts[key] = decoded;
                return true;
            } catch (error) {
                console.warn(`Account fetch warning ${key}: ${errorMessage(error)}`);
                return false;
            } finally {
                accountFetchesInFlight.delete(key);
            }
        }),
    );

    if (fetched.some(Boolean)) {
        deriveAccounts();
        render();
    }
}

function decodedFetchTargets(): Array<{ publicKey: PublicKey; kind: DecodedAccount["kind"] }> {
    const targets = new Map<string, { publicKey: PublicKey; kind: DecodedAccount["kind"] }>();
    const add = (publicKey: PublicKey | undefined, kind: DecodedAccount["kind"]) => {
        if (!publicKey) return;
        targets.set(`${kind}:${publicKey.toBase58()}`, { publicKey, kind });
    };

    add(state.stateInfo?.mainOffer, "offer");

    for (const flat of flattenAccounts(selectedInstruction().accounts ?? [])) {
        const lowerName = flat.account.name.toLowerCase();
        const publicKey = publicKeyFromAccountValue(flat.fullName) ?? publicKeyFromAccountValue(flat.account.name);
        if (lowerName === "offer" || lowerName === "main_offer") add(publicKey, "offer");
        if (lowerName === "redemption_offer") add(publicKey, "redemption_offer");
        if (lowerName === "redemption_request") add(publicKey, "redemption_request");
        if (lowerName === "configurable_vault") add(publicKey, "configurable_vault");
    }

    return [...targets.values()];
}

function decodeKnownAccount(kind: DecodedAccount["kind"], data: Buffer | Uint8Array): DecodedAccount | undefined {
    const bytes = Buffer.from(data);
    if (kind === "offer") {
        const value = decodeOfferAccount(bytes);
        return value ? { kind, value } : undefined;
    }
    if (kind === "redemption_offer") {
        const value = decodeRedemptionOfferAccount(bytes);
        return value ? { kind, value } : undefined;
    }
    if (kind === "redemption_request") {
        const value = decodeRedemptionRequestAccount(bytes);
        return value ? { kind, value } : undefined;
    }
    const value = decodeConfigurableVaultAccount(bytes);
    return value ? { kind, value } : undefined;
}

function decodeStateAccount(data: Buffer | Uint8Array): StateAccountInfo | undefined {
    const bytes = Buffer.from(data);
    if (bytes.length < 890) return undefined;
    return {
        boss: publicKeyAt(bytes, 8),
        proposedBoss: publicKeyAt(bytes, 40),
        onycMint: publicKeyAt(bytes, 73),
        redemptionAdmin: publicKeyAt(bytes, 818),
        mainOffer: publicKeyAt(bytes, 858),
    };
}

function decodeOfferAccount(bytes: Buffer): OfferAccountInfo | undefined {
    if (bytes.length < 72) return undefined;
    return {
        tokenInMint: publicKeyAt(bytes, 8),
        tokenOutMint: publicKeyAt(bytes, 40),
    };
}

function decodeRedemptionOfferAccount(bytes: Buffer): RedemptionOfferAccountInfo | undefined {
    if (bytes.length < 146) return undefined;
    return {
        offer: publicKeyAt(bytes, 8),
        tokenInMint: publicKeyAt(bytes, 40),
        tokenOutMint: publicKeyAt(bytes, 72),
        requestCounter: readU64(bytes, 138),
    };
}

function decodeRedemptionRequestAccount(bytes: Buffer): RedemptionRequestAccountInfo | undefined {
    if (bytes.length < 80) return undefined;
    return {
        offer: publicKeyAt(bytes, 8),
        requestId: readU64(bytes, 40),
        redeemer: publicKeyAt(bytes, 48),
    };
}

function decodeConfigurableVaultAccount(bytes: Buffer): ConfigurableVaultAccountInfo | undefined {
    if (bytes.length < 41) return undefined;
    return {
        kind: bytes[8],
        withdrawalDestination: publicKeyAt(bytes, 9),
    };
}

function sameStateInfo(left: StateAccountInfo | undefined, right: StateAccountInfo): boolean {
    return Boolean(
        left &&
            left.boss.equals(right.boss) &&
            left.proposedBoss.equals(right.proposedBoss) &&
            left.onycMint.equals(right.onycMint) &&
            left.redemptionAdmin.equals(right.redemptionAdmin) &&
            left.mainOffer.equals(right.mainOffer),
    );
}

function decodedAccountByName(name: string, fallbackName?: string): DecodedAccount | undefined {
    const publicKey = publicKeyFromAccountValue(name) ?? (fallbackName ? publicKeyFromAccountValue(fallbackName) : undefined);
    return decodedAccountByPublicKey(publicKey);
}

function decodedAccountByPublicKey(publicKey: PublicKey | undefined): DecodedAccount | undefined {
    return publicKey ? state.decodedAccounts[publicKey.toBase58()] : undefined;
}

function publicKeyAt(bytes: Buffer, offset: number): PublicKey {
    return new PublicKey(bytes.subarray(offset, offset + 32));
}

function isDefaultPublicKey(publicKey: PublicKey): boolean {
    return publicKey.equals(SystemProgram.programId);
}

function readU64(bytes: Buffer, offset: number): bigint {
    return bytes.readBigUInt64LE(offset);
}

function u64Seed(value: bigint): Buffer {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(value);
    return buffer;
}

function encodeType(type: IdlType, value: unknown): Buffer {
    if (typeof type === "string") {
        return encodePrimitive(type, value);
    }

    if ("option" in type) {
        if (value === null || value === undefined || value === "") return Buffer.from([0]);
        return Buffer.concat([Buffer.from([1]), encodeType(type.option, value)]);
    }

    if ("vec" in type) {
        const arr = Array.isArray(value) ? value : JSON.parse(String(value || "[]"));
        return Buffer.concat([encodeU32(arr.length), ...arr.map((item: unknown) => encodeType(type.vec, item))]);
    }

    if ("array" in type) {
        const arr = Array.isArray(value) ? value : JSON.parse(String(value || "[]"));
        const [inner, length] = type.array;
        if (arr.length !== length) throw new Error(`Expected array length ${length}`);
        return Buffer.concat(arr.map((item: unknown) => encodeType(inner, item)));
    }

    if ("defined" in type) {
        return encodeDefined(type.defined.name, value);
    }

    throw new Error(`Unsupported IDL type: ${JSON.stringify(type)}`);
}

function encodePrimitive(type: PrimitiveIdlType, value: unknown): Buffer {
    if (type === "bool") return Buffer.from([parseBoolean(value) ? 1 : 0]);
    if (type === "pubkey") return new PublicKey(String(value)).toBuffer();
    if (type === "string") {
        const bytes = Buffer.from(String(value), "utf8");
        return Buffer.concat([encodeU32(bytes.length), bytes]);
    }

    const size = integerByteLength(type);
    if (!size) throw new Error(`Unsupported primitive type: ${type}`);
    return encodeInteger(value, size, type.startsWith("i"));
}

function encodeDefined(name: string, value: unknown): Buffer {
    const typeDef = typeByName.get(name);
    if (!typeDef) throw new Error(`Unknown defined type: ${name}`);

    if (typeDef.type.kind === "struct") {
        const object = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
        return Buffer.concat(typeDef.type.fields.map((field) => encodeType(field.type, object[field.name])));
    }

    const variant = resolveEnumVariant(typeDef, value);
    const index = typeDef.type.variants.findIndex((candidate) => candidate.name === variant.name);
    const fields = variant.fields ?? [];
    const payload = Array.isArray(fields) ? encodeEnumFields(fields, variant.value) : Buffer.alloc(0);
    return Buffer.concat([Buffer.from([index]), payload]);
}

function resolveEnumVariant(typeDef: IdlTypeDef, value: unknown): { name: string; fields?: IdlArg[] | IdlType[]; value?: unknown } {
    if (typeDef.type.kind !== "enum") throw new Error(`${typeDef.name} is not an enum`);
    const variants = typeDef.type.variants;

    if (typeof value === "string") {
        const parsed = value.trim().startsWith("{") ? JSON.parse(value) : value;
        return resolveEnumVariant(typeDef, parsed);
    }

    if (value && typeof value === "object") {
        const object = value as Record<string, unknown>;
        const key = Object.keys(object)[0];
        const variant = variants.find((candidate) => normalizeName(candidate.name) === normalizeName(key));
        if (!variant) throw new Error(`Invalid ${typeDef.name} variant: ${key}`);
        return { ...variant, value: object[key] };
    }

    const variant = variants.find((candidate) => normalizeName(candidate.name) === normalizeName(String(value)));
    if (!variant) throw new Error(`Invalid ${typeDef.name} variant: ${String(value)}`);
    return variant;
}

function encodeEnumFields(fields: IdlArg[] | IdlType[], value: unknown): Buffer {
    if (!fields.length) return Buffer.alloc(0);
    if (isIdlArg(fields[0])) {
        const object = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
        return Buffer.concat((fields as IdlArg[]).map((field) => encodeType(field.type, object[field.name])));
    }
    const arr = Array.isArray(value) ? value : [value];
    return Buffer.concat((fields as IdlType[]).map((field, index) => encodeType(field, arr[index])));
}

function isIdlArg(value: IdlArg | IdlType): value is IdlArg {
    return Boolean(value && typeof value === "object" && "name" in value && "type" in value);
}

function decodeReturnData(base64: string): unknown {
    const instruction = selectedInstruction();
    if (!instruction.returns) return { rawBase64: base64 };

    const bytes = Buffer.from(base64, "base64");
    const attempts = [0, 8]
        .filter((offset) => offset < bytes.length)
        .map((offset) => {
            try {
                const [value, nextOffset] = decodeType(instruction.returns!, bytes, offset);
                return { offset, value, consumed: nextOffset - offset };
            } catch (error) {
                return { offset, error: errorMessage(error) };
            }
        });
    return attempts;
}

function decodeType(type: IdlType, bytes: Buffer, offset: number): [unknown, number] {
    if (typeof type === "string") {
        if (type === "bool") return [bytes[offset] !== 0, offset + 1];
        if (type === "pubkey") return [new PublicKey(bytes.subarray(offset, offset + 32)).toBase58(), offset + 32];
        if (type === "string") {
            const [length, afterLength] = decodeType("u32", bytes, offset) as [number, number];
            return [bytes.subarray(afterLength, afterLength + length).toString("utf8"), afterLength + length];
        }
        const size = integerByteLength(type);
        if (!size) throw new Error(`Unsupported return primitive: ${type}`);
        return [decodeInteger(bytes.subarray(offset, offset + size), type.startsWith("i")), offset + size];
    }

    if ("option" in type) {
        const present = bytes[offset] === 1;
        if (!present) return [null, offset + 1];
        return decodeType(type.option, bytes, offset + 1);
    }

    if ("vec" in type) {
        const [length, start] = decodeType("u32", bytes, offset) as [number, number];
        const values: unknown[] = [];
        let cursor = start;
        for (let i = 0; i < length; i++) {
            const [value, next] = decodeType(type.vec, bytes, cursor);
            values.push(value);
            cursor = next;
        }
        return [values, cursor];
    }

    if ("defined" in type) {
        return decodeDefined(type.defined.name, bytes, offset);
    }

    throw new Error(`Unsupported return type: ${JSON.stringify(type)}`);
}

function decodeDefined(name: string, bytes: Buffer, offset: number): [unknown, number] {
    const typeDef = typeByName.get(name);
    if (!typeDef) throw new Error(`Unknown defined type: ${name}`);

    if (typeDef.type.kind === "struct") {
        const object: Record<string, unknown> = {};
        let cursor = offset;
        for (const field of typeDef.type.fields) {
            const [value, next] = decodeType(field.type, bytes, cursor);
            object[field.name] = value;
            cursor = next;
        }
        return [object, cursor];
    }

    const index = bytes[offset];
    const variant = typeDef.type.variants[index];
    if (!variant) throw new Error(`Invalid enum variant index: ${index}`);
    return [{ [variant.name]: {} }, offset + 1];
}

function encodeInteger(value: unknown, byteLength: number, signed: boolean): Buffer {
    let bigint = BigInt(String(value || "0"));
    const max = 1n << BigInt(byteLength * 8);
    if (signed && bigint < 0) {
        bigint = max + bigint;
    }

    const buffer = Buffer.alloc(byteLength);
    for (let i = 0; i < byteLength; i++) {
        buffer[i] = Number((bigint >> BigInt(i * 8)) & 0xffn);
    }
    return buffer;
}

function decodeInteger(bytes: Buffer, signed: boolean): string | number {
    let value = 0n;
    for (let i = 0; i < bytes.length; i++) {
        value |= BigInt(bytes[i]) << BigInt(i * 8);
    }
    if (signed) {
        const signBit = 1n << BigInt(bytes.length * 8 - 1);
        if (value & signBit) {
            value -= 1n << BigInt(bytes.length * 8);
        }
    }
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : value.toString();
}

function encodeU32(value: number): Buffer {
    return encodeInteger(value, 4, false);
}

function integerByteLength(type: string): number | undefined {
    switch (type) {
        case "u8":
            return 1;
        case "u16":
            return 2;
        case "u32":
            return 4;
        case "u64":
        case "i64":
            return 8;
        default:
            return undefined;
    }
}

function defaultArgValue(type: IdlType): string {
    if (type === "bool") return "false";
    if (type === "pubkey") return "";
    if (type === "string") return "";
    if (typeof type === "string") return "0";
    if ("option" in type) return "null";
    if ("vec" in type) return "[]";
    if ("array" in type) return "[]";
    if ("defined" in type) {
        const typeDef = typeByName.get(type.defined.name);
        if (typeDef?.type.kind === "enum") return typeDef.type.variants[0]?.name ?? "";
        if (typeDef?.type.kind === "struct") {
            return JSON.stringify(Object.fromEntries(typeDef.type.fields.map((field) => [field.name, defaultJsonValue(field.type)])), null, 2);
        }
    }
    return "";
}

function defaultJsonValue(type: IdlType): unknown {
    if (type === "bool") return false;
    if (type === "pubkey" || type === "string") return "";
    if (typeof type === "string") return "0";
    if ("option" in type) return null;
    if ("vec" in type || "array" in type) return [];
    if ("defined" in type) return {};
    return null;
}

function typeLabel(type: IdlType): string {
    if (typeof type === "string") return type;
    if ("option" in type) return `option<${typeLabel(type.option)}>`;
    if ("vec" in type) return `vec<${typeLabel(type.vec)}>`;
    if ("array" in type) return `[${typeLabel(type.array[0])}; ${type.array[1]}]`;
    if ("defined" in type) return type.defined.name;
    return "unknown";
}

function enumTypeDef(type: IdlType): IdlTypeDef | undefined {
    if (typeof type === "string" || !("defined" in type)) return undefined;
    const typeDef = typeByName.get(type.defined.name);
    return typeDef?.type.kind === "enum" ? typeDef : undefined;
}

function isDefinedType(type: IdlType, name: string): boolean {
    return typeof type !== "string" && "defined" in type && type.defined.name === name;
}

function parseBoolean(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    return String(value).toLowerCase() === "true" || String(value) === "1";
}

function displayName(name: string): string {
    return name.replaceAll("_", " ");
}

function normalizeName(name: string): string {
    return name.replaceAll("_", "").replaceAll("-", "").toLowerCase();
}

function appendOutput(message: string): void {
    const stamp = new Date().toLocaleTimeString();
    state.output = state.output ? `${state.output}\n\n[${stamp}] ${message}` : `[${stamp}] ${message}`;
}

function scrollOutputToBottom(): void {
    requestAnimationFrame(() => {
        const output = document.querySelector<HTMLPreElement>("#output-text");
        if (output) {
            output.scrollTop = output.scrollHeight;
        }
    });
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function jsonReplacer(_key: string, value: unknown): unknown {
    return typeof value === "bigint" ? value.toString() : value;
}

boot();
