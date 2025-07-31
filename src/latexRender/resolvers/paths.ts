
import pathA from "path";
import fs from "fs";
import { TAbstractFile, TFile, TFolder } from "obsidian";
import { getLatexTaskSectionInfosFromFile } from "./taskSectionInformation";
import { extractCodeBlockName } from "./latexSourceFromFile";
import { codeBlockToContent } from "./sectionUtils";

export function resolvePathRelToVault(path: string, currentPath: string): string {
    const { file, remainingPath } = findRelativeFile(path, currentPath);
    const absPath = file.path;
    if (!remainingPath) return absPath;
    
    if (!(file instanceof TFile) || file.extension !== "md") {
        throw new Error(`Invalid path: ${remainingPath}`);
    }
    if (!isValidFileBasename(remainingPath)) {
        throw new Error(`Invalid file basename: ${remainingPath}`);
    }
    const codeBlockName = remainingPath + ".tex";
    return absPath + "::" + codeBlockName;
}

/**
 * 
 * @param path The path to the file, relative to the vault root.
 * @returns 
 */
export async function getFileContent(path: string): Promise<string> {
    const parts = path.split("::");
    const ogParts = [...parts];
    if (parts.length > 2|| parts.length === 0) {
        throw new Error("Invalid path format. Use '::' to separate file path and code block name.");
    }
    const filePath = parts.shift()!;
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
        throw new Error(`File not found: ${filePath}`);
    }
    const fileText = await app.vault.read(file);
    if (parts.length === 0) return fileText;
    const codeBlockBaseName = extractBasenameAndExtension(parts.shift()!).basename;
    
    const codeBlocks = await getLatexTaskSectionInfosFromFile(file);
    const potentialTargets = codeBlocks.filter((block) => extractCodeBlockName(block.codeBlock) === codeBlockBaseName);
    const target = potentialTargets.shift();
    if (!target) { throw new Error("No code block found with name: " + codeBlockBaseName + " in file: " + file.path) };
    if (potentialTargets.length > 0) {
        throw new Error(`Multiple code blocks found with name: ${codeBlockBaseName} in file: ${file.path}`)
    }
    return codeBlockToContent(target.codeBlock);
}



function getDirRoot(current: TAbstractFile): TFolder {
    while (current.parent) current = current.parent;
    if (!(current instanceof TFolder) || !current.isRoot())
        throw new Error("Root not found");
    return current;
}

export function findRelativeFile(filePath: string, currentPath: string) {
    const start = app.vault.getAbstractFileByPath(currentPath);
    if (!start) throw new Error("Source file not found");

    let current: TAbstractFile = start;
    const separator = filePath.includes("\\") ? "\\" : "/";
    const match = filePath.match(new RegExp("^\\.{1,2}(" + separator + ")*"));
    const prefix = match?.[0] || "";

    filePath = filePath.slice(prefix.length);

    // Go up one directory per each separator after the dots
    if (prefix.startsWith("..")) {
        const ups = prefix.split(separator).length - 1;
        for (let i = 0; i < ups; i++) {
            if (!current.parent)
                throw new Error(`Reached root without resolving full path from: ${start.path}`);
            current = current.parent;
        }
    } else if (filePath.includes(separator)) {
        current = getDirRoot(current);
    }

    // Early return if current is already a file
    if (current instanceof TFile) {
        return { file: current, remainingPath: filePath };
    }

    const parts = filePath.split(separator).filter(Boolean);

    while (parts.length > 1 && current instanceof TFolder) {
        const next = current.children.find(
            (c) => c instanceof TFolder && c.name === parts[0]
        );
        if (!(next instanceof TFolder)) break;
        current = next;
        parts.shift();
    }

    if (!(current instanceof TFolder))
        throw new Error(`Invalid folder: ${parts[0]}`);

    const fileName = parts.shift()!;
    const file = current.children.find(
        (c) => c instanceof TFile && (c.name === fileName || (c.basename === fileName && c.name.endsWith(".md")))
    );

    if (!file) throw new Error(`File not found: ${fileName}`);
    if (parts.length > 1) throw new Error("Path not found");

    return {
        file,
        remainingPath: parts[0], // could be undefined
    };
}



export function extractBasenameAndExtension(path: string) {
    const parts = path.split(/\/|\\|::/).pop()?.split(".")!;
    const extension = parts.pop()!;
    const basename = parts.join(".");
    return {basename, extension};
}

function extractDirBasenameAndExtension(path: string): { dir: string, basename: string, extension: string } {
  const parts = path.split("/");
  const fileName = parts.pop() || "";
  const dir = parts.join("/");
  const nameParts = fileName.split(".");
  if (nameParts.length < 2) {
    throw new Error("File name must contain at least a basename and an extension.");
  }
  const extension = nameParts.pop() || "";
  const basename = nameParts.join(".");
  return { dir, basename, extension };
}

export function isValidFileBasename(basename: any): boolean {
    if (typeof basename !== "string") return false;
    basename = basename.trim();
    if (
        basename === "" ||
        basename.length > 255 ||
        /[<>:"/\\|?*\x00-\x1F]/.test(basename) ||
        /[. ]$/.test(basename)
    ) {
        return false;
    }

    const upper = basename.toUpperCase();
    const reserved = [
        "CON", "PRN", "AUX", "NUL",
        ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
        ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`)
    ];
    if (reserved.includes(upper)) return false;
    return true;
}
