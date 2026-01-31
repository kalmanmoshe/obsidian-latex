import LatexEngine, { EngineStatus } from '../base/compilerBase/engine';
import Worker from './swiftlatexxetex.worker';

export default class XeTeXEngine extends LatexEngine {
	
	async loadEngine(): Promise<void> {
		if (this.worker) {
			throw new Error('Other instance is running, abort()');
		}

		this.engineStatus = EngineStatus.Init;

		await new Promise<void>((resolve, reject) => {
			this.worker = new Worker(Worker);
			this.worker!.onmessage = (ev: MessageEvent<any>) => {
				const data = ev.data;
				if (data.result === 'ok') {
					this.engineStatus = EngineStatus.Ready;
					resolve();
				} else {
					this.engineStatus = EngineStatus.Error;
					reject();
				}
			};
		});

		this.worker!.onmessage = () => { };
		this.worker!.onerror = () => { };
	}
}
