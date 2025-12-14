import { ChainGraph } from "./GraphBuilder";
import { getNextNotes, getPrevNotes } from "./ChainQueries";

/**
 * Segment types for rendering
 */
export type SegmentType = "note" | "create-button";

/**
 * Represents a chain segment for rendering
 */
export type ChainSegment = {
    type: SegmentType;
    path: string; // For notes: file path. For create-button: path of last note to chain from
};

/**
 * Build the rendering chain from the active note.
 * Traces the linear chain and appends a create-button segment at the end.
 * 
 * @param graph - The chain graph
 * @param activeNotePath - The currently active note
 * @returns Array of chain segments in order (notes + create button)
 */
export const buildRenderingChain = (
    graph: ChainGraph,
    activeNotePath: string
): ChainSegment[] => {
    const chain: ChainSegment[] = [];
    const visited = new Set<string>();

    // Step 1: Walk backward to find the start of the chain
    let current = activeNotePath;
    const backwardChain: string[] = [];

    while (true) {
        const prevNotes = getPrevNotes(graph, current);
        if (prevNotes.length === 0) break;

        const prev = prevNotes[0]; // Take first prev
        if (visited.has(prev)) break;

        backwardChain.unshift(prev);
        visited.add(prev);
        current = prev;
    }

    // Add backward chain to result
    for (const path of backwardChain) {
        chain.push({ type: "note", path });
    }

    // Step 2: Add active note
    chain.push({ type: "note", path: activeNotePath });
    visited.add(activeNotePath);

    // Step 3: Walk forward (take first next note, linear only)
    current = activeNotePath;
    let lastNotePath = activeNotePath;

    while (true) {
        const nextNotes = getNextNotes(graph, current);
        if (nextNotes.length === 0) break;

        // Take the first (oldest by creation time if multiple exist)
        const next = getOldestNote(graph, nextNotes);
        if (!next || visited.has(next)) break;

        chain.push({ type: "note", path: next });
        visited.add(next);
        current = next;
        lastNotePath = next;
    }

    // Step 4: Add create button at the end
    chain.push({ type: "create-button", path: lastNotePath });

    return chain;
};

/**
 * Get the oldest note from a list of paths based on creation time.
 */
const getOldestNote = (graph: ChainGraph, paths: string[]): string | null => {
    if (paths.length === 0) return null;
    if (paths.length === 1) return paths[0];

    const notesWithTime = paths.map(path => {
        const attrs = graph.getNodeAttributes(path);
        return {
            path,
            createdTime: attrs.createdTime || 0
        };
    });

    // Sort by creation time (earliest first)
    notesWithTime.sort((a, b) => a.createdTime - b.createdTime);
    return notesWithTime[0].path;
};
