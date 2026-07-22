import PdfTeXWorker from './swiftlatexpdftex.worker.js';
import LatexEngine, {
  CompileResult,
} from '../base/compilerBase/engine.js';
import LatexCompiler from '../base/compilerBase/compiler.js';

export default class PdfTeXCompiler extends LatexCompiler {
  texEng: LatexEngine;

  constructor() {
    super();
    this.engines = [this.texEng];
  }

  override setCompiler(): Promise<void> {
    try {
      this.texEng = new LatexEngine(PdfTeXWorker, "pdftex");
      this.engines = [this.texEng];
    } catch (e) {
      console.error("eroor seting compiler:",e)
    }
    return Promise.resolve();
  }

  compileLaTeX(): Promise<CompileResult> {
    return this.texEng.compileLaTeX();
  }
}
