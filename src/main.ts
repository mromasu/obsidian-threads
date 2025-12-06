import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { EditorView } from '@codemirror/view';
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
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	graphService: GraphService;
	emptyLineDetector: EmptyLineDetector;
	noteCreationService: NoteCreationService;
	private isCreatingNote: boolean = false; // Debounce flag to prevent rapid creation

	// Expose graph for backward compatibility with renderChainView
	get graph(): ChainGraph {
		return this.graphService.graph;
	}

	async onload() {
		await this.loadSettings();

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

			// Register CodeMirror extension for detecting empty lines in native editor
			this.registerEditorExtension(
				EditorView.updateListener.of((update) => {
					if (update.docChanged && !this.isCreatingNote) {
						const content = update.state.doc.toString();
						if (this.emptyLineDetector.detectPattern(content)) {
							this.handleEmptyLineDetection(update.view);
						}
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
			// Debounced to avoid excessive updates during rapid saves
			const debouncedMetadataHandler = debounce((file: TFile) => {
				console.log("Metadata changed (debounced):", file.path);
				this.graphService.updateFile(file);
				this.renderChainView();
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
			// Only re-render, don't rebuild the entire graph
			this.registerEvent(
				this.app.workspace.on("layout-change", async () => {
					console.log("Layout changed");
					// Only re-render, don't rebuild graph (active-leaf-change handles file switches)
					await this.renderChainView();
				})
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
	 * Handle detection of four empty lines in the native editor.
	 * Cleans up the extra lines and creates a new chained note.
	 */
	private async handleEmptyLineDetection(view: EditorView): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		// Set flag to prevent re-triggering during content update
		this.isCreatingNote = true;

		try {
			// Remove pattern from editor
			const content = view.state.doc.toString();
			const cleanContent = this.emptyLineDetector.removePattern(content);
			view.dispatch({
				changes: { from: 0, to: content.length, insert: cleanContent }
			});

			console.log("Empty line pattern detected, creating new note...");

			// Create new chained note
			await this.noteCreationService.createChainedNote(activeFile.path);
		} finally {
			// Reset flag after a short delay to allow the new note to open
			setTimeout(() => {
				this.isCreatingNote = false;
			}, 500);
		}
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
