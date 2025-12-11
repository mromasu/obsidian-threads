import { App, PluginSettingTab, Setting } from 'obsidian';
import { FolderSuggest } from './FolderSuggest';
import type ThreadsPlugin from '../main';

/**
 * Settings tab UI for the Threads plugin.
 * Displays in Settings → Community plugins → Threads
 */
export class ThreadsSettingTab extends PluginSettingTab {
    plugin: ThreadsPlugin;

    constructor(app: App, plugin: ThreadsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        // Folder setting for new notes
        new Setting(containerEl)
            .setName('New notes folder')
            .setDesc('Where to create new notes when triggered by empty lines. Leave empty to use the same folder as the current note.')
            .addText(text => {
                text.setPlaceholder('e.g., daily-notes')
                    .setValue(this.plugin.settings.newNotesFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.newNotesFolder = value;
                        this.plugin.noteCreationService.setTargetFolder(value);
                        await this.plugin.saveSettings();
                    });
                // Attach folder suggestion
                new FolderSuggest(this.app, text.inputEl);
            });
    }
}
