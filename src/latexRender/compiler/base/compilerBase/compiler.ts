import { StringMap } from 'src/settings/settings';
import LatexEngine, { CompileResult, EngineStatus } from './engine';
import { waitFor } from 'src/latexRender/swiftlatexRender';

export default abstract class LatexCompiler {
  protected engines: LatexEngine[];

  abstract compileLaTeX(): Promise<CompileResult>;

  isReady() {
    return this.engines.every((engine) => engine.isReady());
  }

  isResponsive() {
    return this.engines.every((engine) => engine.getEngineStatus() !== EngineStatus.Unresponsive);
  }

  async waitUntilReady(): Promise<void> {
    await waitFor(() => {
      if (!this.isResponsive()) {
        throw new Error('Compiler became unresponsive while waiting.');
      }

      return this.isReady();
    });
  }

  async loadEngines() {
    await Promise.all(this.engines.map((engine) => engine.loadEngine()));
  }

  async setTexliveEndpoint(url: string): Promise<void> {
    return Promise.all(
      this.engines.map((engine) => engine.setTexliveEndpoint(url)),
    ).then(() => { });
  }

  async writeTexFSFile(filename: string, srccode: any): Promise<void> {
    return Promise.all(
      this.engines.map((engine) =>
        engine.writeTexFSFile(filename, srccode),
      ),
    ).then(() => { });
  }

  async fetchTexFiles(newFileNames: string[]) {
    const results = await Promise.all(
      this.engines.map((engine) => engine.fetchTexFiles(newFileNames)),
    );
    return results.flat().map((file) => ({
      name: file.name,
      content: file.content,
    }));
  }

  async flushWorkCache() {
    return Promise.all(
      this.engines.map((engine) => engine.flushWorkCache()),
    ).then(() => { });
  }

  closeWorkers(): void {
    this.engines.forEach((engine) => engine.closeWorker());
  }

  private validate() {
    if (!this.engines || this.engines.length === 0) {
      throw new Error(
        'No engines loaded. Please call loadEngine() first.',
      );
    }
    if (this.engines.length !== 1) {
      throw new Error(
        'Multiple engines are not supported for this task. Please override the method in the subclass.',
      );
    }
  }

  async writeMemFSFile(
    filename: string,
    source: string | Buffer<ArrayBufferLike>,
  ): Promise<void> {
    this.validate();
    return this.engines[0].writeMemFSFile(filename, source);
  }

  flushCache() {
    this.validate();
    return this.engines[0].flushCache();
  }

  fetchCacheData(): Promise<Record<string, string>[]> {
    this.validate();
    return this.engines[0].fetchCacheData();
  }

  writePackageCacheIndex(
    texlive404_cache: StringMap,
    texlive200_cache: StringMap,
    font404_cache: StringMap,
    font200_cache: StringMap,
  ): Promise<void> {
    this.validate();
    return this.engines[0].writeCacheData(
      texlive404_cache,
      texlive200_cache,
      font404_cache,
      font200_cache,
    );
  }

  removeMemFSFile(filename: string) {
    this.validate();
    return this.engines[0].removeMemFSFile(filename);
  }

  setEngineMainFile(filename: string) {
    this.validate();
    return this.engines[0].setEngineMainFile(filename);
  }

  getEnginesStatus() {
    return this.engines.map((engine) => ({
      name: engine.constructor.name,
      status: engine.getEngineStatus()
    }));
  }
}
