export interface WorkerWindow {
	memlog: string;
	initmem?: any;
	mainfile: string;
	texlive_endpoint: string;
	constants: {
		TEXCACHEROOT: '/tex';
		WORKROOT: '/work';
	};
	cacheRecord: {
		texlive404: Record<string, number>;
		texlive200: Record<string, string>;
		font404: Record<string, number>;
		font200: Record<string, string>;
	};
}

export class DefaultWorkerValues implements WorkerWindow {
	memlog: string = '';
	initmem?: any;
	mainfile: string = '';
	texlive_endpoint: string = 'https://texlive.texjp.org/texlive';//https://texlive2.swiftlatex.com/
	constants = {
		TEXCACHEROOT: '/tex' as const,
		WORKROOT: '/work' as const,
	};
	cacheRecord = {
		texlive404: {},
		texlive200: {},
		font404: {},
		font200: {},
	};

	static assign(scope: any = self): void {
        const defaults = new DefaultWorkerValues();
        for (const key in defaults) {
            if (Object.prototype.hasOwnProperty.call(defaults, key) && scope[key] === undefined) {
                scope[key] = (defaults as any)[key];
            }
        }
    }
}
