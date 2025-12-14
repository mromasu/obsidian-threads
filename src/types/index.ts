/**
 * Centralized type exports for the Threads plugin.
 * 
 * This module re-exports types from various modules to provide
 * a single import point for consumers.
 */

// Graph types
export type { ChainGraph, ChainNodeAttributes, ChainEdgeAttributes, ChainEdge } from '../graph/GraphBuilder';
export type { ChainSegment } from '../graph/BranchDetector';

// Settings types
export type { ThreadsSettings } from '../settings/ThreadsSettings';

// Service types - export the classes themselves since they're used as types too
export type { GraphService } from '../services/GraphService';
export type { NoteCreationService } from '../services/NoteCreationService';
export type { EmptyLineDetector } from '../services/EmptyLineDetector';

// View types
export type { EmbeddableMarkdownEditor } from '../views/embeddededitor';

/**
 * Cleanup function type for chain view rendering.
 * Returns a function that properly disposes all created editors and DOM elements.
 */
export type CleanupFunction = () => void;
