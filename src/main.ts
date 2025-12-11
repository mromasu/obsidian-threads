import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';
import { FolderSuggest } from './settings/FolderSuggest';
import { ChainGraph } from './graph/GraphBuilder';
import { buildChainGraph, updateNodeEdges } from './graph/ChainQueries';
import { renderChainView } from './renderChainView';
import { debounce } from './utility/debounce';
import { GraphService } from './services/GraphService';
import { EmptyLineDetector } from './services/EmptyLineDetector';
import { NoteCreationService } from './services/NoteCreationService';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
	newNotesFolder: string;  // Folder path for new notes, empty = same as current note
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	newNotesFolder: ''  // Empty means use same folder as current note
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	graphService: GraphService;
	emptyLineDetector: EmptyLineDetector;
	noteCreationService: NoteCreationService;
	private isCreatingNote: boolean = false; // Debounce flag to prevent rapid creation
	private prevFrontmatterCache: Map<string, string | undefined> = new Map(); // Cache prev values to detect changes

	// Expose graph for backward compatibility with renderChainView
	get graph(): ChainGraph {
		return this.graphService.graph;
	}

	async onload() {
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new SampleSettingTab(this.app, this));

		console.log("Loading chain plugin");

		//============================================
		// Initialize chain graph
		//============================================
		// We wait for the workspace to be fully ready before building our graph.
		// This ensures all files are indexed and the cache is populated.
		this.app.workspace.onLayoutReady(() => {

			// Initialize the graph service
			this.graphService = new GraphService(this.app);
			this.graphService.initialize();

			// Initialize empty line detection services
			this.emptyLineDetector = new EmptyLineDetector();
			this.noteCreationService = new NoteCreationService(this.app, this.graphService);
			this.noteCreationService.setTargetFolder(this.settings.newNotesFolder);

			// Set callback to re-render chain view after new note is created
			this.noteCreationService.setOnNoteCreated(async (file) => {
				await this.renderChainView();
			});

			// Listen to editor changes for detecting empty line pattern
			// This fires for the native editor - gives us direct access to the file
			this.registerEvent(
				this.app.workspace.on("editor-change", (editor, view) => {
					if (view instanceof MarkdownView && !this.isCreatingNote) {
						this.handleEditorChange(editor, view);
					}
				})
			);

			const leaves = this.app.workspace.getLeavesOfType("markdown");
			console.log(`Rendering chain view for ${leaves.length} markdown leaves`);


			// Initial render: Inject the view into all currently open markdown leaves
			leaves.forEach(async leaf => {
				const view = leaf.view;
				if (view instanceof MarkdownView) {
					await renderChainView(this, view);
				}
			});

			//============================================
			// Register events
			//============================================

			// Handle file renames
			this.registerEvent(
				this.app.vault.on("rename", (file, oldPath) => {
					this.graphService.handleRename(oldPath, file.path);
					this.renderChainView();
				})
			);

			// Handle file deletions - GraphService handles chain healing
			this.registerEvent(
				this.app.vault.on("delete", async (file) => {
					if (file instanceof TFile && file.extension === "md") {
						await this.graphService.handleDelete(file);
						this.renderChainView();
					}
				})
			);

			// Handle file creation and modification via cache updates
			// Only re-render when the "prev" frontmatter field changes
			const debouncedMetadataHandler = debounce((file: TFile) => {
				const cache = this.app.metadataCache.getFileCache(file);
				const newPrev = JSON.stringify(cache?.frontmatter?.prev);
				const oldPrev = this.prevFrontmatterCache.get(file.path);

				// Only update if prev changed (or file is new)
				if (newPrev !== oldPrev) {
					console.log(`Frontmatter prev changed in ${file.path}:`, oldPrev, "->", newPrev);
					this.prevFrontmatterCache.set(file.path, newPrev);
					this.graphService.updateFile(file);
					this.renderChainView();
				}
			}, 300);

			this.registerEvent(
				this.app.metadataCache.on("changed", debouncedMetadataHandler)
			);

			// Handle active leaf changes (tab switches, file opens)
			// This is more reliable than layout-change for updating the chain view
			this.registerEvent(
				this.app.workspace.on("active-leaf-change", async (leaf) => {
					if (!leaf) return;
					const view = leaf.view;
					if (view instanceof MarkdownView) {
						console.log("Active leaf changed:", view.file?.path);
						await renderChainView(this, view);
					}
				})
			);

			// Handle layout changes (e.g. pane resizing, splits)
			// Debounced to prevent scroll issues during editing
			const debouncedLayoutChange = debounce(async () => {
				console.log("Layout changed (debounced)");
				await this.renderChainView();
			}, 500);

			this.registerEvent(
				this.app.workspace.on("layout-change", debouncedLayoutChange)
			);



			// Get all markdown leaves and render chain view for each

		});
		//============================================
	}

	/**
	 * Rebuilds the entire graph from scratch and re-renders the view.
	 * This is an expensive operation, so use it sparingly.
	 */
	async rebuildGraph() {
		this.graphService.rebuild();
		await this.renderChainView();
	}

	/**
	 * Renders the chain view into the active markdown leaf.
	 */
	async renderChainView() {
		await renderChainView(this);
	}

	/**
	 * Handle editor changes to detect the empty line pattern.
	 * Uses editor-change event which gives direct access to the file being edited.
	 */
	private handleEditorChange(editor: Editor, view: MarkdownView): void {
		const content = editor.getValue();

		// Check for the pattern
		if (!this.emptyLineDetector.detectPattern(content)) {
			return;
		}

		// Get the file being edited - this is the actual file, not the active file
		const file = view.file;
		if (!file) return;

		// Prevent double triggers
		this.isCreatingNote = true;

		// Remove the extra newlines immediately
		const cleanContent = this.emptyLineDetector.removePattern(content);
		editor.setValue(cleanContent);

		// Create new note chained to this file
		console.log(`Empty line pattern detected in ${file.path}, creating new note...`);
		this.noteCreationService.createChainedNote(file.path).finally(() => {
			// Reset flag after creation completes
			setTimeout(() => {
				this.isCreatingNote = false;
			}, 300);
		});
	}
	//============================================

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

export type ChainPlugin = MyPlugin;

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
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

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
