# UI Source Map

This UI is intentionally split by maintenance task so future agents can edit one area without reading the whole app.

- `main.ts`: application flow, rendering, DOM events, wallet/RPC actions, transaction building, and account derivation rules.
- `constants.ts`: mainnet program IDs, mint constants, seed maps, and generated IDL indexes.
- `types.ts`: IDL, wallet, decoded account, and app state TypeScript shapes.
- `account-decoders.ts`: binary account decoders for state, offer, redemption offer/request, and configurable vault accounts.
- `idl-codec.ts`: IDL argument encoding, return-data decoding, enum handling, and default argument values.
- `format.ts`: display, escaping, JSON, and error-message helpers.
- `styles.css`: visual layout and interaction styling.

When adding support for an instruction:

1. Put new static IDs or seed names in `constants.ts`.
2. Put account-data layout decoding in `account-decoders.ts`.
3. Put IDL type encoding/decoding changes in `idl-codec.ts`.
4. Put account auto-fill and derivation behavior in `main.ts`.
5. Keep display-only helpers in `format.ts`.
