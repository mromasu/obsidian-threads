# Obsidian Threads Plugin

Transform your Obsidian experience into a **Twitter/X-like threaded note-taking system**. Chain your notes together naturally and view them as a continuous conversation flow.

![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-purple)

## What is Threads?

Threads turns traditional file-based note-taking into a fluid, thread-based experience. Instead of isolated notes, create connected chains of thoughts that flow naturally from one to the next—just like posting a thread on Twitter/X.

### Key Features

- **🧵 Threaded Notes**: Chain notes together using a simple `prev` frontmatter field
- **📜 Chain View**: See your entire thread rendered as a continuous scroll in a single view
- **⌨️ Quick Creation**: Press Enter 4 times at the end of a note to instantly create a new chained note
- **🔗 Auto Linking**: New notes automatically link to their parent with `prev: [[ParentNote]]`
- **🌿 Branch Detection**: Handles reply branches when multiple notes link to the same parent
- **🔄 Chain Healing**: Deleting a note in the middle automatically reconnects the chain
- **✏️ Embedded Editing**: Edit any note in the chain directly from the chain view

## How It Works

### Thread Structure

Notes are connected through frontmatter:

```yaml
---
prev: "[[Previous Note]]"
---

Your content here...
```

When you open a note, the plugin displays:
1. **Previous notes** in the chain (scrolling up)
2. **The current note** (your active file)
3. **Next notes** (notes that have this note as their `prev`)

### Creating New Threads

**Method 1: Quick Create**
1. Write in any note
2. Press `Enter` 4 times at the end
3. A new chained note is automatically created and opened

**Method 2: Manual**
1. Create a new note
2. Add `prev: "[[YourPreviousNote]]"` to the frontmatter

### Branch Handling

When multiple notes point to the same parent:
- The **oldest note** (by creation time) is treated as the main thread
- Other notes appear as **reply branches** below

## Installation

### From Source

1. Clone this repository into your vault's `.obsidian/plugins/` folder:
   ```bash
   cd /path/to/vault/.obsidian/plugins/
   git clone <repo-url> threads
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Enable the plugin in Obsidian Settings → Community Plugins

### Development

```bash
# Install dependencies
npm install

# Start development mode (auto-rebuild on changes)
npm run dev

# Production build
npm run build
```

## License

MIT
