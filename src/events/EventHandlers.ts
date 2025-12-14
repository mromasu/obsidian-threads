import { Editor, MarkdownView, Platform, TFile } from 'obsidian';
import { debounce } from '../utility/debounce';
import { renderChainView } from '../renderChainView';
import type ThreadsPlugin from '../main';

/**
 * Registers all plugin events for vault and workspace changes.
 * 
 * This centralizes event handling logic, keeping main.ts focused on
 * plugin lifecycle (onload, onunload).
 * 
 * @param plugin - The plugin instance
 */
export function registerEvents(plugin: ThreadsPlugin): void {
    // Register empty-line detection only on desktop
    if (!Platform.isMobile) {
        registerEditorChangeEvent(plugin);
    }
    registerVaultEvents(plugin);
    registerMetadataCacheEvents(plugin);
    registerWorkspaceEvents(plugin);
}

/**
 * Listen to editor changes for detecting empty line pattern (desktop only).
 * This fires for the native editor - gives us direct access to the file.
 */
function registerEditorChangeEvent(plugin: ThreadsPlugin): void {
    plugin.registerEvent(
        plugin.app.workspace.on("editor-change", (editor: Editor, view) => {
            if (view instanceof MarkdownView && !plugin.isCreatingNote) {
                handleEditorChange(plugin, editor, view);
            }
        })
    );
}

/**
 * Handle editor changes to detect the empty line pattern.
 * Uses editor-change event which gives direct access to the file being edited.
 */
function handleEditorChange(plugin: ThreadsPlugin, editor: Editor, view: MarkdownView): void {
    const content = editor.getValue();

    // Check for the pattern
    if (!plugin.emptyLineDetector.detectPattern(content)) {
        return;
    }

    // Get the file being edited - this is the actual file, not the active file
    const file = view.file;
    if (!file) return;

    // Prevent double triggers
    plugin.isCreatingNote = true;

    // Remove the extra newlines immediately
    const cleanContent = plugin.emptyLineDetector.removePattern(content);
    editor.setValue(cleanContent);

    // Create new note chained to this file
    console.log(`Empty line pattern detected in ${file.path}, creating new note...`);
    plugin.noteCreationService.createChainedNote(file.path).finally(() => {
        // Reset flag after creation completes
        setTimeout(() => {
            plugin.isCreatingNote = false;
        }, 300);
    });
}

/**
 * Register vault events: file renaming and deletion.
 */
function registerVaultEvents(plugin: ThreadsPlugin): void {
    // Handle file renames
    plugin.registerEvent(
        plugin.app.vault.on("rename", (file, oldPath) => {
            plugin.graphService.handleRename(oldPath, file.path);
            plugin.renderChainView();
        })
    );

    // Handle file deletions - GraphService handles chain healing
    plugin.registerEvent(
        plugin.app.vault.on("delete", async (file) => {
            if (file instanceof TFile && file.extension === "md") {
                await plugin.graphService.handleDelete(file);
                plugin.renderChainView();
            }
        })
    );
}

/**
 * Register metadata cache events: frontmatter changes.
 * Only re-render when the "prev" frontmatter field changes.
 */
function registerMetadataCacheEvents(plugin: ThreadsPlugin): void {
    const debouncedMetadataHandler = debounce((file: TFile) => {
        const cache = plugin.app.metadataCache.getFileCache(file);
        const newPrev = JSON.stringify(cache?.frontmatter?.prev);
        const oldPrev = plugin.prevFrontmatterCache.get(file.path);

        // Only update if prev changed (or file is new)
        if (newPrev !== oldPrev) {
            console.log(`Frontmatter prev changed in ${file.path}:`, oldPrev, "->", newPrev);
            plugin.prevFrontmatterCache.set(file.path, newPrev);
            plugin.graphService.updateFile(file);
            plugin.renderChainView();
        }
    }, 300);

    plugin.registerEvent(
        plugin.app.metadataCache.on("changed", debouncedMetadataHandler)
    );
}

/**
 * Register workspace events: leaf changes and layout changes.
 */
function registerWorkspaceEvents(plugin: ThreadsPlugin): void {
    // Handle active leaf changes (tab switches, file opens)
    plugin.registerEvent(
        plugin.app.workspace.on("active-leaf-change", async (leaf) => {
            if (!leaf) return;
            const view = leaf.view;
            if (view instanceof MarkdownView) {
                console.log("Active leaf changed:", view.file?.path);
                await renderChainView(plugin, view);
            }
        })
    );

    // Handle layout changes (e.g. pane resizing, splits)
    // Debounced to prevent scroll issues during editing
    const debouncedLayoutChange = debounce(async () => {
        console.log("Layout changed (debounced)");
        await plugin.renderChainView();
    }, 500);

    plugin.registerEvent(
        plugin.app.workspace.on("layout-change", debouncedLayoutChange)
    );
}
