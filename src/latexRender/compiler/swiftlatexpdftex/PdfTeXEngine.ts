import Worker from "./mainSwiftlatex.worker";
import LatexEngine, {
  CompileResult,
  EngineStatus,
} from "../base/compilerBase/engine";
import LatexCompiler from "../base/compilerBase/compiler";

class PdfTeXEngine extends LatexEngine {
  async loadEngine(): Promise<void> {
    if (this.compiler) {
      throw new Error("Other instance is running, abort()");
    }

    this.compilerStatus = EngineStatus.Init;

    await new Promise<void>((resolve, reject) => {
      //@ts-expect-error
      this.compiler = new Worker(Worker);
      this.compiler!.onmessage = (ev: MessageEvent<any>) => {
        const data = ev.data;
        if (data.result === "ok") {
          this.compilerStatus = EngineStatus.Ready;
          resolve();
        } else {
          this.compilerStatus = EngineStatus.Error;
          reject();
        }
      };
    });

    this.compiler!.onmessage = () => {};
    this.compiler!.onerror = () => {};
  }
}

export default class PdfTeXCompiler extends LatexCompiler {
  texEng: PdfTeXEngine;

  constructor() {
    super();
    this.texEng = new PdfTeXEngine();
    this.engines = [this.texEng];
  }
  compileLaTeX(): Promise<CompileResult> {
    return this.texEng.compileLaTeX();
  }
}
