import XeTeXEngine from "./xeTeXEngine";
import { DvipdfmxEngine } from "../dvipdfmxEngine/dvipdfmxEngine";
import { CompileResult } from "../base/compilerBase/engine";
import LatexCompiler from "../base/compilerBase/compiler";

export class PdfXeTeXCompiler extends LatexCompiler {
  xetEng: XeTeXEngine;
  dviEng: DvipdfmxEngine;
  constructor() {
    super();
    this.xetEng = new XeTeXEngine();
    this.dviEng = new DvipdfmxEngine();
    this.engines = [this.xetEng, this.dviEng];

    this.writeMemFSFile = this.xetEng.writeMemFSFile.bind(this.xetEng);
    this.flushCache = this.xetEng.flushCache.bind(this.xetEng);
    this.writeCacheData = this.xetEng.writeCacheData.bind(this.xetEng);
    this.removeMemFSFile = this.xetEng.removeMemFSFile.bind(this.xetEng);
    this.setEngineMainFile = this.xetEng.setEngineMainFile.bind(this.xetEng);
  }

  async fetchCacheData(): Promise<Record<string, string>[]> {
    const xetCache = await this.xetEng.fetchCacheData();
    const dviCache = await this.dviEng.fetchCacheData();

    const mergedCache = xetCache.map((item, index) => ({
      ...item,
      ...dviCache[index],
    }));
    return mergedCache
  }
  async compileLaTeX(): Promise<CompileResult> {
    const xetResult = await this.xetEng.compileLaTeX();
    // send the error up
    if (xetResult.status != 0) {
      return xetResult;
    }
    let xdv = xetResult.pdf;
    await this.dviEng.writeMemFSFile("main.xdv", xdv);
    await this.dviEng.setEngineMainFile("main.xdv");
    return this.dviEng.compilePDF();
  }
}
