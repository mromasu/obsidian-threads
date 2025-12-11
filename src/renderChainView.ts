import { App, Component, MarkdownView, Notice, TFile } from "obsidian";
import { buildRenderingChain, ChainSegment } from "./graph/BranchDetector";
import { EmbeddableMarkdownEditor } from "./views/embeddededitor";
import { extractNoteContent } from "./view/ContentExtractor";
import { createEmbeddedEditor, cleanupEditor } from "./view/EditorFactory";
import type ChainPlugin from "./main";

/** SVG icon for the note navigation button */
const NOTE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`;

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

    // Save scroll position before DOM manipulation to prevent scroll jump
    const cmScroller = containerEl.querySelector(".cm-scroller") as HTMLElement | null;
    const savedScrollTop = cmScroller?.scrollTop ?? 0;

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

        // Add clickable file icon (transparent, positioned outside left)
        const noteIcon = document.createElement("div");
        noteIcon.className = "chain-note-icon";
        noteIcon.innerHTML = NOTE_ICON_SVG;
        noteIcon.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            plugin.app.workspace.openLinkText(segment.path, "", false);
        });
        container.appendChild(noteIcon);

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

    // Restore scroll position after DOM manipulation
    if (cmScroller) {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
            cmScroller.scrollTop = savedScrollTop;
        });
    }

    // Return cleanup function
    return () => {
        // Unload all created editors
        for (const editor of createdEditors) {
            cleanupEditor(editor);
        }

        // Remove all created containers from DOM
        for (const container of createdContainers) {
            container.remove();
        }
    };
};