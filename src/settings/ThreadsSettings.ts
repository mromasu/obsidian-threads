/**
 * Plugin settings interface and defaults for Threads plugin.
 */

/**
 * Configuration options for the Threads plugin.
 */
export interface ThreadsSettings {
    /** Folder path for new notes. Empty string means use same folder as current note. */
    newNotesFolder: string;
}

/**
 * Default values for plugin settings.
 */
export const DEFAULT_SETTINGS: ThreadsSettings = {
    newNotesFolder: ''
};
