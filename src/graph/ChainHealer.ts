import { App, TFile } from "obsidian";
import { ChainGraph } from "./GraphBuilder";
import { updateFrontmatter } from "../utility/utils";

/**
 * Handles chain healing operations when notes are deleted.
 * 
 * When a note in a chain is deleted, we need to reconnect the
 * previous and next notes to maintain chain continuity.
 * 
 * Example:
 *   Before: A -> B -> C
 *   Delete B
 *   After:  A -> C
 */
export class ChainHealer {
    constructor(
        private graph: ChainGraph,
        private app: App
    ) { }

    /**
     * Heal the chain after a node is deleted.
     * 
     * This method:
     * 1. Finds all nodes that link TO the deleted node (prev references)
     * 2. Finds all nodes that the deleted node links TO
     * 3. Updates the source nodes to point to the targets, bypassing the deleted node
     * 
     * @param deletedPath - The path of the deleted file
     */
    async healAfterDelete(deletedPath: string): Promise<void> {
        if (!this.graph.hasNode(deletedPath)) {
            console.log(`ChainHealer: Node ${deletedPath} not found in graph`);
            return;
        }

        // Get nodes that point TO this node (these are "next" notes in the chain)
        // They have this node as their "prev"
        const inEdges = this.graph.mapInEdges(
            deletedPath,
            (edge, attr, source, target) => source
        );

        // Get nodes that this node points TO (these are "prev" notes)
        const outEdges = this.graph.mapOutEdges(
            deletedPath,
            (edge, attr, source, target) => target
        );

        console.log(`ChainHealer: Healing chain for ${deletedPath}`);
        console.log(`  - Nodes pointing to deleted: ${inEdges.length}`);
        console.log(`  - Deleted pointed to: ${outEdges.length}`);

        // For each node that has this as prev, update to point to this node's prev
        for (const sourcePath of inEdges) {
            await this.updateNodePrevLinks(sourcePath, deletedPath, outEdges);
        }
    }

    /**
     * Update a node's prev links, replacing a deleted target with new targets.
     * 
     * @param nodePath - The node whose prev links need updating
     * @param deletedPath - The path that was deleted (to remove from prev)
     * @param newTargets - The new paths to add to prev (the deleted node's prev links)
     */
    private async updateNodePrevLinks(
        nodePath: string,
        deletedPath: string,
        newTargets: string[]
    ): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(nodePath);
        if (!(file instanceof TFile)) {
            console.log(`ChainHealer: Cannot find file ${nodePath}`);
            return;
        }

        // Get current outgoing edges (prev links) for this node
        const currentPrevLinks = this.graph.mapOutEdges(
            nodePath,
            (edge, attr, source, target) => target
        );

        // Remove the deleted path and add the new targets
        const updatedLinks = currentPrevLinks
            .filter(path => path !== deletedPath)
            .concat(newTargets);

        // Remove duplicates
        const uniqueLinks = [...new Set(updatedLinks)];

        // Convert paths to basenames for frontmatter
        const linkNames = uniqueLinks.map(path => {
            const f = this.app.vault.getAbstractFileByPath(path);
            if (f instanceof TFile) {
                return f.basename;
            }
            // Fallback: extract basename from path
            return path.replace(/\.md$/, '').split('/').pop() || path;
        });

        console.log(`ChainHealer: Updating ${nodePath} prev links to: [${linkNames.join(', ')}]`);

        await updateFrontmatter(this.app, file, linkNames);
    }
}
