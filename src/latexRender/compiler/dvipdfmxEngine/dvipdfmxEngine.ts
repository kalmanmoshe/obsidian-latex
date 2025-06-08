import LatexEngine, { EngineStatus, EngineCommands, CompileResult } from "../base/compilerBase/engine";
import Worker from "./swiftlatexdvipdfm.worker";

export class DvipdfmxEngine extends LatexEngine {
    async loadEngine(): Promise<void> {
        if (this.compiler) {throw new Error("Other instance is running, abort()");}

        this.compilerStatus = EngineStatus.Init;

        await new Promise<void>((resolve, reject) => {
            this.compiler = new Worker(Worker);
            this.compiler!.onmessage = (ev:MessageEvent<any>) => {
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
    }
    
}