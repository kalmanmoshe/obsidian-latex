import LatexEngine, { CompileResult } from '../base/compilerBase/engine.js';
import LatexCompiler from '../base/compilerBase/compiler.js';
import { pdftexWorkerFactory } from '@swiftlatex-workers';

export default class PdfTeXCompiler extends LatexCompiler {
  texEng: LatexEngine;

  constructor() {
    super();
    this.texEng = new LatexEngine(pdftexWorkerFactory, "pdftex");
    this.engines = [this.texEng];
  }

  compileLaTeX(): Promise<CompileResult> {
    return this.texEng.compileLaTeX();
  }
}
