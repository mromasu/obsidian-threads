import { MarkdownView, Platform, Plugin, TFile } from 'obsidian';
import { ChainGraph } from './graph/GraphBuilder';
import { renderChainView } from './renderChainView';
import { GraphService } from './services/GraphService';
import { EmptyLineDetector } from './services/EmptyLineDetector';
import { NoteCreationService } from './services/NoteCreationService';
import { ThreadsSettings, DEFAULT_SETTINGS } from './settings/ThreadsSettings';
import { ThreadsSettingTab } from './settings/ThreadsSettingTab';
import { registerEvents } from './events/EventHandlers';

/**
 * Threads Plugin - Chain notes together like Twitter/X threads.
 * 
 * This plugin allows you to link notes via `prev` frontmatter field,
 * creating a continuous flow of connected notes displayed inline.
 */
export default class ThreadsPlugin extends Plugin {
	settings: ThreadsSettings;
	graphService: GraphService;
	emptyLineDetector: EmptyLineDetector;
	noteCreationService: NoteCreationService;

	/** Debounce flag to prevent rapid note creation (desktop only) */
	isCreatingNote: boolean = false;

	/** Cache prev values to detect changes */
	prevFrontmatterCache: Map<string, string | undefined> = new Map();

	/** Expose graph for backward compatibility with renderChainView */
	get graph(): ChainGraph {
		return this.graphService.graph;
	}

	async onload() {
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new ThreadsSettingTab(this.app, this));

		console.log("Loading Threads plugin");

		// Wait for the workspace to be fully ready before building our graph.
		// This ensures all files are indexed and the cache is populated.
		this.app.workspace.onLayoutReady(() => {
			// Initialize services
			this.graphService = new GraphService(this.app);
			this.graphService.initialize();

			this.emptyLineDetector = new EmptyLineDetector();
			this.noteCreationService = new NoteCreationService(this.app, this.graphService);
			this.noteCreationService.setTargetFolder(this.settings.newNotesFolder);

			// Set callback to re-render chain view after new note is created
			this.noteCreationService.setOnNoteCreated(async (file) => {
				await this.renderChainView();
			});

			// Register all event handlers
			registerEvents(this);

			// Initial render: Inject the view into all currently open markdown leaves
			const leaves = this.app.workspace.getLeavesOfType("markdown");
			console.log(`Rendering chain view for ${leaves.length} markdown leaves`);

			leaves.forEach(async leaf => {
				const view = leaf.view;
				if (view instanceof MarkdownView) {
					await renderChainView(this, view);
				}
			});
		});
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

	onunload() {
		console.log("Unloading Threads plugin");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

export type ChainPlugin = ThreadsPlugin;

