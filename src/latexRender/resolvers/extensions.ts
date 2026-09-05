export enum CacheFileType {
	Text,
	Binary,
}

export const TEXT_EXTENSIONS = new Set([
    'tex',
    'sty',
    'cls',
    'clo',
    'cfg',
    'def',
    'fd',
    'ldf',
    'bib',
    'bst',
    'map',
    'enc',
    'fea',
    'sfd',
    'lig',
    'txt',
    'md',
    'svg',
]);

export function getFileReadType(
	fileName: string,
): CacheFileType {
	const extension =
		fileName.split('.').pop()?.toLowerCase();

	return extension && TEXT_EXTENSIONS.has(extension)
		? CacheFileType.Text
		: CacheFileType.Binary;
}