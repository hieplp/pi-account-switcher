# Pi Account Switcher

Pi extension for quickly switching between multiple accounts/API keys for the same provider.

Examples:

- `claude/work`
- `claude/personal`
- `codex/client-a`
- `openai/team`
- `gemini/testing`

## Install

### From GitHub

Install globally:

```bash
pi install git:github.com/hieplp/pi-account-switcher
```

Or test for one Pi run without permanently installing:

```bash
pi -e git:github.com/hieplp/pi-account-switcher
```

Install project-locally, writing to `.pi/settings.json`:

```bash
pi install -l git:github.com/hieplp/pi-account-switcher
```

Then restart or reload Pi and initialize the config:

```txt
/reload
/account-init
```

### From npm

After the package is published to npm, install globally with:

```bash
pi install npm:pi-account-switcher
```

Or project-locally:

```bash
pi install -l npm:pi-account-switcher
```

To test without permanently installing:

```bash
pi -e npm:pi-account-switcher
```

See [INSTALL_AS_PI_PACKAGE.md](./INSTALL_AS_PI_PACKAGE.md) for publishing notes.

### Run from a Local Checkout

From this repo:

```bash
npm install
pi -e ./src/index.ts
```

## Commands

- `/account` — pick an account for the current model provider.
- `/account anthropic` — pick an Anthropic/Claude account explicitly.
- `/account openai` — pick an OpenAI/Codex account explicitly.
- `/accounts` — list configured accounts.
- `/account-current` — show active account.
- `/account-debug` — show non-secret debug info for the current provider/auth state.
- `/account-add` — add a new account interactively from inside Pi; duplicate ids can be replaced, renamed, or canceled.
- `/account-login` — add and immediately activate an account/API key from inside Pi.
- `/account-edit` — edit label, provider, id, and env credential source without printing secrets.
- `/account-remove` — delete an account and clear stale saved state selections.
- `/account-test` — validate that configured credentials resolve without printing secret values.
- `/account-oauth-import` — import the currently logged-in Pi `/login` OAuth credentials as a switchable account.
- `/account-reload` — reload config from disk.
- `/account-init` — create an example config if missing.

## OAuth Login Like Pi `/login`

For subscription/OAuth providers, use Pi's built-in login first, then import that login as a named account.

Flow:

```txt
/login
```

Select the provider and complete browser/device login. Then run:

```txt
/account-oauth-import
```

Give that login a label/id, for example `Claude — Work` or `Codex — Personal`.

To add another OAuth account for the same provider:

1. Run built-in `/login` again and sign into the other browser account.
2. Run `/account-oauth-import` again and save it under another label.
3. Switch between saved OAuth accounts with `/account`.

OAuth credentials are captured from Pi's auth file:

```txt
~/.pi/agent/auth.json
```

When you switch accounts, this extension writes the selected OAuth credentials back to that Pi auth file and asks whether to reload Pi. Accept the reload prompt; otherwise Pi may keep using a cached provider client from the previous login.

## Add/Login from Inside Pi

You can configure accounts without manually creating JSON:

```txt
/account-add
```

or add and activate immediately:

```txt
/account-login
```

The wizard asks for:

1. Provider.
2. Account label.
3. Account id.
4. Credential env var, such as `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.
5. Secret source:
   - pasted API key
   - existing env var
   - file
   - shell command
   - 1Password `op://` reference

If you paste an API key, it is stored as plain text in the config file. Prefer env/file/1Password for safer storage.

If the new id already exists, Pi asks whether to replace the existing account, enter a new id, or cancel.

## Edit, Remove, and Test Accounts

```txt
/account-edit
/account-remove
/account-test
```

`/account-edit` preserves existing values when you leave text prompts blank. It never displays literal secret values by default.

`/account-remove` shows a non-secret summary, asks for confirmation, deletes the account, and clears any saved selected state that referenced it.

`/account-test` checks literal/env/file/command/1Password/Pi OAuth sources and reports only whether each source resolves to a non-empty value.

## Config

Config lives at:

```txt
~/.pi/account-switcher/accounts.json
```

Example:

```json
{
  "switchMode": "env",
  "accounts": [
    {
      "id": "claude-work",
      "label": "Claude — Work",
      "provider": "anthropic",
      "env": {
        "ANTHROPIC_API_KEY": { "type": "env", "name": "ANTHROPIC_WORK_API_KEY" }
      }
    },
    {
      "id": "codex-personal",
      "label": "Codex — Personal",
      "provider": "openai",
      "env": {
        "OPENAI_API_KEY": { "type": "file", "path": "~/.keys/openai-personal.txt" }
      }
    }
  ]
}
```

## Secret Sources

Supported values in `env`:

```json
{ "type": "literal", "value": "sk-..." }
{ "type": "env", "name": "MY_API_KEY" }
{ "type": "file", "path": "~/.keys/key.txt" }
{ "type": "command", "command": "op read op://AI/Claude/api-key" }
{ "type": "op", "reference": "op://AI/Claude/api-key" }
```

A plain string is treated as a literal, except strings beginning with `op://` are resolved with `op read`.

## State

Selected accounts are persisted at:

```txt
~/.pi/account-switcher/state.json
```

On Pi session start, the extension restores saved accounts and applies their env vars.

## Note About Credential Caching

The MVP switches accounts by updating `process.env`. If Pi/provider clients already cached credentials, you may need to run:

```txt
/reload
```

after switching accounts.

## License

MIT. See [LICENSE](./LICENSE).
