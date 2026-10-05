# Pi 1.0.2 Docker acceptance

Run `npm run test:acceptance` from the checkout with Docker available.

The image uses digest-pinned Node 22.23.0 (above Pi's Node 22.19 minimum) and the committed npm lockfile, including exact Pi 1.0.2 development dependencies. The build fetches dependencies. Acceptance then runs with `--network none`, dropped capabilities, and no host mounts (including no HOME, credentials, or Docker socket). HOME and `PI_CODING_AGENT_DIR` point to disposable synthetic directories. Only source, manifests, and test configuration are copied into the image; developer environment variables are not forwarded.

The offline command performs normal `pi install /work` local-package installation, discovers it through saved package settings using Pi's actual resource loader, asserts exact host version and one loaded extension with zero errors/warnings, then runs typecheck and all tests. Credential tests use synthetic API keys and OAuth-shaped entries against actual Pi APIs with model network discovery disabled. They make no provider requests and do not test OAuth refresh or validity.

Initialization acceptance (`scripts/acceptance/initialization.mjs`) runs empty and populated saved catalogs in separate disposable processes. It uses Pi 1.0.2's actual startup services plus CLI `--list-models`, then verifies initial default-model selection before binding `session_start`. Catalog registration preserves account/provider/state files, stored auth, and the full environment; synthetic catalog credentials remain distinct from account credentials. Binding the session activates the configured default account, and `/accounts:switch` selects another account with observable effective auth and persisted identity. No prompts are sent to providers.

The regression was observed dynamically: before the fix, the populated catalog was absent from Pi's startup model registry. Source inspection explains the timing (Pi applies initialization registrations before listing/selection); source timing alone is not the acceptance evidence. Empty catalogs are checked for clean loading and absence of synthetic models, not claimed to support selecting a nonexistent model.

Live lifecycle acceptance (`scripts/acceptance/lifecycle.mjs`) drives public runtime operations through a loaded fixture extension in an actual Pi 1.0.2 session. It proves stale IDs disappear after rename/removal, unrelated models and account files remain unchanged, removing an OpenAI override restores the exact built-in catalog, and the production reset command removes all extension registrations without restarting Pi. Only confirmation is supplied by the offline fixture. Runtime regression tests inject registration/removal errors and verify saved configuration preservation and explicit restoration-failure reporting. Before the fix the live rename assertion failed because the stale ID remained selectable.

For subsequent tickets, add durable regressions under `src/**/*.test.ts`; they automatically run here. A custom offline command can also be supplied, for example:

```sh
bash scripts/acceptance/run.sh sh -ec 'npm test -- src/utils/accounts.test.ts'
```

Custom commands replace the default installation/loading/typecheck suite. No runtime mounts are added. The temporary image is removed on exit and the acceptance container is disposable. Dependency fetching requires network; acceptance does not. Keep future tests synthetic and avoid provider requests even though the container blocks external networking.

Wildcard peers are Pi's host-package declaration contract, not a support range. Only Pi 1.0.2 is validated. Extension-owned jiti and zod remain runtime dependencies.
