
import LatexEngine,{ EngineStatus } from "../engine";
import Worker from "./swiftlatexxetex.worker";

export default class XeTeXEngine extends LatexEngine {
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

        this.latexWorker!.onmessage = () => {};
        this.latexWorker!.onerror = () => {};
    }
}