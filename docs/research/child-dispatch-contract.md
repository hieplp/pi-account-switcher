# Pi 1.0.2 child account dispatch decision

Decision for #12 / spec #5: **reject one-shot requests on the available launcher**. Support persistent child preferences via inherited environment; do not advertise exactly-once allocation. This is a research prerequisite, not implementation of the command rejection.

## Scope and inspected versions

Base verified: `2590e73e63a835e6b96feb5ffe6254a41b7ce19b` (`fork/pi-1.0.2`). Installed `@earendil-works/pi-coding-agent` package reports exact `1.0.2`. Available launcher is the user extension `~/.pi/agent/extensions/subagent/index.ts`, with no independent version declaration; identify this snapshot by SHA-256:

- index.ts: `4facaa61c9c781748dd000eb5d2ec0a75289986d1a6e11ce13971ca5653dc252`
- agents.ts: `cc85ecd33b89aa575bea3d2a9a9da7654a6305da4de02e5041aa5342a1de29b4`

No claim for Pi 0.85, later releases, or other launchers.

## Source evidence (not executed Pi lifecycle assertions)

Read installed Pi README, extensions, SDK, and CLI-integration documentation and the installed extension event declarations. Pi does not ship subagents as a core capability. Pi 1.0.2 `dist/core/extensions/types.d.ts` exposes mutable/blockable `tool_call` input, notification `tool_execution_*`, and post-execution `tool_result`. These are **tool invocation** boundaries, not per-child launch acceptance boundaries. Sibling tools can run concurrently.

Available launcher source: `runSingleAgent` resolves the agent, optionally awaits prompt-file creation, then calls `spawn` without an explicit `env`. No reservation callback, account argument, spawn-acceptance event, or extension-bus protocol is present. `getPiInvocation` re-executes the current script when available. A single call can represent a chain or up to eight parallel tasks (four workers). Unknown agents, invalid modes, excessive tasks, project approval rejection, and spawn errors follow different rejection paths. Result exit status is not an acceptance receipt: a successfully spawned child can fail later.

The actual integration point needed would be **inside the parent launcher immediately around each spawn**, supplying an immutable per-child environment and an atomic reservation/acceptance handshake. Global environment mutation in a `tool_call` hook is neither per-child nor isolated from competing calls, and `tool_result` arrives too late. Child-local deletion cannot update the parent's environment. Wrapping/replacing this unrelated launcher or monkey-patching Node spawn is not a reliable supported contract and is outside this ticket.

Repository source at the base reads/deletes `PI_ACCOUNT_SWITCHER_NEXT_ID` in the child runtime, while parent selection and persistent child preferences both write `PI_ACCOUNT_SWITCHER_ACTIVE_ID`. This is the state collision and repeated inheritance to remove in the follow-up implementation.

## Executed offline separate-process proof

Run with Node 22 and an installed exact Pi 1.0.2 plus the inspected launcher:

```sh
node docs/research/child-dispatch-proof.mjs /absolute/pi-coding-agent /absolute/subagent/index.ts
```

The script loads the **actual launcher factory and public registered tool execute method**, with installed Pi libraries resolved through jiti aliases. It uses disposable HOME/project agent definitions, deletes the calling process environment, and supplies only synthetic account IDs. The actual launcher spawns separate Node processes; those children run a tiny JSON emitter instead of Pi/model execution. The emitter reads then deletes the inherited one-shot variable. No provider, credential store, network, or real agent configuration is used. This proves dispatch/environment behavior, not full Pi account activation or extension-event delivery.

Executed on Node `v22.23.3`: PASS. Unknown-agent rejection retains parent one-shot; retry and a later sequential call both receive `fake-once`; two competing public execute calls have distinct child PIDs and both receive `fake-once`; a parallel batch and two-step chain likewise duplicate it. Parent still holds the variable. With one-shot removed, both parallel children inherit `fake-persistent`; resetting the inherited selector gives `fake-parent`. Assertions preserve the counterexample rather than assert a fictional allocator. Initial harness runs failed dependency resolution; resolving host library aliases fixed the harness, not launcher behavior.

## Required follow-up contract

- Keep parent active identity and persistent child preference separate. Parent switching must not replace/consume child preference. Clearing child preference leaves parent identity, effective credentials, and saved selection unchanged.
- Nonempty `set_subagent_account` requests with omitted `oneshot` or `oneshot=true` reject before any state/environment/persistence mutation. UI one-shot choice must do the same. Suggested message: “One-shot child account selection is unsupported with this launcher on Pi 1.0.2. Use oneshot=false for a persistent child preference, then clear it explicitly after the desired launches.” Update tool descriptions/guidelines; do not leave default one-shot promises.
- Empty ID is an explicit clear operation regardless of the default flag; clear child preference and obsolete pending one-shot only, never parent active identity. Ignore/migrate obsolete NEXT_ID so old state cannot silently enable unsupported selection; document migration.
- Persistent preference applies to all subsequently spawned inheriting children, including sequential/chain/parallel launches and retries, until explicitly changed/cleared. Rejected launches do not mutate it. Each child receives the preference present at its spawn; changing preference during an in-flight batch is not a batch snapshot guarantee. Launchers that scrub environment are not supported by this inheritance contract.
- Use a distinct child-preference environment key; child resolution is explicit child preference, then inherited parent, then existing normal fallback. Persistent preference should remain inherited by descendants unless explicitly cleared there. No accepted-launch consumption, reservation, retry ledger, or concurrency allocator is needed in the rejection design.
- Future one-shot support requires a separately versioned opt-in dispatcher contract with per-child immutable env, serialized reservation, deterministic batch order, accepted-spawn consumption, rejection restoration, retry identity, cancellation rules, and competing-call protection. Do not infer support from tool name alone.

The offline proof does not yet assert implemented one-shot-command rejection or separated persistent state: those public runtime regressions belong to the dependent implementation ticket. It supplies the durable actual-launcher counterexample needed to choose that implementation honestly.
