# 🔌 Conduit

Create information-dense tabs, each with a flexible grid of terminal, editor, and web panes (that can be arbitrarily resized, and organized)

<img width="1630" height="1083" alt="image" src="https://github.com/user-attachments/assets/ff0be63c-7426-43d8-a3da-b8cc717543ae" />

**Design mode**

Organize your tabs by creating or removing panes, drag & dropping panes, splitting panes into new tabs, etc.

<img width="1630" height="1083" alt="image" src="https://github.com/user-attachments/assets/1c98209d-0f87-43b7-9243-3f4bd189d778" />

**Focus mode**

Zoom in and out of panes in a tab (w/`cmd+option+f`), so you can seamlessly transition between focusing and observing (with a really fun minimap!)

<img width="1630" height="1083" alt="image" src="https://github.com/user-attachments/assets/2b104268-8034-43b7-9bc8-b33540976a97" />

**Quick actions**

Perform one-off actions without needing to disrupt your tab layouts, or switching to another tool.

<img width="1630" height="1083" alt="image" src="https://github.com/user-attachments/assets/57fa6c6c-bbf3-432d-903d-c20ded59eaca" />

<img width="1630" height="1083" alt="image" src="https://github.com/user-attachments/assets/29ecc28b-a24d-4732-ab2a-5c079794478c" />

<img width="1630" height="1083" alt="image" src="https://github.com/user-attachments/assets/64718f54-eabf-445f-bde7-f2f8ae575556" />

**Workspaces**

Save and restore sets of tabs, so you can jump in and out of projects with ease.

<img width="1630" height="1083" alt="image" src="https://github.com/user-attachments/assets/a1b943cd-d436-483e-b61a-bc66815a159e" />

**Agent sessions**

Create isolated agent environments, by spinning up new terminals with automatic worktree management.

<img width="1595" height="1221" alt="image" src="https://github.com/user-attachments/assets/468e504f-4730-4884-91cf-9aae1e24e93a" />

**Cloud terminals**

Spin up cloud terminals and intermingle them with local terminals, so you can parallelize your tasks even further.

<img width="1222" height="921" alt="image" src="https://github.com/user-attachments/assets/b096a992-1c33-43e3-8df6-36f51416c1b1" />

**Command palette**

Run global commands at any time (`cmd+shift+p`), including spinning up quick terminal instances (w/an MRU list).

<img width="1630" height="1083" alt="image" src="https://github.com/user-attachments/assets/6deaeb5d-61c1-4c86-92de-517fac83837d" />

## Current feature set

1. Rich terminals
   1. All the features you'd expect 😄
   1. Search the buffer history via `CMD+F`
   1. URL detection + click-to-open embedded webviews
   1. Open the `cwd` in VS Code
1. Multi-tab support
   1. Tabs track + display their `cwd`
   1. Tabs can be explicitly named + re-organized
   1. Navigate tabs with `CMD+<number>`
1. Multi-pane tabs
   1. Split a tab into n-number of panes (`CMD+SHIFT+<direction>`)
   1. Navigate panes with `CMD+<direction>` and move them with `CMD+OPTION+<direction>`
   1. Resize each pane exactly as you want
   1. Enter "focus mode" to view a single pane at a time
1. Workspaces
   1. Save and restore your tab + pane configurations
   1. Your workspace is automatically saved/restored when closing the app
1. Command palette
   1. Spin up "quick terminals", which track your MRU command history
   1. Quickly create and close tabs
   1. Reset your active tab layout (after resizing it)

## Getting started

1. Clone this repo
1. Run `npm install`
1. Run `npm start`
1. ???
1. Profit 🚀

### Cloud terminals

If you want to make use of cloud terminals, you need to also perform the following steps:

1. Generate a [GitHub PAT](https://github.com/settings/personal-access-tokens/new)
1. Edit `.env.local.example` to include the PAT, and rename it to `.env.local`
