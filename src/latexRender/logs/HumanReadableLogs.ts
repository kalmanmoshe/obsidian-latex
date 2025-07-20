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
export enum ErrorClasses {
  Container = "moshe-swift-latex-error-container",
  Content = "moshe-swift-latex-error-content",
  Title = "moshe-swift-latex-error-title",
  Explanation = "moshe-swift-latex-error-explanation",
  Cause = "moshe-swift-latex-error-cause",
  Package = "moshe-swift-latex-error-package",
  Line = "moshe-swift-latex-error-line",
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
  if (err.errors.length === 0) {
    const errMessage = createLatexErrorMessage()
    errMessage.title = "Unknown LaTeX Error";
    errMessage.explanation = err.raw
    return errorDiv(errMessage);
  }
  return errorDiv(refactorToErrorMessage(err.errors[0]));
}

export function errorDiv(info: ErrorMessage): HTMLElement {
  const { title, cause, line, explanation, triggeringPackage } = info;
  const container = Object.assign(document.createElement("div"), {
    className: ErrorClasses.Container,
  });

  const content = Object.assign(document.createElement("div"), {
    className: ErrorClasses.Content,
  });
  container.appendChild(content);

  const errorDetails = [
    [ErrorClasses.Title, title],
    [ErrorClasses.Explanation, explanation],
    [ErrorClasses.Cause, `Triggered from ${cause}`],
    [
      ErrorClasses.Package,
      triggeringPackage ? `Package: ${triggeringPackage}` : undefined,
    ],
    [ErrorClasses.Line, line ? `At line: ${line}` : undefined],
  ];

  errorDetails.forEach(([className, textContent]) => {
    if (!textContent) return;
    content.appendChild(
      Object.assign(document.createElement("div"), { className, textContent }),
    );
  });

  return container;
}
