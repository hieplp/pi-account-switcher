# Pi Account Switcher

> Switch between multiple API keys and accounts — per provider — inside Pi. No more manual env-var juggling.

```
claude/work  ·  claude/personal  ·  openai/team  ·  gemini/testing
```

---

## Install

```bash
pi install git:github.com/hieplp/pi-account-switcher     # from GitHub (recommended)
pi install npm:@hieplp/pi-account-switcher                 # from npm
pi install -l git:github.com/hieplp/pi-account-switcher   # project-local install
```

After installing, reload Pi and add your first account:

```
/reload
/accounts:add
```

---

## Commands

### Accounts

| Command            | Description                                                     |
| ------------------ | --------------------------------------------------------------- |
| `/accounts:add`    | Add a new account interactively                                 |
| `/accounts:list`   | List all accounts and activate the selected one                 |
| `/accounts:switch` | Switch to another account within the current provider           |
| `/accounts:edit`   | Edit label, provider, id, or credential source                  |
| `/accounts:remove` | Delete an account                                               |
| `/accounts:oauth`  | Import the current Pi `/login` OAuth session as a named account |
| `/accounts:dirs`   | Manage working directories for CWD-based auto-select            |

### Providers

| Command             | Description                      |
| ------------------- | -------------------------------- |
| `/providers:add`    | Add a reusable custom provider   |
| `/providers:list`   | List custom providers            |
| `/providers:edit`   | Edit a custom provider           |
| `/providers:remove` | Remove an unused custom provider |

### Models

| Command          | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `/models:list`   | List all available models and switch to the selected one |
| `/models:add`    | Add a custom model config to the current provider        |
| `/models:remove` | Remove a custom model config                             |

### System

| Command          | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `/system:reset`  | Delete all accounts, providers, and state                |
| `/system:export` | Export all accounts, providers, and state to a JSON file |
| `/system:import` | Import accounts, providers, and state from a JSON file   |

---

## Directory-based Auto-Select

Accounts can auto-activate based on your current working directory. Each account can list directory paths (`dirs`) — the longest prefix match wins. A `defaultAccountId` at the config level serves as the fallback. Use `/accounts:dirs` to manage directories interactively.

See **USAGE.md** for full details on the activation cascade, configuration, and examples.

---

## Config Reference

### Accounts — `~/.pi/account-switcher/accounts.json`

```json
{
  "switchMode": "env",
  "defaultAccountId": "claude-work",
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
      "dirs": ["/home/user/Projects/Client-A"],
      "env": {
        "OPENAI_API_KEY": { "type": "file", "path": "~/.keys/openai-personal.txt" }
      }
    }
  ]
}
```

### Secret Sources

```json
{ "type": "literal", "value": "sk-..." }
{ "type": "env",     "name": "MY_API_KEY" }
{ "type": "file",    "path": "~/.keys/key.txt" }
{ "type": "command", "command": "op read op://AI/Claude/api-key" }
{ "type": "op",      "reference": "op://AI/Claude/api-key" }
```

A plain string is treated as a literal; strings starting with `op://` are resolved via `op read`.

### State — `~/.pi/account-switcher/state.json`

Each Pi session gets its own keyed state. No global active-account state.

```json
{
  "sessions": {
    "abc123": { "activeAccountId": "claude-work" },
    "def456": { "activeAccountId": "openai-personal", "activeModelId": "gpt-4", "activeModelProvider": "openai" }
  }
}
```

Legacy flat-format state (`{ "activeAccountId": "..." }`) is automatically migrated on first load.

---

## License

MIT — see [LICENSE](./LICENSE).
