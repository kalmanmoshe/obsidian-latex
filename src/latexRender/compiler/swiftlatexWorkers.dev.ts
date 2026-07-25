import PdfTexWorker from "./swiftlatexpdftex/swiftlatexpdftex.worker.js";
import XeTexWorker from "./swiftlatexxetex/swiftlatexxetex.worker.js";
import DviWorker from "./swiftlatexxetex/swiftlatexdvipdfm.worker.js";

export const pdftexWorkerFactory = async (): Promise<Worker> => {
	return new PdfTexWorker();
};

export const xetexWorkerFactory = async (): Promise<Worker> => {
	return new XeTexWorker();
};

export const dviWorkerFactory = async (): Promise<Worker> => {
	return new DviWorker();
};