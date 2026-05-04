# Pi Account Switcher

Pi extension for quickly switching between multiple accounts/API keys for the same provider.

Examples:

- `claude/work`
- `claude/personal`
- `codex/client-a`
- `openai/team`
- `gemini/testing`

## Install / Run Locally

From this repo:

```bash
npm install
pi -e ./src/index.ts
```

Or install as a Pi package/extension later.

## Commands

- `/account` — pick an account for the current model provider.
- `/account anthropic` — pick an Anthropic/Claude account explicitly.
- `/account openai` — pick an OpenAI/Codex account explicitly.
- `/accounts` — list configured accounts.
- `/account-current` — show active account.
- `/account-debug` — show non-secret debug info for the current provider/auth state.
- `/account-add` — add a new account interactively from inside Pi.
- `/account-login` — add and immediately activate an account/API key from inside Pi.
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
