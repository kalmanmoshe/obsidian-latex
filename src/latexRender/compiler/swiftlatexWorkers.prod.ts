import { pdftexWorkerGzipBase64 } from '../../generated/pdftexWorker.payload';
import { xetexWorkerGzipBase64 } from '../../generated/xetexWorker.payload';
import { dviWorkerGzipBase64 } from '../../generated/dviWorker.payload';
import { decompressGzipText } from "src/util/decompressPayload";

async function createWorkerFromCompressedPayload(
    base64Payload: string,
): Promise<Worker> {
    const source = await decompressGzipText(
        base64Payload,
    );

    const blob = new Blob(
        [source],
        { type: "text/javascript" },
    );

    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 0);

    return worker;
}

export const pdftexWorkerFactory = async (): Promise<Worker> => {
	return createWorkerFromCompressedPayload(pdftexWorkerGzipBase64);
};

export const xetexWorkerFactory = async (): Promise<Worker> => {
	return createWorkerFromCompressedPayload(xetexWorkerGzipBase64);
};

export const dviWorkerFactory = async (): Promise<Worker> => {
	return createWorkerFromCompressedPayload(dviWorkerGzipBase64);
};