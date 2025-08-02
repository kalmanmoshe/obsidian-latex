import { PDFDocument } from "pdf-lib";
import { SVGroot } from "src/svg/nodes";
import { optimizeSVG } from "./optimizeSVG";
const PdfToCairo = require("./pdftocairo.js");


export async function pdfToSVG(
  pdfData: Buffer<ArrayBufferLike>,
  config: { invertColorsInDarkMode: boolean; autoRemoveWhitespace: boolean; sourceHash: string },
) {
	const pdftocairo = await PdfToCairo();
	pdftocairo.FS.writeFile("input.pdf", pdfData);
	pdftocairo._convertPdfToSvg();
	let svg = pdftocairo.FS.readFile("input.svg", { encoding: "utf8" }) as string;
	
	if (config.autoRemoveWhitespace) {
		svg = cropSVGWhitespace(svg);
	}

	svg = optimizeSVG(svg, false);
	
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
  if (document.body.classList.contains("theme-dark")) {
    svg = svg
      .replace(/rgb\(0%, 0%, 0%\)/g, "currentColor")
      .replace(/rgb\(100%, 100%, 100%\)/g, "var(--background-primary)");
  } else {
    svg = svg
      .replace(/rgb\(100%, 100%, 100%\)/g, "currentColor")
      .replace(/rgb\(0%, 0%, 0%\)/g, "var(--background-primary)");
  }

  return svg;
}

function cropSVGWhitespace(svgString: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(svgString, "image/svg+xml");
	const svg = doc.querySelector("svg");

	if (!svg) return svgString;

	// Clone the SVG and insert it into a hidden live DOM container
	const tempSvg = svg.cloneNode(true) as SVGSVGElement;
	tempSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	tempSvg.style.position = "absolute";
	tempSvg.style.visibility = "hidden";
	tempSvg.style.pointerEvents = "none";
	tempSvg.style.width = "auto";
	tempSvg.style.height = "auto";

	document.body.appendChild(tempSvg);

	try {
		const bbox = tempSvg.getBBox();
		if (bbox.x === 0 && bbox.y === 0 && bbox.width === 0 && bbox.height === 0) {
			document.body.removeChild(tempSvg);
			svg.innerHTML = ""; // If bbox is empty, clear the SVG content
			svg.setAttribute("viewBox", "0 0 0 0");
			svg.setAttribute("width", "0");
			svg.setAttribute("height", "0");
			return svg.outerHTML;
		}
		
		// Now apply transform and viewBox
		const g = doc.createElementNS("http://www.w3.org/2000/svg", "g");
		while (svg.firstChild) {
			g.appendChild(svg.firstChild);
		}
		g.setAttribute("transform", `translate(${-bbox.x}, ${-bbox.y})`);
		svg.appendChild(g);
		console.warn("bbox", bbox);
		svg.setAttribute("viewBox", `0 0 ${bbox.width} ${bbox.height}`);
		svg.setAttribute("width", bbox.width.toString());
		svg.setAttribute("height", bbox.height.toString());

		// Clean up
		document.body.removeChild(tempSvg);

		return svg.outerHTML;
	} catch (err) {
		console.error("Failed to compute bbox:", err);
		document.body.removeChild(tempSvg);
		return svgString;
	}
}



export async function pdfToHtml(pdfData: Buffer<ArrayBufferLike>) {
  const { width, height } = await getPdfDimensions(pdfData);
  const ratio = width / height;
  const pdfblob = new Blob([pdfData], { type: "application/pdf" });
  const objectURL = URL.createObjectURL(pdfblob);
  return {
    attr: {
      data: `${objectURL}#view=FitH&toolbar=0`,
      type: "application/pdf",
      class: "block-lanuage-latex",
      style: `width:100%; aspect-ratio:${ratio}`,
    },
  };
}

async function getPdfDimensions(
  pdf: any,
): Promise<{ width: number; height: number }> {
  const pdfDoc = await PDFDocument.load(pdf);
  const firstPage = pdfDoc.getPages()[0];
  const { width, height } = firstPage.getSize();
  return { width, height };
}

