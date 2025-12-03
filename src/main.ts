import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { ChainGraph } from './graph/ChainGraph';
import { buildChainGraph, updateNodeEdges } from './graph/ChainBuilder';
import { renderChainView } from './renderChainView';
import { updateFrontmatter } from './utility/utils';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	graph: ChainGraph;

	async onload() {
		await this.loadSettings();

		console.log("Loading chain plugin");

		//============================================
		// Initialize chain graph
		//============================================
		// We wait for the workspace to be fully ready before building our graph.
		// This ensures all files are indexed and the cache is populated.
		this.app.workspace.onLayoutReady(() => {

			const leaves = this.app.workspace.getLeavesOfType("markdown");
			// Build the initial graph from all files in the vault
			this.rebuildGraph();

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
					console.log(`File renamed: ${oldPath} -> ${file.path}`);
					this.graph.safe_rename_node(oldPath, file.path);
					this.renderChainView();
				})
			);

			// Handle file deletions
			this.registerEvent(
				this.app.vault.on("delete", async (file) => {
					console.log("File deleted:", file.path);
					if (file instanceof TFile && file.extension === "md") {
						const deletedPath = file.path;

						// 1. Heal broken chains
						if (this.graph.hasNode(deletedPath)) {
							const inEdges = this.graph.mapInEdges(deletedPath, (edge, attr, source, target) => source);
							const outEdges = this.graph.mapOutEdges(deletedPath, (edge, attr, source, target) => target);

							for (const sourcePath of inEdges) {
								const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
								if (sourceFile instanceof TFile) {
									const sourceOutEdges = this.graph.mapOutEdges(sourcePath, (edge, attr, source, target) => target);
									const updatedTargets = sourceOutEdges
										.filter(t => t !== deletedPath)
										.concat(outEdges);

									const linksText = updatedTargets.map(path => {
										const f = this.app.vault.getAbstractFileByPath(path);
										return f instanceof TFile ? f.basename : path.replace(/\.md$/, '').split('/').pop() || path;
									});

									await updateFrontmatter(this.app, sourceFile, linksText);
								}
							}
						}

						this.graph.handle_delete(file.path);
						this.renderChainView();
					}
				})
			);

			// Handle file creation and modification via cache updates
			// This ensures we have the latest frontmatter
			this.registerEvent(
				this.app.metadataCache.on("changed", (file) => {
					console.log("Metadata changed:", file.path);
					updateNodeEdges(this.graph, file, this.app);
					this.renderChainView();
				})
			);

			// Handle layout changes (e.g. opening a new file, switching tabs)
			// We need to re-inject our view whenever the layout changes because
			// Obsidian might have destroyed our injected elements.
			this.registerEvent(
				this.app.workspace.on("layout-change", async () => {
					console.log("Layout changed");
					// Optional: might not need full rebuild here if we trust events
					// But for safety, we rebuild and re-render.
					await this.rebuildGraph();
				})
			);



			// Get all markdown leaves and render chain view for each

		});
		//============================================
	}

	//============================================
	// Rebuild chain graph
	//============================================
	//============================================
	// Rebuild chain graph
	//============================================
	/**
	 * Rebuilds the entire graph from scratch and re-renders the view.
	 * This is an expensive operation, so use it sparingly.
	 * In a production plugin, you might want to update the graph incrementally.
	 */
	async rebuildGraph() {
		console.log("Rebuilding chain graph");
		this.graph = buildChainGraph(this.app);
		await this.renderChainView();
	}

	/**
	 * Renders the chain view into the active markdown leaf.
	 */
	async renderChainView() {
		await renderChainView(this);
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
