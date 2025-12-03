import { App, Component, MarkdownView, TFile } from "obsidian";
import { getPrevNotes, getNextNotes } from "./graph/ChainDetector";
import { EmbeddableMarkdownEditor } from "./views/embeddededitor";
import type ChainPlugin from "./main";

/**
 * Helper function to read a note's content and strip away the YAML frontmatter.
 * We want to display ONLY the markdown content in the embedded editor, not the metadata.
 * 
 * @param app - The Obsidian App instance
 * @param path - The file path of the note to read
 * @returns The clean markdown content without frontmatter
 */
async function extractNoteContent(app: App, path: string): Promise<{ content: string; yaml: string }> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
        return { content: "", yaml: "" };
    }

    // Read the file from cache for performance
    const rawContent = await app.vault.cachedRead(file);

    // Regex to match YAML frontmatter (content between --- and --- at the start of file)
    const yamlRegex = /^---\n([\s\S]*?)\n---/;
    const match = rawContent.match(yamlRegex);
    const yaml = match ? match[1] : "";

    // Replace frontmatter with empty string and trim whitespace
    const sanitized = rawContent.replace(yamlRegex, "").trim();

    return { content: sanitized, yaml };
}

/**
 * Creates a single embedded editor instance and injects it into the DOM.
 * 
 * @param app - The Obsidian App instance
 * @param parent - The parent Component (usually the Plugin) to manage lifecycle
 * @param container - The HTML element where this editor should be placed
 * @param content - The markdown content to display
 * @param sourcePath - The path of the note being displayed (for navigation)
 */
async function createEmbeddedEditor(
    app: App,
    parent: Component,
    container: HTMLElement,
    content: string,
    sourcePath: string
): Promise<void> {

    // 2. Create the container for the actual editor
    const editorContainer = container.createDiv({ cls: "chain-embedded-editor" });

    // 3. Instantiate the EmbeddableMarkdownEditor
    // This is our custom wrapper around Obsidian's internal editor
    const editor = new EmbeddableMarkdownEditor(app, editorContainer, {
        value: content,
        onBlur: (editor) => {
            // Callback when editor loses focus.
            // Currently we don't save changes back to disk automatically.
            // To implement saving, we would need to:
            // 1. Read the original file again
            // 2. Replace the body content while preserving frontmatter
            // 3. Write back to file
        }
    });

    // 4. Register the editor as a child component
    // This ensures that when the plugin is unloaded or view is cleared,
    // the editor is properly destroyed to prevent memory leaks.
    parent.addChild(editor as any);
}

/**
 * Main function to render the chain view.
 * It finds the previous and next notes, creates embedded editors for them,
 * and injects them into the current MarkdownView's DOM.
 * 
 * @param plugin - The plugin instance
 * @param view - Optional specific view to render into (defaults to active view)
 */
export const renderChainView = async (plugin: ChainPlugin, view?: MarkdownView) => {
    // Get the view to render into
    const activeView = view || plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return;

    // Get the file currently being viewed
    const currentFile = activeView.file;
    if (!currentFile) return;

    const { containerEl } = activeView;
    const mode = activeView.getMode();

    // SAFETY CHECK: Only work in 'source' mode (Edit mode)
    // Preview mode has a completely different DOM structure and rendering pipeline.
    if (mode !== "source") {
        // If we switched to preview mode, clean up our injected elements
        const existing = containerEl.querySelectorAll(".chain-thread-container");
        existing.forEach(el => el.remove());
        return;
    }

    // FIND THE INJECTION POINT
    // The .cm-sizer is the container inside CodeMirror that holds the content.
    // We inject our editors directly into this container.
    const cmSizer = containerEl.querySelector(".cm-sizer");
    if (!cmSizer) return;

    // CLEANUP: Remove any existing injected views to avoid duplicates
    // This runs every time we re-render (e.g. when switching files)
    const existing = cmSizer.querySelectorAll(".chain-thread-container");
    existing.forEach(el => el.remove());

    // DATA FETCHING: Get the list of previous and next notes from our graph
    const prevNotes = getPrevNotes(plugin.graph, currentFile.path);
    const nextNotes = getNextNotes(plugin.graph, currentFile.path);

    // INJECTION LOGIC:
    // The .cm-sizer has 3 default children:
    // [0] .cm-gutters (line numbers)
    // [1] .cm-layer (selection/cursor layer)
    // [2] .cm-contentContainer (the actual document content)

    // We want to insert PREVIOUS notes BEFORE the content (index 2).
    // We want to insert NEXT notes AFTER the content.

    // --- INJECT PREVIOUS NOTES ---
    for (let i = 0; i < prevNotes.length; i++) {
        const path = prevNotes[i];
        const { content, yaml } = await extractNoteContent(plugin.app, path);

        // Create a container for this note
        const container = document.createElement("div");
        container.className = "chain-thread-container chain-prev";

        // Create the editor inside it
        await createEmbeddedEditor(plugin.app, plugin, container, content, path);

        // Insert at index 2 + i
        // i=0 -> insert at 2 (pushes content to 3)
        // i=1 -> insert at 3 (pushes content to 4)
        const targetIndex = 2 + i;
        if (cmSizer.children.length > targetIndex) {
            cmSizer.insertBefore(container, cmSizer.children[targetIndex]);
        } else {
            cmSizer.appendChild(container);
        }
    }

    // --- INJECT NEXT NOTES ---
    // Calculate where the content is now.
    // Original index 2 + number of previous notes inserted.
    const baseIndex = 2 + prevNotes.length;

    // Start inserting next notes AFTER the content
    let currentIndex = baseIndex + 1;

    for (let i = 0; i < nextNotes.length; i++) {
        const path = nextNotes[i];
        const { content, yaml } = await extractNoteContent(plugin.app, path);

        const container = document.createElement("div");
        container.className = "chain-thread-container chain-next";

        await createEmbeddedEditor(plugin.app, plugin, container, content, path);

        // Insert at the calculated index
        if (cmSizer.children.length > currentIndex) {
            cmSizer.insertBefore(container, cmSizer.children[currentIndex]);
        } else {
            cmSizer.appendChild(container);
        }
        currentIndex++;
    }
};