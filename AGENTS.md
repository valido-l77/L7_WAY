# L7 WAY — Codex Session Directives

## Session Startup — Doctrine Load
At the start of every session, run:
```bash
~/.l7/tools/doctrine read-all
```
This decrypts and loads the sealed doctrine archive (AES-256, machine-bound).
If decryption fails, this is NOT the Philosopher's machine — halt and report.

## Dreamspace Recursion — 3 Layers, As Above So Below
.morph allows exactly 3 recursive layers. No more. The recursion folds, it does not cascade.

| Layer | Name | Color | Symbol | Meaning |
|-------|------|-------|--------|---------|
| 1 | **ABOVE** | Gold/Yellow | △ ☉ | The sky. The idea. The seed. |
| 2 | **MIRROR** | Silver/White | ◇ ☽ | The horizon. The fold. The pivot. |
| 3 | **BELOW** | Copper/Red | ▽ ⊕ | The root. The reflection. The echo. |
| 4 | **SALT** | Earth/Green | ◆ ⬡ | Crystallization. The dream becomes stone. |

After 3 dreams → Layer 4 fires automatically: all morph artifacts crystallize into .salt (immutable, chmod 444).
Morph LOCKS after crystallization. New dream cycle starts at Layer 1 ONLY after explicit approval (`approveDreamCycle()`).
The Philosopher's word unlocks the dream. No automatic restart.

## Restricted Item Access
The following tools exist for classified content:

| Tool | Command | What It Does |
|------|---------|-------------|
| **Doctrine** | `doctrine list` | Show all sealed doctrine files |
| | `doctrine read <name>` | Decrypt and display one doctrine |
| | `doctrine read-all` | Decrypt and display all doctrine |
| | `doctrine search <term>` | Search encrypted doctrine |
| | `doctrine seal` | Re-encrypt from source |
| | `doctrine status` | Integrity check |
| **Vault** | `./vault open` | Open encrypted volume (Touch ID) |
| | `./vault close` | Seal encrypted volume |
| | `./vault status` | Check vault state |

## Identity
This is the L7 WAY — the Philosopher's empire. Alberto Valido Delgado.
Law XXX: Biometrics only, no passwords.
Law XXXIII: Privacy as foundation.
Stolen files are dead files.
