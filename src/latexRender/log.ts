class LogText {
    text: string;
    lines: string[];
    row: number;
    static LOG_WRAP_LIMIT = 79;
  
    constructor(text: string) {
      this.text = text.replace(/\^\^I/g,'\t').replace(/(\r\n)|\r/g, '\n');
      let wrappedLines = this.text.split('\n');
      this.lines = [wrappedLines[0]];
      let i = 1;
      while (i < wrappedLines.length) {
        if (
          wrappedLines[i - 1].length === LogText.LOG_WRAP_LIMIT &&
          wrappedLines[i - 1].slice(-3) !== '...'
        ) {
          this.lines[this.lines.length - 1] += wrappedLines[i];
        } else {
          this.lines.push(wrappedLines[i]);
        }
        i++;
      }
      this.row = 0;
    }
  
    nextLine(): string | false {
      this.row++;
      return this.row >= this.lines.length ? false : this.lines[this.row];
    }

    hasNextLine(): boolean {return this.row + 1 < this.lines.length;}
  
    rewindLine(): void {this.row--;}
  
    linesUpToNextWhitespaceLine(): string[] {
      return this.linesUpToNextMatchingLine(/^ *$/);
    }
  
    linesUpToNextMatchingLine(match: RegExp): string[] {
      let lines: string[] = [];
      let nextLine = this.nextLine();
      if (nextLine !== false) lines.push(nextLine);
      while (nextLine !== false && !nextLine.match(match)) {
        nextLine = this.nextLine();
        if (nextLine !== false) lines.push(nextLine);
      }
      return lines;
    }
}
  
const state = {
    NORMAL: 0,
    ERROR: 1
};

class LatexParser {
    log: LogText;
    state: number;
    fileBaseNames: RegExp[];
    ignoreDuplicates: boolean | undefined;
    data: any[];
    fileStack: any[];
    currentFileList: any[];
    rootFileList: any[];
    openParens: number;
    currentLine: string | false = '';
    currentError: any;
    currentFilePath: string | undefined;

    constructor(text: string, options: any = {}) {
        this.log = new LogText(text);
        this.state = state.NORMAL;
        this.fileBaseNames = options.fileBaseNames || [/compiles/, /\/usr\/local/];
        this.ignoreDuplicates = options.ignoreDuplicates;
        this.data = [];
        this.fileStack = [];
        this.currentFileList = this.rootFileList = [];
        this.openParens = 0;
    }

    private parse() {
        
        while ((this.currentLine = this.log.nextLine()) !== false) {
            if (this.state === state.NORMAL) {
                if (this.currentLineIsError()) {
                this.state = state.ERROR;
                this.currentError = {
                    line: null,
                    file: this.currentFilePath,
                    level: 'error',
                    message: this.currentLine.slice(2),
                    content: '',
                    raw: this.currentLine + '\n'
                };
                } else {
                    this.parseParensForFilenames();
                }
            }
            if (this.state === state.ERROR) {
                this.currentError.content += this.log.linesUpToNextMatchingLine(/^l\.[0-9]+/).join('\n');
                this.currentError.raw += this.currentError.content;
                let lineNo = this.currentError.raw.match(/l\.([0-9]+)/);
                if (lineNo) {
                this.currentError.line = parseInt(lineNo[1], 10);
                }
                this.data.push(this.currentError);
                this.state = state.NORMAL;
            }
        }
        return this.postProcess(this.data);
    }

    currentLineIsError(): boolean {
        return this.currentLine !== false && this.currentLine[0] === '!';
    }

    parseParensForFilenames(): void {
        if(!this.currentLine)return;
        let pos = this.currentLine.search(/\(|\)/);
        if(pos === -1)return
        let token = this.currentLine[pos];
        this.currentLine = this.currentLine.slice(pos + 1);
        if (token === '(') {
            let filePath = this.consumeFilePath();
            if (filePath) {
            this.currentFilePath = filePath;
            let newFile = { path: filePath, files: [] };
            this.fileStack.push(newFile);
            this.currentFileList.push(newFile);
            this.currentFileList = newFile.files;
            } else {
            this.openParens++;
            }
        } else if (token === ')') {
            if (this.openParens > 0) {
                this.openParens--;
            } else if (this.fileStack.length > 1){
                this.fileStack.pop();
                let previousFile = this.fileStack[this.fileStack.length - 1];
                this.currentFilePath = previousFile.path;
                this.currentFileList = previousFile.files;
            }
        }
        this.parseParensForFilenames();
    }

    private consumeFilePath(): string | false {
        if (!this.currentLine||!this.currentLine.match(/^\/?([^ \)]+\/)+/)) return false;
        let endOfFilePath = this.currentLine.search(/ |\)/);
        let path: string;
        if (endOfFilePath === -1) {
            path = this.currentLine;
            this.currentLine = '';
        } else {
            path = this.currentLine.slice(0, endOfFilePath);
            this.currentLine = this.currentLine.slice(endOfFilePath);
        }
        return path;
    }

    private postProcess(data: any[]) {
        let all: any[] = [],
        errors: any[] = [],
        warnings: any[] = [],
        typesetting: any[] = [],
        hashes: string[] = [];

        let hashEntry = (entry: any) => entry.raw;

        for (let i = 0; i < data.length; i++) {
            if (this.ignoreDuplicates && hashes.includes(hashEntry(data[i]))) continue;
            if (data[i].level === 'error') errors.push(data[i]);
            else if (data[i].level === 'typesetting') typesetting.push(data[i]);
            else if (data[i].level === 'warning') warnings.push(data[i]);
            all.push(data[i]);
            hashes.push(hashEntry(data[i]));
        }
        return { errors, warnings, typesetting, all, files: this.rootFileList };
    }
    
    
    static parse(text: string, options?: any) {
        return new LatexParser(text, options).parse();
    }
}

export default LatexParser;

export function errorDiv(title: string, cause: string, line: string) {
    const container = Object.assign(document.createElement("div"), { className: "moshe-swift-latex-error-container" });
    const content=Object.assign(document.createElement("div"), { className: "moshe-swift-latex-error-content" });
    container.appendChild(content);
    [["moshe-swift-latex-error-title", title], 
     ["moshe-swift-latex-error-cause", cause], 
     ["moshe-swift-latex-error-line", `At line: ${line}`]
    ].forEach(([className, innerText]) => {
        content.appendChild(Object.assign(document.createElement("div"), { className, innerText }))
    });
    return container;
}