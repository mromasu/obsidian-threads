import { App, Component, MarkdownView, Notice, TFile } from "obsidian";
import { buildRenderingChain, ChainSegment } from "./graph/BranchDetector";
import { EmbeddableMarkdownEditor } from "./views/embeddededitor";
import { reconstructFileContent } from "./utility/utils";
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
 * Saves editor content back to the file, preserving YAML frontmatter.
 * 
 * @param app - The Obsidian App instance
 * @param path - The file path to save to
 * @param newContent - The new markdown content (without frontmatter)
 * @param originalYaml - The original YAML frontmatter to preserve
 */
async function saveEditorContent(
    app: App,
    path: string,
    newContent: string,
    originalYaml: string
): Promise<void> {
    try {
        // Get the file from vault
        const file = app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            new Notice(`Error: Could not find file ${path}`);
            return;
        }

        // Reconstruct full content with YAML frontmatter
        const fullContent = reconstructFileContent(newContent, originalYaml);

        // Write back to file
        await app.vault.modify(file, fullContent);

        console.log(`Saved changes to ${path}`);
    } catch (error) {
        console.error(`Error saving file ${path}:`, error);
        new Notice(`Failed to save changes to ${path}`);
    }
}

/**
 * Creates a single embedded editor instance and injects it into the DOM.
 * Returns the created editor component for lifecycle management.
 * 
 * @param plugin - The plugin instance (for accessing services)
 * @param container - The HTML element where this editor should be placed
 * @param content - The markdown content to display
 * @param sourcePath - The path of the note being displayed (for navigation)
 * @param originalYaml - The original YAML frontmatter to preserve when saving
 * @returns The created editor component
 */
async function createEmbeddedEditor(
    plugin: ChainPlugin,
    container: HTMLElement,
    content: string,
    sourcePath: string,
    originalYaml: string
): Promise<EmbeddableMarkdownEditor> {
    const app = plugin.app;
    // Track the original content and debounce timer
    let originalContent = content;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isDirty = false;

    // Debounced save function
    const debouncedSave = async (newContent: string) => {
        // Clear any existing timer
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        // Set a new timer to save after 2 seconds of inactivity
        debounceTimer = setTimeout(async () => {
            if (isDirty && newContent !== originalContent) {
                await saveEditorContent(app, sourcePath, newContent, originalYaml);
                originalContent = newContent; // Update the baseline
                isDirty = false;
            }
        }, 2000); // 2 second debounce
    };

    // 2. Create the container for the actual editor
    const editorContainer = container.createDiv({ cls: "chain-embedded-editor" });

    // 3. Instantiate the EmbeddableMarkdownEditor
    // This is our custom wrapper around Obsidian's internal editor
    const editor = new EmbeddableMarkdownEditor(app, editorContainer, {
        value: content,
        onChange: (update) => {
            // Mark as dirty and trigger debounced save
            const currentContent = editor.value;
            if (currentContent !== originalContent) {
                isDirty = true;

                // Check for empty line pattern to create new note
                if (plugin.emptyLineDetector && plugin.emptyLineDetector.detectPattern(currentContent)) {
                    // Remove pattern and save
                    const cleanContent = plugin.emptyLineDetector.removePattern(currentContent);
                    // Use 'any' cast because 'set' is inherited from dynamically resolved parent
                    (editor as any).set(cleanContent);
                    originalContent = cleanContent;
                    isDirty = false;

                    // Clear any pending save timer
                    if (debounceTimer) {
                        clearTimeout(debounceTimer);
                        debounceTimer = null;
                    }

                    // Save immediately and create new note
                    saveEditorContent(app, sourcePath, cleanContent, originalYaml).then(() => {
                        plugin.noteCreationService.createChainedNote(sourcePath);
                    });
                } else {
                    debouncedSave(currentContent);
                }
            }
        },
        onBlur: async (editor) => {
            // On blur, cancel any pending debounced save and save immediately if dirty
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }

            const currentContent = editor.value;
            if (isDirty && currentContent !== originalContent) {
                await saveEditorContent(app, sourcePath, currentContent, originalYaml);
                originalContent = currentContent;
                isDirty = false;
            }
        }
    });

    // Store cleanup function on the editor for later use
    (editor as any)._chainCleanup = () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
    };

    return editor;
}

/**
 * Main function to render the chain view.
 * It finds the previous and next notes, creates embedded editors for them,
 * and injects them into the current MarkdownView's DOM.
 * 
 * @param plugin - The plugin instance
 * @param view - Optional specific view to render into (defaults to active view)
 * @returns A cleanup function to properly dispose of created editors, or undefined if nothing was rendered
 */
export const renderChainView = async (plugin: ChainPlugin, view?: MarkdownView): Promise<(() => void) | undefined> => {
    // Track all created editors for cleanup
    const createdEditors: EmbeddableMarkdownEditor[] = [];
    const createdContainers: HTMLElement[] = [];

    // Get the view to render into
    const activeView = view || plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return undefined;

    // Get the file currently being viewed
    const currentFile = activeView.file;
    if (!currentFile) return undefined;

    const { containerEl } = activeView;
    const mode = activeView.getMode();

    // SAFETY CHECK: Only work in 'source' mode (Edit mode)
    // Preview mode has a completely different DOM structure and rendering pipeline.
    if (mode !== "source") {
        // If we switched to preview mode, clean up our injected elements
        const existing = containerEl.querySelectorAll(".chain-thread-container");
        existing.forEach(el => el.remove());
        return undefined;
    }

    // FIND THE INJECTION POINT
    // The .cm-sizer is the container inside CodeMirror that holds the content.
    // We inject our editors directly into this container.
    const cmSizer = containerEl.querySelector(".cm-sizer");
    if (!cmSizer) return undefined;

    // CLEANUP: Remove any existing injected views to avoid duplicates
    // This runs every time we re-render (e.g. when switching files)
    const existing = cmSizer.querySelectorAll(".chain-thread-container");
    existing.forEach(el => el.remove());

    // BUILD THE RENDERING CHAIN using branching logic
    const chainSegments = buildRenderingChain(plugin.graph, currentFile.path);

    // INJECTION LOGIC:
    // The .cm-sizer has 3 default children:
    // [0] .cm-gutters (line numbers)
    // [1] .cm-layer (selection/cursor layer)
    // [2] .cm-contentContainer (the actual document content)

    const contentContainerIndex = 2; // .cm-contentContainer is at index 2
    let insertionIndex = contentContainerIndex;

    for (let i = 0; i < chainSegments.length; i++) {
        const segment = chainSegments[i];

        // Skip the active note itself (it's already rendered)
        if (segment.path === currentFile.path) {
            insertionIndex++; // Move past the content container
            continue;
        }

        const { content, yaml } = await extractNoteContent(plugin.app, segment.path);

        // Create a container for this note
        const container = document.createElement("div");

        // Determine if this should be rendered BEFORE or AFTER active note
        const isPrevNote = i < chainSegments.findIndex(s => s.path === currentFile.path);

        // Apply CSS classes
        const baseClass = isPrevNote ? "chain-prev" : "chain-next";
        const replyClass = segment.isReply ? "chain-reply" : "";
        container.className = `chain-thread-container ${baseClass} ${replyClass}`.trim();

        // Create the editor inside it
        const editor = await createEmbeddedEditor(plugin, container, content, segment.path, yaml);
        createdEditors.push(editor);
        createdContainers.push(container);

        // Insert the container
        if (isPrevNote) {
            // Insert BEFORE the content container
            if (cmSizer.children.length > insertionIndex) {
                cmSizer.insertBefore(container, cmSizer.children[insertionIndex]);
            } else {
                cmSizer.appendChild(container);
            }
            insertionIndex++; // Adjust for next insertion
        } else {
            // Insert AFTER the content container
            if (cmSizer.children.length > insertionIndex) {
                cmSizer.insertBefore(container, cmSizer.children[insertionIndex]);
            } else {
                cmSizer.appendChild(container);
            }
            insertionIndex++; // Adjust for next insertion
        }
    }

    // Return cleanup function
    return () => {
        // Unload all created editors
        for (const editor of createdEditors) {
            try {
                // Call custom cleanup first
                if ((editor as any)._chainCleanup) {
                    (editor as any)._chainCleanup();
                }
                // Then unload the component
                if ((editor as any)._loaded) {
                    editor.onunload();
                }
            } catch (e) {
                console.error("Error cleaning up editor:", e);
            }
        }

        // Remove all created containers from DOM
        for (const container of createdContainers) {
            container.remove();
        }
    };
};