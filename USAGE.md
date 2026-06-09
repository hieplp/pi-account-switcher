# Pi Account Switcher — Install & Usage

This guide covers installation, configuration workflows, and troubleshooting for the account-switcher extension.

> For command reference and config file formats, see **README.md**.

## 1. Install

### Run Temporarily for Testing

```bash
pi -e ./src/extension.ts
```

Inside Pi, add your first account:

```txt
/accounts:add
```

To reload after config changes:

```txt
/reload
```

### Install as a Pi Package (recommended)

```bash
pi install git:github.com/hieplp/pi-account-switcher
```

See **README.md** for npm, project-local, and global install methods.

## 2. OAuth Login (Claude, Codex, Gemini, etc.)

For subscription/OAuth providers, use Pi's built-in login first, then import that login as a named switchable account.

```txt
/login
/accounts:oauth
```

To add another OAuth account for the same provider, run `/login` again with a different browser account, then `/accounts:oauth` again with a different label.

Switch OAuth accounts with:

```txt
/accounts:list
```

OAuth credentials are captured from `~/.pi/agent/auth.json`. When switching, the extension applies the stored credentials to Pi's live auth storage.

## 3. Configure API-key Accounts from Inside Pi

### Add an account

```txt
/accounts:add
```

The wizard asks for: provider, label, id, credential env var, and secret source. Supports pasted API key, env var, file path, shell command, or 1Password `op://` reference. If the id already exists, you can replace it, enter a new id, or cancel.

**Warning:** choosing `Paste API key now` stores the key as plaintext in `accounts.json`. Prefer env vars, files with restricted permissions, or 1Password references.

### Manage custom providers

```txt
/providers:list
/providers:add
/providers:edit
/providers:remove
```

Custom providers are stored in `~/.pi/account-switcher/providers.json`. Built-in providers are read-only. Removing a provider is blocked while any account still uses it.

## 4. Configure Accounts Manually

Edit `~/.pi/account-switcher/accounts.json`:

```json
{
  "switchMode": "env",
  "accounts": [
    {
      "id": "claude-work",
      "label": "Claude — Work",
      "provider": "anthropic",
      "dirs": ["/home/user/Development/Work"],
      "env": {
        "ANTHROPIC_API_KEY": { "type": "env", "name": "ANTHROPIC_WORK_API_KEY" }
      }
    },
    {
      "id": "openai-personal",
      "label": "OpenAI — Personal",
      "provider": "openai",
      "env": {
        "OPENAI_API_KEY": { "type": "file", "path": "~/.keys/openai-personal.txt" }
      }
    }
  ]
}
```

See **README.md** for secret source formats and state file format.

## 5. Switching Flow

1. Start Pi: `pi -e ./src/extension.ts`
2. For OAuth accounts: `/login` → `/accounts:oauth`
   For API-key accounts: `/accounts:add`
3. Switch accounts anytime: `/accounts:list`
4. If config was edited manually: `/reload`

## 6. Directory-based Auto-Select

The extension can automatically activate the right account based on your current working directory. The `dirs` field on each account lists directory prefixes — the longest matching prefix wins. A `defaultAccountId` at the config level serves as the fallback for sessions that have no saved state and no directory match.

### Manage dirs with `/accounts:dirs`

The wizard opens with two options when an active account and current working directory are detected:

- **Auto-save** — one-step: saves the current directory to the active account
- **Manual** — pick an account, then add (recursive directory browser from `~/`) or remove directories

Auto-save is the quick path when you're already in the right folder with the right account active.

### Activation cascade (session start)

1. **Session state** — account previously selected for this Pi session
2. **CWD-based auto-select** — longest matching directory prefix across all accounts
3. **`defaultAccountId`** — config-level fallback in `accounts.json`
4. **None** — no account activated until you pick one via `/accounts:list`

## 7. State Persistence

Selected accounts and models are saved per Pi session at `~/.pi/account-switcher/state.json`. Each session gets its own key, derived from Pi's session file. Sessions with no saved state fall back to the activation cascade (see above).

Legacy flat-format state (`{ "activeAccountId": "..." }`) is automatically migrated to the session-keyed format on first load after upgrading.

## 8. Credential Caching

On switch, the extension updates `process.env`, Pi's live API-key overrides, and Pi's OAuth auth storage. If a provider still uses old credentials, run `/reload` or restart Pi.

## 9. Troubleshooting

### No accounts configured
Run `/accounts:add` to create one, or create `~/.pi/account-switcher/accounts.json` manually.

### No accounts for provider
Run `/accounts:list` explicitly. Check that `provider` values match supported providers:
- `anthropic` / `claude`
- `openai`
- `openai-codex` / `codex`
- `google` / `gemini`
- `xai`
- `openrouter`

### Secret resolves empty
Check:
- env var exists and is accessible
- file exists and contains the key
- command works when run manually
- `op` CLI is signed in

### Changes do not apply
Switch the account again. If the provider still keeps old credentials cached:
```txt
/reload
```
If it still uses the old account, restart Pi.
