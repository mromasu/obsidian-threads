/**
 * Service to detect the three-consecutive-newlines pattern at the end of content.
 * 
 * This is used to trigger automatic note creation when users enter
 * three blank lines at the end of an editor (desktop only).
 */
export class EmptyLineDetector {
    // Pattern: three consecutive newlines at end of content
    // This matches when the user has pressed Enter 3 times at the end
    private readonly pattern = /\n\n\n$/;

    /**
     * Check if content ends with the three-newline pattern.
     * 
     * @param content - The editor content to check
     * @returns true if the pattern is detected at the end
     */
    detectPattern(content: string): boolean {
        return this.pattern.test(content);
    }

    /**
     * Remove the pattern from content, leaving just one newline.
     * This cleans up the extra blank lines after detection.
     * 
     * @param content - The content with the pattern
     * @returns Content with the pattern replaced by a single trailing newline
     */
    removePattern(content: string): string {
        // Replace three newlines with just one trailing newline
        return content.replace(this.pattern, "\n");
    }
}
