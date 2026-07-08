import PdfTeXWorker from './swiftlatexpdftex.worker.js';
import LatexEngine, {
  CompileResult,
} from '../base/compilerBase/engine.js';
import LatexCompiler from '../base/compilerBase/compiler.js';

export default class PdfTeXCompiler extends LatexCompiler {
  texEng: LatexEngine;

  constructor() {
    super();
    this.texEng = new LatexEngine(PdfTeXWorker);
    this.engines = [this.texEng];
  }

  compileLaTeX(): Promise<CompileResult> {
    return this.texEng.compileLaTeX();
  }
}
