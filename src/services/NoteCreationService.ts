import { App, TFile, WorkspaceLeaf, MarkdownView } from "obsidian";
import { GraphService } from "./GraphService";

/**
 * Service to create new chained notes.
 * 
 * When the empty line pattern is detected, this service:
 * 1. Creates a new note with a timestamp-based name
 * 2. Sets the new note's `prev` frontmatter to point to the current note
 * 3. Opens the new note in the active editor
 * 4. Updates the graph and triggers chain view re-render
 */
export class NoteCreationService {
    private onNoteCreated: ((file: TFile) => Promise<void>) | null = null;
    private isCreating: boolean = false; // Lock to prevent double triggers
    private targetFolder: string = ""; // Folder path for new notes

    constructor(
        private app: App,
        private graphService: GraphService
    ) { }

    /**
     * Set the target folder for new notes.
     * Empty string means use the same folder as the current note.
     */
    setTargetFolder(folder: string): void {
        this.targetFolder = folder;
    }

    /**
     * Set a callback to be invoked after a note is created and opened.
     * This allows the plugin to re-render the chain view.
     */
    setOnNoteCreated(callback: (file: TFile) => Promise<void>): void {
        this.onNoteCreated = callback;
    }

    /**
     * Create a new note and chain it to the specified source note.
     * 
     * @param currentNotePath - The path of the note that triggered creation (will be the new note's "prev")
     * @returns The newly created file
     */
    async createChainedNote(currentNotePath: string): Promise<TFile | null> {
        // Prevent double triggers
        if (this.isCreating) {
            console.log(`NoteCreationService: Already creating a note, skipping duplicate request`);
            return null;
        }
        this.isCreating = true;

        try {
            const currentFile = this.app.vault.getAbstractFileByPath(currentNotePath);
            if (!(currentFile instanceof TFile)) {
                console.error(`NoteCreationService: Could not find file ${currentNotePath}`);
                return null;
            }

            // Generate a unique filename using timestamp
            const timestamp = Date.now();
            const newFileName = `Untitled-${timestamp}.md`;

            // Determine folder: use configured folder or fall back to current note's folder
            let folder = this.targetFolder;
            if (!folder) {
                // Use the same folder as the current note
                folder = currentFile.parent?.path || "";
                if (folder === "/") {
                    folder = "";
                }
            }
            const newFilePath = folder ? `${folder}/${newFileName}` : newFileName;

            // Ensure the target folder exists
            if (folder) {
                const folderExists = this.app.vault.getAbstractFileByPath(folder);
                if (!folderExists) {
                    console.log(`NoteCreationService: Creating folder ${folder}`);
                    await this.app.vault.createFolder(folder);
                }
            }

            // Create frontmatter with prev pointing to current note
            const currentNoteName = currentFile.basename;
            const frontmatter = `---\nprev: "[[${currentNoteName}]]"\n---\n\n`;

            console.log(`NoteCreationService: Creating new note ${newFilePath} with prev: ${currentNoteName}`);

            // Create the new file
            const newFile = await this.app.vault.create(newFilePath, frontmatter);

            // Add node and edge directly since we know the relationship
            // This bypasses the metadata cache timing issue
            this.graphService.addFileWithEdge(newFile, currentFile.path);

            // Open the new note in the active leaf
            const leaf = this.app.workspace.getLeaf(false);
            if (leaf) {
                await leaf.openFile(newFile);

                // Trigger callback to re-render chain view after the note is opened
                if (this.onNoteCreated) {
                    setTimeout(async () => {
                        await this.onNoteCreated!(newFile);
                    }, 20);
                }
            }

            return newFile;
        } catch (error) {
            console.error(`NoteCreationService: Failed to create note:`, error);
            return null;
        } finally {
            // Release lock after a short delay to prevent rapid re-triggers
            setTimeout(() => {
                this.isCreating = false;
            }, 300);
        }
    }
}
