import { App, Modal } from "obsidian";
import path from "path";
import * as fs from "fs";

export class svgDisplayModule extends Modal {
  cacheFolderPath: string;
  cache: Map<string, Set<string>>;

  constructor(
    app: App,
    cacheFolderPath: string,
    cache: Map<string, Set<string>>,
  ) {
    super(app);
    this.cacheFolderPath = cacheFolderPath;
    this.cache = cache;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Cached SVGs", cls: "info-modal-title" });
    const svgContainer = contentEl.createDiv({
      cls: "info-modal-main-container",
    });

    // Iterate through each cached SVG entry
    for (const [hash, fileSet] of this.cache.entries()) {
      // Create a container for each SVG entry
      const entryContainer = svgContainer.createDiv({ cls: "svg-entry" });

      // Display the hash for identification
      entryContainer.createEl("h3", { text: `SVG Hash: ${hash}` });

      // Check if there is a conflict (i.e. the same hash appears in multiple files)
      if (fileSet.size > 1) {
        entryContainer.createEl("p", {
          text: "Conflict detected: SVG found in multiple files:",
        });
        const fileList = entryContainer.createEl("ul");
        fileSet.forEach((fileName) => {
          fileList.createEl("li", { text: fileName });
        });
      } else {
        // Only one file in which the SVG is referenced
        const [fileName] = Array.from(fileSet);
        entryContainer.createEl("p", { text: `Found in file: ${fileName}` });
      }

      // Construct the SVG file path from the hash
      const svgPath = path.join(this.cacheFolderPath, `${hash}.svg`);

      // Check if the SVG file exists
      if (fs.existsSync(svgPath)) {
        try {
          // Read and display the SVG content
          const svg = fs.readFileSync(svgPath, "utf8");
          const svgEl = entryContainer.createDiv({ cls: "svg-display" });
          svgEl.innerHTML = svg;
        } catch (err) {
          entryContainer.createEl("p", { text: "Error reading SVG file." });
        }
      } else {
        // Inform the user that the SVG file is not found in the cache folder
        entryContainer.createEl("p", { text: "SVG file not found in cache." });
      }
    }
  }
}
