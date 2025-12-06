import { App, TFile } from "obsidian";

/**
 * Service to detect the four-consecutive-newlines pattern at the end of content.
 * 
 * This is used to trigger automatic note creation when users enter
 * four blank lines at the end of an editor.
 */
export class EmptyLineDetector {
    // Pattern: four consecutive newlines at end of content
    // This matches when the user has pressed Enter 4 times at the end
    private readonly pattern = /\n\n\n\n$/;

    /**
     * Check if content ends with the four-newline pattern.
     * 
     * @param content - The editor content to check
     * @returns true if the pattern is detected at the end
     */
    detectPattern(content: string): boolean {
        return this.pattern.test(content);
    }

    /**
     * Remove the pattern from content, leaving just two newlines.
     * This cleans up the extra blank lines after detection.
     * 
     * @param content - The content with the pattern
     * @returns Content with the pattern replaced by a single trailing newline
     */
    removePattern(content: string): string {
        // Replace four newlines with just one trailing newline
        return content.replace(this.pattern, "\n");
    }
}
