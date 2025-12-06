import { App, TFile, WorkspaceLeaf, MarkdownView } from "obsidian";
import { GraphService } from "./GraphService";

/**
 * Service to create new chained notes.
 * 
 * When the empty line pattern is detected, this service:
 * 1. Creates a new note with a timestamp-based name
 * 2. Sets the new note's `prev` frontmatter to point to the current note
 * 3. Opens the new note in the active editor
 */
export class NoteCreationService {
    constructor(
        private app: App,
        private graphService: GraphService
    ) { }

    /**
     * Create a new note and chain it to the specified source note.
     * 
     * @param currentNotePath - The path of the note that triggered creation (will be the new note's "prev")
     * @returns The newly created file
     */
    async createChainedNote(currentNotePath: string): Promise<TFile | null> {
        const currentFile = this.app.vault.getAbstractFileByPath(currentNotePath);
        if (!(currentFile instanceof TFile)) {
            console.error(`NoteCreationService: Could not find file ${currentNotePath}`);
            return null;
        }

        // Generate a unique filename using timestamp
        const timestamp = Date.now();
        const newFileName = `Untitled-${timestamp}.md`;

        // Use the same folder as the current note
        const folder = currentFile.parent?.path || "";
        const newFilePath = folder ? `${folder}/${newFileName}` : newFileName;

        // Create frontmatter with prev pointing to current note
        const currentNoteName = currentFile.basename;
        const frontmatter = `---\nprev: "[[${currentNoteName}]]"\n---\n\n`;

        console.log(`NoteCreationService: Creating new note ${newFilePath} with prev: ${currentNoteName}`);

        try {
            // Create the new file
            const newFile = await this.app.vault.create(newFilePath, frontmatter);

            // The graph will be updated automatically via the metadataCache.on("changed") event
            // which is already registered in main.ts

            // Open the new note in the active leaf
            const leaf = this.app.workspace.getLeaf(false);
            if (leaf) {
                await leaf.openFile(newFile);
            }

            return newFile;
        } catch (error) {
            console.error(`NoteCreationService: Failed to create note ${newFilePath}:`, error);
            return null;
        }
    }
}
