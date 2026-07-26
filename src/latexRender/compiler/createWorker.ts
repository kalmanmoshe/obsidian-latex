import { decompressGzipText } from 'src/util/decompressPayload';

export async function createWorkerFromCompressedPayload(base64Payload: string): Promise<Worker> {
	const source = await decompressGzipText(base64Payload);

	const blob = new Blob([source], { type: 'text/javascript' });

	const url = URL.createObjectURL(blob);
	const worker = new Worker(url);

	setTimeout(() => {
		URL.revokeObjectURL(url);
	}, 0);

	return worker;
}
