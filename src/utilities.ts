

export interface Latex{
	trigger?: string;
	replacement: string;
}

export function getTikzSuggestions(): Array<Latex> {

	const Latex=[
		// spy
		{replacement: 'spy using outlines,'},
		// plots
		{replacement: `samples=`},
		// axis 
		{replacement: `axis on top,`},
		// marks
		{replacement: `mark=none`},
    	{replacement: `mark=$1,`},
    	{replacement: `only marks`},
		// line width
		{replacement: `line width=1pt,`},
		
		// grid styles
		{replacement: `none`},
		{replacement: `major`},
		{replacement: `minor`},
		{replacement: `both`},
		//cycle list
		{replacement: `cycle list={$0},$1`},
		{replacement: `cycle list name=mark list,`},
		{replacement: `cycle list name=exotic,`},
		{replacement: `cycle list name=color,`},
		{replacement: `cycle list name=color list,`},
		//Rambled mess
		{replacement: `draw`},
		{replacement: `tikzpicture`},
		{replacement: `color`},
		{replacement: `left color`},
		{replacement: `right color`},
		
		{replacement: `scale`},
		{replacement: `thick`},
		{replacement: `cm`},
		{replacement: `circle`},
		{replacement: `cap=round`},
		{replacement: `midway`},
		{replacement: `green`},
		{replacement: `help lines`},
		{replacement: `title={Title Text}`},
		{replacement: `xlabel={X Axis Label}`},
		{replacement: `ylabel={Y Axis Label}`},
		{replacement: `axis lines=none`},
		{replacement: `axis lines=left`},
		{replacement: `axis lines=right`},
		{replacement: `axis lines=middle`},
		{replacement: `axis lines=center`},
		{replacement: `axis lines=box`},
		{replacement: `axis lines=top`},
		{replacement: `axis lines=bottom`},
		{replacement: `scale only axis`},
		{replacement: `xmode={log,normal}`},
		{replacement: `ymode={log,normal}`},
		{replacement: `xtick=0,`},
		{replacement: `xtick={list of values}`},
		{replacement: `ytick=0,`},
		{replacement: `ytick={list of values}`},
		{replacement: `xticklabels={list of labels}`},
		{replacement: `yticklabels={list of labels}`},
		{replacement: `color=`},
		
		{replacement: `fill=`},
		{replacement: `area style`},
		{replacement: `legend pos`},
		{replacement: `north`},
		{replacement: `south`},
		{replacement: `west`},
		{replacement: `east`},
		{replacement: `north west`},
		{replacement: `north east`},
		{replacement: `south west`},
		{replacement: `south east`},
		{replacement: `outer north east`},
		{replacement: `outer south east`},
		{replacement: `font=`},
		{replacement: `legend cell align={left, center, right}`},
		{replacement: `legend style={at={(0.5,-0.15)},anchor=north}`},
		{replacement: `legend columns`},
		{replacement: `legend image post style={scale=1.5}`},
		{replacement: `legend style={fill=gray!50!,draw=white,\nlegend pos=outer north east,\ndraw=white,text=black,\n},`},
		{replacement: `legend entries={$0}`},
		{replacement: `\\addlegendentry{<text>}`},
		{replacement: `\\addlegendimage{<options>}`},
		{replacement: `width`},
		{replacement: `height`},
		{replacement: `axis background`},
		{replacement: `domain=`},
		{replacement: `restrict y to domain= `},
		{replacement: `mark options=`},
		{replacement: `addlegendentry`},
		{replacement: `fill opacity`},
		{replacement: `error bars/.cd,`},
		{replacement: `y dir=minus,`},
		{replacement: `y fixed relative=1,`},
		{replacement: `x dir=minus,`},
		{replacement: `x fixed relative=1,`},
		{replacement: `error bar style={},`},
		{replacement: `stack plots=y`},
		{replacement: `stack dir=minus`},
		{replacement: `error bar style={dotted}`},
		{replacement: `quiver={u=1,v=1,scale arrows = 0.25},`},
		{replacement: `minimum width`},
		{replacement: `minimum height`},
		{replacement: `anchor=north`},
		{replacement: `label=east`},
		{replacement: `segment length`},
		{replacement: `amplitude`},
		{replacement: `decorate`},
		{replacement: `coil`},
		
		{replacement: `minimum size=`},
		{replacement: `draw`},
		{replacement: `path name=`},
		
		{replacement: `trig format=rad,`},
		...colors,
		...lineWidths,
		...lineStyles,
		...positions,
		...onPathPositions,
		...arrows,
		...shapes,
		...userCommands,
	];

	return Latex;
}

const tikzTemplates=[]


const colors = [
	{replacement: `blue`},
	{replacement: `red`},
	{replacement: `white`},
]
const lineWidths = [
	{replacement: `ultra thin`},
	{replacement: `very thin`},
	{replacement: `thin`},
	{replacement: `semithick`},
	{replacement: `thick`},
	{replacement: `very thick`},
	{replacement: `ultra thick`},
]
const lineStyles = [
	{replacement: `smooth`},
	{replacement: `loosely dotted,`},
	{replacement: `dotted,`},
	{replacement: `densely dotted,`},
	{replacement: `loosely dashed,`},
	{replacement: `dashed,`},
	{replacement: `densely dashed,`},
]
const positions = [
	{replacement: `sloped`},
	{replacement: `above`},
	{replacement: `below`},
	{replacement: `left`},
	{replacement: `right`},
	{replacement: `upper`},
	{replacement: `lower`},
]
const onPathPositions = [
	{replacement: `at end`},
	{replacement: `very near end`},
	{replacement: `near end`},
	{replacement: `midway`},
	{replacement: `near start`},
	{replacement: `very near start`},
	{replacement: `at start`},
]

const arrows = [
	{replacement: '-{Stealth},'},
	{replacement: '{Stealth}-,'},
	{replacement: `latex-latex`},
]
const shapes = [
	{replacement: `rectangle`,},
	{replacement: `parabola`},
]
const userCommands = [
	{replacement: `\\vec{$0}{$1}{$2}{}$3`},
	{replacement: `\\mass{$0}{$1}{-|}{}`},
	{replacement: `\\spring{$0}{$1}{}{}$3`},
	{replacement: `\\len{$0}{$1}{6mm}{$2}{.2}{0}$3`},
	{replacement: `\\\arr{$0}{$1}{$2}{1}{2}{1.2}{0.5}{90}$3`},
	{replacement: `\\mark{$0}{$1}{$2}$3`},
]

