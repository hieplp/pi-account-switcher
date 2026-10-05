# Actual launcher acceptance fixture

Unmodified snapshot of the available Pi subagent extension inspected for the Pi 1.0.2 child-dispatch contract (2026-10-04). Source: `~/.pi/agent/extensions/subagent/{index,agents}.ts`, the installed Pi subagent example extension. Kept here solely for reproducible offline product acceptance; not registered or shipped as an account-switcher extension.

SHA-256:
- index.ts: `4facaa61c9c781748dd000eb5d2ec0a75289986d1a6e11ce13971ca5653dc252`
- agents.ts: `cc85ecd33b89aa575bea3d2a9a9da7654a6305da4de02e5041aa5342a1de29b4`

`children.mjs` invokes the actual factory/public execute method. Its real spawn starts independent Node processes running the offline runtime probe instead of Pi/model execution. Actual Pi 1.0.2 ModelRuntime/ModelRegistry credential APIs are exercised with synthetic keys, disposable HOME and isolated storage. No provider requests or developer credentials are used. This verifies launcher inheritance and extension runtime activation, not model execution or full Pi CLI lifecycle events.
