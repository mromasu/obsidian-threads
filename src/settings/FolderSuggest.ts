import { AbstractInputSuggest, App, TFolder } from "obsidian";

/**
 * Folder suggestion component for settings UI.
 * 
 * Extends AbstractInputSuggest to provide autocomplete for folder paths
 * in the vault. Used in the settings tab for selecting the target folder
 * for new note creation.
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
    private folders: TFolder[] = [];

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.refreshFolders();
    }

    /**
     * Refresh the list of folders from the vault.
     */
    private refreshFolders(): void {
        this.folders = [];
        const files = this.app.vault.getAllLoadedFiles();
        for (const file of files) {
            if (file instanceof TFolder) {
                this.folders.push(file);
            }
        }
    }

    /**
     * Get suggestions matching the input query.
     * Filters folders by path, case-insensitive.
     */
    getSuggestions(query: string): TFolder[] {
        const lowerQuery = query.toLowerCase();
        return this.folders.filter(folder =>
            folder.path.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Render a single suggestion in the dropdown.
     */
    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        el.setText(folder.path || "/");
    }

    /**
     * Handle selection of a suggestion.
     * Updates the input element with the selected folder path.
     */
    selectSuggestion(folder: TFolder): void {
        // Use inherited textInputEl from AbstractInputSuggest
        const inputEl = this.textInputEl as HTMLInputElement;
        inputEl.value = folder.path;
        inputEl.trigger("input");
        this.close();
    }
}

