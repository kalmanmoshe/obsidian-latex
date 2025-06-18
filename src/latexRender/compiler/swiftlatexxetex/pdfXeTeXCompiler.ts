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

  fetchCacheData(): Promise<Record<string, string>[]> {
    return new Promise<Record<string, string>[]>((resolve) => {
      this.xetEng
        .fetchCacheData()
        .then((xetcache: Record<string, string>[]) => {
          this.dviEng
            .fetchCacheData()
            .then((dvicache: Record<string, string>[]) => {
              const mergedcache = xetcache.map((item: any, index: any) => ({
                ...item,
                ...dvicache[index],
              }));
              resolve(mergedcache);
            });
        });
    });
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
