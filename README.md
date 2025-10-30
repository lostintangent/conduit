# 🤔 Fundamental assumptions

This project is built on the premise of a few fundamental assumptions:

1. Developers will _continue to make use of multiple different coding agents_, because no single agent will (ever?) serve all their needs. Therefore, it's critcal to have toolchains that allow a **"learn once, use any agent"** experience.

1. Coding agents will _continue to \_evolve at a rapid face_, and putting too many abstractions on top of them will creation friction in the availability of innovation. Therefore, developers want to be as **"close to the metal"** as possible with their agents.

1. Coding agents will _continue to get more powerful over time_, and therefore, a CLI interface, along with supporting tools, will be sufficient for most users. Therefore, toolchains should embrace **terminals as being central vs. secondary**.

1. Developers love hackable environments, but with smart defaults. That way they can get started quickly, but without compromising on their flow. Therefore, agentic surfaces must embrace **compsability and personalization at its core**.

There are many ways to slice these assumptions, and Conduit is just one of many possible takes. So without further ado, the following series of screenshot illustrate the shape it current takes...

# 🔌 Conduit

Create information-dense tabs, each with a flexible grid of terminal, editor, and web panes (that can be arbitrarily resized, and organized)

<img width="1630" height="1083" alt="image" src="https://github.com/user-attachments/assets/ff0be63c-7426-43d8-a3da-b8cc717543ae" />

**Design mode**

Organize your tabs by creating or removing panes, drag & dropping panes, splitting panes into new tabs, moving panes between tabs, etc.

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

**Customizable keybindings**

Configure the keybindings that are used for common actions, so you can maximize your flow state exactly as you want it.

<img width="1206" height="922" alt="image" src="https://github.com/user-attachments/assets/ca587508-0457-4c38-92b9-6113f4c6de30" />

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

Additionally, if you want to make use of cloud terminals, you need to also perform the following steps:

1. Generate a [GitHub PAT](https://github.com/settings/personal-access-tokens/new)
1. Copy the `.env.local.example` file, rename it to `.env.local`, and then paste your PAT into it
