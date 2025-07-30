import {
  Command,
  Editor,
  Notice,
} from "obsidian";

import Moshe from "src/main";
import { assignCodeBlockName } from "./codeBlockNamer";
import { getTestCommands } from "src/tests/commands";
import { extractAllSectionsByFile } from "src/latexRender/resolvers/latexSourceFromFile";
import { hashLatexContent } from "src/latexRender/swiftlatexRender";
import { CacheStatus } from "src/latexRender/cache/compilerCache";
import { LatexTask } from "src/latexRender/utils/latexTask";
import { codeBlockToContent } from "src/latexRender/resolvers/sectionUtils";

function getCodeBlockNamer(plugin: Moshe) {
  return {
    id: "name-code-block",
    name: "Name Current Code Block",
    editorCallback: (editor: Editor) => assignCodeBlockName(plugin, editor)
  };
}


function removeAllCachedPackages(plugin: Moshe): Command {
  return {
    id: "remove-all-cached-packages",
    name: "Remove all cached packages",
    callback() {
      plugin.swiftlatexRender.cache.removeAllCachedPackages();
      new Notice("All cached packages removed");
    },
  };
}

async function extractAllUnrenderedSectionsByFile(plugin: Moshe) {
  const sectionsByFile = await extractAllSectionsByFile();
  const sectionInfosByFile = [];

  for (const { file, codeBlockSections } of sectionsByFile) {
    const fileInfos = [];

    for (const section of codeBlockSections) {
      const codeBlock = codeBlockToContent(section.codeBlock);
      const hash = hashLatexContent(codeBlock);
      if (plugin.swiftlatexRender.cache.cacheStatusForHash(hash) === CacheStatus.NotCached) {
        fileInfos.push(section);
      }
    }

    if (fileInfos.length > 0) {
      sectionInfosByFile.push({ file, codeBlockSections: fileInfos });
    }
  }
  return sectionInfosByFile;
}
async function renderAllUnrenderedCodeBlocks(plugin: Moshe) {
  const sectionInfosByFile = await extractAllUnrenderedSectionsByFile(plugin);
  console.log("Unrendered sections found:", sectionInfosByFile, sectionInfosByFile.length);
  for (const { file, codeBlockSections } of sectionInfosByFile) {
    for (const codeBlock of codeBlockSections) {
      const task = LatexTask.fromSectionInfo(plugin, file.path, codeBlock);
      plugin.swiftlatexRender.addToQueue(task);
    }
  }
  console.log("All unrendered code blocks are being processed", plugin.swiftlatexRender.queue);
}

function getRenderAllUnrenderedCodeBlocks(plugin: Moshe) {
  return {
    id: "render-all-unrendered-code-blocks",
    name: "Render All Unrendered Code Blocks",
    callback: async () => {
      renderAllUnrenderedCodeBlocks(plugin);
      new Notice("All unrendered code blocks are being processed");
    }
  };
}
function getRebuildQueue(plugin: Moshe) {
  return {
    id: "rebuild-queue",
    name: "Rebuild Render Queue",
    callback: async () => {
      plugin.swiftlatexRender.rebuildQueue();
      new Notice("Render queue rebuilt");
    }
  };
}

function getAbortTasks(plugin: Moshe) {
  return {
    id: "abort-latex-tasks",
    name: "Abort All LaTeX Tasks",
    callback: () => {
      plugin.swiftlatexRender.abortAllTasks();
      new Notice("All tasks aborted");
    }
  };
}


export const getEditorCommands = (plugin: Moshe): (Command | undefined)[] => {
  return [
    ...getTestCommands(plugin),
    getCodeBlockNamer(plugin),
    removeAllCachedPackages(plugin),
    getAbortTasks(plugin),
    getRenderAllUnrenderedCodeBlocks(plugin),
  ];
};

