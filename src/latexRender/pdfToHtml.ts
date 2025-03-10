import {PDFDocument} from 'pdf-lib';
import { SVGroot } from 'src/svg/nodes';
import {Config,optimize} from 'svgo';
const PdfToCairo = require("./pdftocairo.js")
import { Md5 } from 'ts-md5';


export async function pdfToSVG(pdfData: any, config: { invertColorsInDarkMode: boolean,sourceHash: string }) {
    const hashSVG = (svg: string) => {
        const id = Md5.hashStr(svg.trim()).toString();
        const randomString = Math.random().toString(36).substring(2, 10);
        return id.concat(randomString);
    };

    const pdftocairo = await PdfToCairo();
    pdftocairo.FS.writeFile('input.pdf', pdfData);
    pdftocairo._convertPdfToSvg();

    let svg = pdftocairo.FS.readFile('input.svg', { encoding: 'utf8' });
    const svgoConfig: Config = {
        multipass: true,
        plugins: [
            { name: 'removeMetadata' },
            { name: 'convertPathData', params: { floatPrecision: 3 } },
            { name: 'cleanupNumericValues', params: { floatPrecision: 3 } },
            { name: 'sortAttrs' }, 
            { name: 'prefixIds', params: { prefix: hashSVG(svg) } }
        ]
    };

    svg = optimize(svg, svgoConfig).data; 

    if (config.invertColorsInDarkMode) {
        svg = colorSVGinDarkMode(svg);
    }
    const parsedSVG = await SVGroot.parse(svg);
    parsedSVG.idSvg(config.sourceHash);
    svg = parsedSVG.toString();
    return svg;
}





function colorSVGinDarkMode(svg: string) {
	// Replace the color "black" with currentColor (the current text color)
	// so that diagram axes, etc are visible in dark mode
	// and replace "white" with the background color
	if (document.body.classList.contains('theme-dark')) {
	svg = svg.replace(/rgb\(0%, 0%, 0%\)/g, "currentColor")
				.replace(/rgb\(100%, 100%, 100%\)/g, "var(--background-primary)");
	} else {
	svg = svg.replace(/rgb\(100%, 100%, 100%\)/g, "currentColor")
				.replace(/rgb\(0%, 0%, 0%\)/g, "var(--background-primary)");
	}
	
	return svg;
}


export async function pdfToHtml(pdfData: Buffer<ArrayBufferLike>) {
    const {width, height} = await getPdfDimensions(pdfData);
    const ratio = width / height;
    const pdfblob = new Blob([pdfData], { type: 'application/pdf' });
    const objectURL = URL.createObjectURL(pdfblob);
    return  {
        attr: {
        data: `${objectURL}#view=FitH&toolbar=0`,
        type: 'application/pdf',
        class: 'block-lanuage-latex',
        style: `width:100%; aspect-ratio:${ratio}`
        }
    };
}

async function  getPdfDimensions(pdf: any): Promise<{width: number, height: number}> {
    const pdfDoc = await PDFDocument.load(pdf);
    const firstPage = pdfDoc.getPages()[0];
    const {width, height} = firstPage.getSize();
    return {width, height};
}
