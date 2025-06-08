import { WorkerWindow } from "./self";

export class WorkerCommandHandlers {
    worker: WorkerWindow;
    constructor(worker: WorkerWindow) {
        this.worker = worker;
    }
}