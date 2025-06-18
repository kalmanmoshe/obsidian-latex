import LatexLogParser, {
  CurrentError,
  Options,
  ProcessedLog,
} from "./latex-log-parser";

export default function parseLatexLog(
  rawLog: string,
  options: Options = { ignoreDuplicates: true },
): ProcessedLog {
  return new LatexLogParser(rawLog, options).parse();
}

function displayStructure(items: any[], indent: number = 0): string {
  let result = "";

  for (const item of items) {
    result += "  ".repeat(indent) + item.path + "\n";
    if (item.files && Array.isArray(item.files)) {
      result += displayStructure(item.files, indent + 1);
    }
  }

  return result;
}

interface ErrorMessage {
  title: string;
  explanation?: string;
  triggeringPackage?: string;
  cause?: string;
  line?: number;
}

function refactorToErrorMessage(err: CurrentError): ErrorMessage {
  return {
    title: err.message,
    //explanation: err.messageComponent?.textContent,
    cause: err.cause || err.content,
    line: err.line || undefined,
  };
}
export function createLatexErrorMessage(
  errorInfo: { line?: number; cause?: string } = {},
): ErrorMessage {
  let title = "";
  let line = errorInfo.line;
  let explanation;
  let cause = errorInfo.cause;

  return { title, explanation, cause, line };
}

export function createErrorDisplay(err: ProcessedLog) {
  console.error("LaTeX Error:", err);
  return errorDiv(refactorToErrorMessage(err.errors[0]));
}

export function errorDiv(info: ErrorMessage): HTMLElement {
  const { title, cause, line, explanation, triggeringPackage } = info;
  const container = Object.assign(document.createElement("div"), {
    className: "moshe-swift-latex-error-container",
  });

  const content = Object.assign(document.createElement("div"), {
    className: "moshe-swift-latex-error-content",
  });
  container.appendChild(content);

  const errorDetails = [
    ["moshe-swift-latex-error-title", title],
    ["moshe-swift-latex-error-explanation", explanation],
    ["moshe-swift-latex-error-cause", `Triggered from ${cause}`],
    [
      "moshe-swift-latex-error-package",
      triggeringPackage ? `Package: ${triggeringPackage}` : undefined,
    ],
    ["moshe-swift-latex-error-line", line ? `At line: ${line}` : undefined],
  ];

  errorDetails.forEach(([className, textContent]) => {
    if (!textContent) return;
    content.appendChild(
      Object.assign(document.createElement("div"), { className, textContent }),
    );
  });

  return container;
}
