import { ChainGraph, ChainEdge, ChainEdgeAttributes, ChainNodeAttributes } from "../graph/ChainGraph";
/**
 * Helper to map edges from graphology format to BCEdge-like objects.
 * Graphology uses a callback-based iteration, so we wrap it to return a clean array of objects.
 * 
 * @param graph - The graphology instance
 * @param nodeId - The node to find edges for
 * @param direction - "out" (outgoing edges) or "in" (incoming edges)
 */
const mapEdges = (
    graph: ChainGraph,
    nodeId: string,
    direction: "out" | "in"
): ChainEdge[] => {
    const mapper = direction === "out" ? graph.mapOutEdges.bind(graph) : graph.mapInEdges.bind(graph);

    return mapper(
        nodeId,
        (
            edge_id: string,
            attr: ChainEdgeAttributes,
            source_id: string,
            target_id: string,
            source_attr: ChainNodeAttributes,
            target_attr: ChainNodeAttributes
        ) => ({
            id: edge_id,
            attr,
            source_id,
            target_id,
            source_attr,
            target_attr,
        })
    );
};
/**
 * Chain Detection: Check if current note is part of a chain
 */
export const isInChain = (graph: ChainGraph, notePath: string): boolean => {
    if (!graph.hasNode(notePath)) return false;

    // A note is in a chain if it has an outgoing "prev" edge
    const prevEdges = mapEdges(graph, notePath, "out");
    return prevEdges.length > 0;
};
/**
 * Get the previous note(s) in the chain.
 * Logic: If Current Note has "prev: [[Note A]]", then Note A is a previous note.
 * In the graph, this is represented as an outgoing edge from Current -> Note A.
 */
export const getPrevNotes = (graph: ChainGraph, notePath: string): string[] => {
    if (!graph.hasNode(notePath)) return [];

    const prevEdges = mapEdges(graph, notePath, "out");
    return prevEdges.map((e) => e.target_id);
};

/**
 * Next Note Deduction: Find notes that have current note as their "prev".
 * 
 * This analyzes inlinks (backlinks) to deduce the "next" note.
 * Logic: If Note B has "prev: [[Note A]]", then Note A's "next" is Note B.
 * 
 * In the graph, Note B -> Note A is an outgoing edge for B.
 * So for Note A, we look at INCOMING edges (from B) where the relationship is "prev".
 */
export const getNextNotes = (graph: ChainGraph, notePath: string): string[] => {
    if (!graph.hasNode(notePath)) return [];

    // Get all edges pointing TO the current note
    const inEdges = mapEdges(graph, notePath, "in");

    // Filter for edges with field "prev"
    // These are notes that consider the current note as their "prev"
    const nextNotes = inEdges
        .filter((e) => e.attr.field === "prev")
        .map((e) => e.source_id);

    return nextNotes;
};
/**
 * Get the full chain by following prev links backward
 */
export const getFullChainBackward = (
    graph: ChainGraph,
    startPath: string
): string[] => {
    const chain: string[] = [startPath];
    let current = startPath;
    const visited = new Set<string>([startPath]);

    while (true) {
        const prevNotes = getPrevNotes(graph, current);

        if (prevNotes.length === 0) break; // No more prev notes

        const prev = prevNotes[0]; // Take first if multiple

        if (visited.has(prev)) break; // Avoid cycles

        chain.unshift(prev); // Add to beginning
        visited.add(prev);
        current = prev;
    }

    return chain;
};
/**
 * Get the full chain by following next links forward
 */
export const getFullChainForward = (
    graph: ChainGraph,
    startPath: string
): string[] => {
    const chain: string[] = [startPath];
    let current = startPath;
    const visited = new Set<string>([startPath]);

    while (true) {
        const nextNotes = getNextNotes(graph, current);

        if (nextNotes.length === 0) break; // No more next notes

        const next = nextNotes[0]; // Take first if multiple

        if (visited.has(next)) break; // Avoid cycles

        chain.push(next);
        visited.add(next);
        current = next;
    }

    return chain;
};
/**
 * Get the complete linear chain containing the current note
 */
export const getCompleteChain = (
    graph: ChainGraph,
    notePath: string
): string[] => {
    // First, go backward to find the start
    const backward = getFullChainBackward(graph, notePath);

    // Then, go forward from the current note
    const forward = getFullChainForward(graph, notePath);

    // Combine: backward + forward (excluding duplicate current note)
    return [...backward.slice(0, -1), ...forward];
};
