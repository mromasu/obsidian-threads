import { App, Platform } from "obsidian";
import { EmbeddableMarkdownEditor } from "../views/embeddededitor";
import { saveEditorContent } from "./ContentExtractor";
import type ChainPlugin from "../main";

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
export async function createEmbeddedEditor(
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

    // Create the container for the actual editor
    const editorContainer = container.createDiv({ cls: "chain-embedded-editor" });

    // Instantiate the EmbeddableMarkdownEditor
    // This is our custom wrapper around Obsidian's internal editor
    const editor = new EmbeddableMarkdownEditor(app, editorContainer, {
        value: content,
        onChange: (update) => {
            // Mark as dirty and trigger debounced save
            const currentContent = editor.value;
            if (currentContent !== originalContent) {
                isDirty = true;

                // Check for empty line pattern on desktop only
                if (!Platform.isMobile && plugin.emptyLineDetector && plugin.emptyLineDetector.detectPattern(currentContent)) {
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
 * Cleans up an embedded editor instance.
 * 
 * @param editor - The editor to cleanup
 */
export function cleanupEditor(editor: EmbeddableMarkdownEditor): void {
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
