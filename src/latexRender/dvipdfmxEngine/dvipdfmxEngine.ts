import LatexEngine, { EngineStatus, EngineCommands, CompileResult } from "../engine";
import Worker from "./swiftlatexdvipdfm.worker";

export class DvipdfmxEngine extends LatexEngine {
    async loadEngine(): Promise<void> {
        if (this.latexWorker) {throw new Error("Other instance is running, abort()");}

        this.latexWorkerStatus = EngineStatus.Init;

        await new Promise<void>((resolve, reject) => {
            this.latexWorker = new Worker(Worker);
            this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
                const data = ev.data;
                if (data.result === "ok") {
                    this.latexWorkerStatus = EngineStatus.Ready;
                    resolve();
                } else {
                    this.latexWorkerStatus = EngineStatus.Error;
                    reject();
                }
            };
        });
    }
    async compilePDF(): Promise<CompileResult> {
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        const startCompileTime = performance.now();
        const data = await this.task<{pdf?: Uint8Array;status: number;log: string}>({cmd: EngineCommands.Compilepdf});
        console.log('Engine compilation finish ' + (performance.now() - startCompileTime));
        return new CompileResult(
            data.pdf ? Buffer.from(new Uint8Array(data.pdf)) : undefined,
            data.status,
            data.log
        );
    }
}