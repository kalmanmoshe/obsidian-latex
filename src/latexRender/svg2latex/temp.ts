const fs = require("fs").promises;
import { parse, stringify } from "svgson";

export async function readAndParseSVG() {
  try {
    const svgContent = svg;
    // Parse the SVG content into a JSON object
    const svgJSON = await parse(svgContent);

    // Optionally, convert the JSON back into an SVG string
    const svgString = stringify(svgJSON);

    return { svgContent, svgJSON, svgString };
  } catch (error) {
    console.error("Error processing SVG:", error);
    throw error;
  }
}
const svg = `<!--?xml version="1.0" encoding="UTF-8"?-->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="57.689" height="43.516" viewBox="0 0 57.689 43.516">
<defs>
<g>
<g id="49a7c80ae792a81cdcba7c479ca00e1931u6c4j9__glyph-0-0">
</g>
<g id="49a7c80ae792a81cdcba7c479ca00e1931u6c4j9__glyph-0-1"><
path d="M 2.90625 -6.3125 C 2.90625 -6.546875 2.90625 -6.5625 2.671875 -6.5625 C 2.0625 -5.9375 1.1875 -5.9375 0.875 -5.9375 L 0.875 -5.625 C 1.078125 -5.625 1.65625 -5.625 2.171875 -5.890625 L 2.171875 -0.78125 C 2.171875 -0.421875 2.140625 -0.3125 1.25 -0.3125 L 0.9375 -0.3125 L 0.9375 0 C 1.28125 -0.03125 2.140625 -0.03125 2.53125 -0.03125 C 2.921875 -0.03125 3.78125 -0.03125 4.125 0 L 4.125 -0.3125 L 3.8125 -0.3125 C 2.921875 -0.3125 2.90625 -0.421875 2.90625 -0.78125 Z M 2.90625 -6.3125 "></path></g><g id="49a7c80ae792a81cdcba7c479ca00e1931u6c4j9__glyph-0-2"><path d="M 4.53125 -3.15625 C 4.53125 -3.9375 4.484375 -4.734375 4.140625 -5.46875 C 3.6875 -6.40625 2.875 -6.5625 2.46875 -6.5625 C 1.875 -6.5625 1.15625 -6.3125 0.75 -5.390625 C 0.4375 -4.71875 0.390625 -3.9375 0.390625 -3.15625 C 0.390625 -2.421875 0.421875 -1.53125 0.828125 -0.78125 C 1.25 0.015625 1.96875 0.21875 2.453125 0.21875 C 2.984375 0.21875 3.734375 0.015625 4.171875 -0.921875 C 4.484375 -1.609375 4.53125 -2.375 4.53125 -3.15625 Z M 2.453125 0 C 2.078125 0 1.484375 -0.25 1.3125 -1.1875 C 1.203125 -1.78125 1.203125 -2.6875 1.203125 -3.265625 C 1.203125 -3.90625 1.203125 -4.5625 1.28125 -5.09375 C 1.46875 -6.265625 2.203125 -6.34375 2.453125 -6.34375 C 2.78125 -6.34375 3.4375 -6.171875 3.625 -5.203125 C 3.71875 -4.640625 3.71875 -3.890625 3.71875 -3.265625 C 3.71875 -2.53125 3.71875 -1.859375 3.609375 -1.234375 C 3.453125 -0.296875 2.90625 0 2.453125 0 Z M 2.453125 0 "></path></g></g><clipPath id="49a7c80ae792a81cdcba7c479ca00e1931u6c4j9__clip-0"><path d="M 0.164062 42 L 57.21875 42 L 57.21875 43.039062 L 0.164062 43.039062 Z M 0.164062 42 " clip-rule="nonzero">
</path></clipPath><clipPath id="49a7c80ae792a81cdcba7c479ca00e1931u6c4j9__clip-1">
<path d="M 28 4 L 30 4 L 30 43.039062 L 28 43.039062 Z M 28 4 " clip-rule="nonzero">
</path>
</clipPath>
</defs>
<g clip-path="url(#49a7c80ae792a81cdcba7c479ca00e1931u6c4j9__clip-0)">
<path fill="none" stroke="rgb(0%, 0%, 0%)" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" stroke-opacity="1" stroke-width="0.99628" d="M 0.000230536 0.00185364 L 56.694176 0.00185364 " transform="matrix(0.989, 0, 0, -0.989, 0.656022, 42.544802)"></path></g><g clip-path="url(#49a7c80ae792a81cdcba7c479ca00e1931u6c4j9__clip-1)"><path fill="none" stroke="rgb(100%, 0%, 0%)" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" stroke-opacity="1" stroke-width="0.99628" d="M 28.347203 0.00185364 L 28.347203 37.887344 " transform="matrix(0.989, 0, 0, -0.989, 0.656022, 42.544802)"></path></g><path fill="rgb(100%, 0%, 0%)" fill-opacity="1" fill-rule="nonzero" stroke="rgb(100%, 0%, 0%)" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" stroke-opacity="1" stroke-width="0.99628" d="M 6.054267 -0.000403488 L 1.606909 1.682167 L 3.088045 -0.000403488 L 1.606909 -1.682974 Z M 6.054267 -0.000403488 " transform="matrix(0, -0.989, -0.989, 0, 28.691007, 7.882201)"></path><g fill="rgb(0%, 0%, 0%)" fill-opacity="1"><use xlink:href="#49a7c80ae792a81cdcba7c479ca00e1931u6c4j9__glyph-0-1" x="23.764007" y="17.741671"></use><use xlink:href="#49a7c80ae792a81cdcba7c479ca00e1931u6c4j9__glyph-0-2" x="28.690513" y="17.741671"></use></g>
</svg>`;
