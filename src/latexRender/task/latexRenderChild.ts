import { MarkdownRenderChild } from "obsidian";

export class LatexRenderChild extends MarkdownRenderChild {
    private objectUrl?: string;

    constructor(containerEl: HTMLElement) {
        super(containerEl);
    }

    setObjectUrl(objectUrl: string): void {
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
        }

        this.objectUrl = objectUrl;
    }

    onunload(): void {
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = undefined;
        }
    }
}