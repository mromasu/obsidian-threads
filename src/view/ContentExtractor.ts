import { App, Notice, TFile } from "obsidian";

/**
 * Helper function to read a note's content and strip away the YAML frontmatter.
 * We want to display ONLY the markdown content in the embedded editor, not the metadata.
 * 
 * @param app - The Obsidian App instance
 * @param path - The file path of the note to read
 * @returns The clean markdown content without frontmatter, and the original YAML
 */
export async function extractNoteContent(app: App, path: string): Promise<{ content: string; yaml: string }> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
        return { content: "", yaml: "" };
    }

    // Read the file from cache for performance
    const rawContent = await app.vault.cachedRead(file);

    // Regex to match YAML frontmatter (content between --- and --- at the start of file)
    const yamlRegex = /^---\n([\s\S]*?)\n---/;
    const match = rawContent.match(yamlRegex);
    const yaml = match ? match[1] : "";

    // Replace frontmatter with empty string and trim whitespace
    const sanitized = rawContent.replace(yamlRegex, "").trim();

    return { content: sanitized, yaml };
}

/**
 * Saves editor content back to the file, preserving YAML frontmatter.
 * 
 * @param app - The Obsidian App instance
 * @param path - The file path to save to
 * @param newContent - The new markdown content (without frontmatter)
 * @param originalYaml - The original YAML frontmatter to preserve
 */
export async function saveEditorContent(
    app: App,
    path: string,
    newContent: string,
    originalYaml: string
): Promise<void> {
    try {
        // Get the file from vault
        const file = app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            new Notice(`Error: Could not find file ${path}`);
            return;
        }

        // Reconstruct full content with YAML frontmatter
        const fullContent = reconstructFileContent(newContent, originalYaml);

        // Write back to file
        await app.vault.modify(file, fullContent);

        console.log(`Saved changes to ${path}`);
    } catch (error) {
        console.error(`Error saving file ${path}:`, error);
        new Notice(`Failed to save changes to ${path}`);
    }
}

/**
 * Reconstructs file content by stitching YAML frontmatter back together with markdown content.
 * Handles edge cases where YAML or content might be empty.
 * 
 * @param content - The markdown content (without frontmatter)
 * @param yaml - The YAML frontmatter content (without --- delimiters)
 * @returns The complete file content with properly formatted frontmatter
 */
export function reconstructFileContent(content: string, yaml: string): string {
    // If no YAML frontmatter, return content only
    if (!yaml || yaml.trim() === "") {
        return content;
    }

    // If no content, return YAML only
    if (!content || content.trim() === "") {
        return `---\n${yaml}\n---`;
    }

    // Both present: properly format with separators and spacing
    return `---\n${yaml}\n---\n\n${content}`;
}
