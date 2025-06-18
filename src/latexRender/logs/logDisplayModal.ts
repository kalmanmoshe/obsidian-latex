import { Modal } from "obsidian";
import Moshe from "src/main";
import { ProcessedLog, File, ErrorLevel } from "./latex-log-parser";
export class LogDisplayModal extends Modal {
  plugin: Moshe;
  log: ProcessedLog;
  constructor(plugin: Moshe, log: ProcessedLog) {
    super(plugin.app);
    this.plugin = plugin;
    this.log = log;
    this.modalEl.addClass("moshe-swift-latex-log-modal");
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "LaTeX Log" });

    const tabs = [
      ...([this.log.all].length > 0
        ? [{ name: "Errors", render: this.renderErrors.bind(this) }]
        : []),
      ...(this.log.files.length > 0
        ? [{ name: "Files", render: this.renderFiles.bind(this) }]
        : []),
      ...(this.log.raw?.trim()
        ? [{ name: "Raw", render: this.renderRaw.bind(this) }]
        : []),
    ];

    const tabsContainer = contentEl.createDiv("moshe-log-tabs");
    const buttonsContainer = tabsContainer.createDiv("moshe-log-buttons");
    const sectionsContainer = tabsContainer.createDiv("moshe-log-sections");
    const contentSections: Record<string, HTMLElement> = {};
    tabs.forEach(({ name, render }) => {
      const button = buttonsContainer.createEl("button", {
        text: name,
        cls: "moshe-log-tab-button",
      });
      const section = sectionsContainer.createDiv("moshe-log-tab-content");
      section.style.display = "none";
      contentSections[name] = section;

      button.onclick = () => {
        for (const sec of Object.values(contentSections))
          sec.style.display = "none";
        for (const btn of Array.from(buttonsContainer.children))
          btn.removeClass("active");
        section.style.display = "";
        button.addClass("active");
      };
      render(section);
    });

    (buttonsContainer.firstChild as HTMLElement)?.click();
    contentEl.appendChild(tabsContainer);
  }

  private renderErrors(container: HTMLElement) {
    console.log("renderErrors", this.log.all);
    const allErrors = this.log.all;
    allErrors.sort((a, b) => {
      const severity = {
        [ErrorLevel.Error]: 0,
        [ErrorLevel.Warning]: 1,
        [ErrorLevel.Typesetting]: 2,
      };
      return severity[a.level] - severity[b.level];
    });
    console.log("allErrors", allErrors);
    allErrors.forEach((err) => {
      const box = container.createDiv(
        "moshe-log-error-box " + `level-${err.level}`,
      );

      const header = box.createDiv({
        text: `${err.level.toUpperCase()}: ${err.message}`,
        cls: "moshe-log-error-header",
      });

      if (err.file || err.line !== null) {
        box.createDiv({
          text: `↳ ${err.file ?? "unknown file"}:${err.line ?? "?"}`,
          cls: "moshe-log-error-location",
        });
      }

      if (err.content) {
        box.createEl("pre", {
          text: err.content,
          cls: "moshe-log-error-snippet",
        });
      }

      if (err.cause) {
        box.createDiv({
          text: `Cause: ${err.cause}`,
          cls: "moshe-log-error-cause",
        });
      }
    });
  }

  private renderWarning(container: HTMLElement) {
    this.log.warnings.forEach((warn) => {
      container.createEl("div", {
        text: `${warn.message} (${warn.file}:${warn.line})`,
        cls: "moshe-log-warning",
      });
    });
  }

  private renderTypesetting(container: HTMLElement) {
    this.log.typesetting.forEach((typeErr) => {
      container.createEl("div", {
        text: `${typeErr.message} (${typeErr.file}:${typeErr.line})`,
        cls: "moshe-log-typesetting",
      });
    });
  }

  private renderFiles(container: HTMLElement) {
    const renderTree = (file: File, parent: HTMLElement, depth = 0) => {
      const wrapper = parent.createDiv("moshe-log-file-wrapper depth-" + depth);

      if (file.files?.length) {
        const details = wrapper.createEl("details", {
          cls: "moshe-log-file-details",
        });
        details.createEl("summary", {
          text: file.path,
          cls: "moshe-log-file-summary",
        });
        file.files.forEach((child) => renderTree(child, details, depth + 1));
      } else {
        // Just a line, no <details>
        wrapper.createEl("div", {
          text: file.path,
          cls: "moshe-log-file-line",
        });
      }
    };

    this.log.files.forEach((file) => renderTree(file, container));
  }

  private renderRaw(container: HTMLElement) {
    const wrapper = container.createDiv();
    const rawPre = wrapper.createEl("pre", { text: this.log.raw });
    rawPre.setAttribute(
      "style",
      "white-space: pre-wrap; word-wrap: break-word;",
    );

    const copyButton = wrapper.createEl("button", { text: "Copy" });
    copyButton.setAttribute("style", "margin-top: 5px;");

    copyButton.addEventListener("click", () => {
      navigator.clipboard
        .writeText(this.log.raw)
        .then(() => {
          copyButton.textContent = "Copied!";
          setTimeout(() => (copyButton.textContent = "Copy"), 1500);
        })
        .catch(() => {
          copyButton.textContent = "Failed";
          setTimeout(() => (copyButton.textContent = "Copy"), 1500);
        });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
