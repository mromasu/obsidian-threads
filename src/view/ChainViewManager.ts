import { Component, MarkdownView } from "obsidian";
import type ChainPlugin from "../main";
import { renderChainView } from "../renderChainView";

/**
 * Manages chain view renderers for each MarkdownView.
 * 
 * This class ensures that:
 * 1. Each MarkdownView has at most one active chain renderer
 * 2. Renderers are properly cleaned up when views are closed
 * 3. No duplicate renders occur for the same view
 */
export class ChainViewManager extends Component {
    private plugin: ChainPlugin;

    // Track active renderers by view - WeakMap allows GC when view is destroyed
    private renderers: WeakMap<MarkdownView, CleanupFunction> = new WeakMap();

    // Track views we've already hooked into for cleanup
    private hookedViews: WeakSet<MarkdownView> = new WeakSet();

    constructor(plugin: ChainPlugin) {
        super();
        this.plugin = plugin;
    }

    /**
     * Render the chain view for a specific MarkdownView.
     * Handles cleanup of previous render and lifecycle binding.
     */
    async renderForView(view: MarkdownView): Promise<void> {
        // Clean up any existing render for this view
        this.cleanupView(view);

        // Render and store cleanup function
        const cleanup = await renderChainView(this.plugin, view);
        if (cleanup) {
            this.renderers.set(view, cleanup);
        }

        // Hook into view lifecycle for cleanup (only once per view)
        this.hookViewLifecycle(view);
    }

    /**
     * Render chain view for all currently open markdown views.
     */
    async renderAllViews(): Promise<void> {
        const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");

        for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof MarkdownView) {
                await this.renderForView(view);
            }
        }
    }

    /**
     * Clean up the renderer for a specific view.
     */
    cleanupView(view: MarkdownView): void {
        const cleanup = this.renderers.get(view);
        if (cleanup) {
            try {
                cleanup();
            } catch (e) {
                console.error("Error during chain view cleanup:", e);
            }
            this.renderers.delete(view);
        }
    }

    /**
     * Hook into the view's lifecycle to clean up when the view is closed.
     * This prevents memory leaks from orphaned editors.
     */
    private hookViewLifecycle(view: MarkdownView): void {
        if (this.hookedViews.has(view)) {
            return; // Already hooked
        }

        this.hookedViews.add(view);

        // Wrap the view's onunload to clean up our renderer
        const originalUnload = view.onunload?.bind(view);
        view.onunload = () => {
            console.log("View unloading, cleaning up chain renderer:", view.file?.path);
            this.cleanupView(view);

            // Call original unload
            if (originalUnload) {
                originalUnload();
            }
        };
    }

    /**
     * Clean up all renderers when the manager is unloaded.
     */
    onunload(): void {
        // WeakMap doesn't have iteration, so we can't clean all
        // But since we're unloading, the plugin is being disabled
        // and everything will be garbage collected anyway
        console.log("ChainViewManager unloading");
    }
}

/**
 * Type for cleanup functions returned by renderChainView
 */
type CleanupFunction = () => void;
