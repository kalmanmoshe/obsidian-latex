
import XeTeXEngine from "./xeTeXEngine";
import { StringMap } from "src/settings/settings";
import { DvipdfmxEngine } from "../dvipdfmxEngine/dvipdfmxEngine";
import LatexEngine, { CompileResult } from "../engine";

export class PdfXeTeXEngine extends LatexEngine{
	xetEng: XeTeXEngine;
	dviEng: DvipdfmxEngine;

	constructor() {
        super();
		this.xetEng = new XeTeXEngine();
		this.dviEng = new DvipdfmxEngine();
	}

	async loadEngine() {
		await this.xetEng.loadEngine();
		await this.dviEng.loadEngine();
	}


	setTexliveEndpoint(url: string) {
		return this.xetEng.setTexliveEndpoint(url),
		this.dviEng.setTexliveEndpoint(url);
	}

	writeTexFSFile(filename: string, srccode: any) {
		return this.xetEng.writeTexFSFile(filename, srccode),
		this.dviEng.writeTexFSFile(filename, srccode);
	}
	

	writeCacheData(texlive404_cache: StringMap, texlive200_cache: StringMap, font404_cache: StringMap, font200_cache: StringMap) {
		return this.xetEng.writeCacheData({}, texlive200_cache, font404_cache, font200_cache);
	}

	flushCache() {
		return this.xetEng.flushCache();
	}

	isReady() {
		return this.xetEng.isReady() && this.dviEng.isReady();
	}


	writeMemFSFile(filename: string, source: any) {
		return this.xetEng.writeMemFSFile("main.tex", source);
	}

	setEngineMainFile(file: string) {
		return this.xetEng.setEngineMainFile("main.tex");
	}



	compileLaTeX() : Promise<CompileResult> {
		return new Promise<any>((resolve) => {
			this.xetEng.compileLaTeX().then((xetResult: CompileResult) => {
				// send the error up
				if (xetResult.status != 0) {
					resolve(xetResult);
					return;
				}

				let xdv = xetResult.pdf;

				this.dviEng.writeMemFSFile("main.xdv", xdv);
				this.dviEng.setEngineMainFile("main.xdv");
				this.dviEng.compilePDF().then((dviResult: CompileResult) => {
					resolve(dviResult)
				})
            })
        })
    }

    fetchCacheData(): Promise<Record<string, string>[]> {
        return new Promise<Record<string, string>[]>((resolve) => {
            this.xetEng.fetchCacheData().then((xetcache: Record<string, string>[]) =>{
                this.dviEng.fetchCacheData().then((dvicache: Record<string, string>[]) =>{
                    const mergedcache = xetcache.map((item:any, index:any) => ({ ...item, ...dvicache[index] }));
                    resolve(mergedcache);
                });
            });
        })
    }

    fetchTexFiles(newFileNames:any, cachepath: string) {
        return this.xetEng.fetchTexFiles(newFileNames, cachepath),
        this.dviEng.fetchTexFiles(newFileNames, cachepath);
    }

}