import * as d3 from "d3";

let schemeCategory18 = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#e377c2",
    "#bcbd22",
    "#17becf",
    "#aec7e8",
    "#ffbb78",
    "#98df8a",
    "#ff9896",
    "#c5b0d5",
    "#c49c94",
    "#f7b6d2",
    "#dbdb8d",
    "#9edae5"
];



let schemeCells = [
    "#549E3E",//Fibroblast
    "#F3C27B",//Endothelial cell (vascular)
    "#EF8632",//Myocyte (sk. muscle)
    "#AECDE1",//Epithelial cell (luminal)
    "#549E3E",//Myocyte (smooth muscle)
    "#AECDE1",//Epithelial cell (basal)
    "#AECDE1",//Epithelial cell (alveolar type II)
    "#3B76AF",//Immune (DC/macrophage)
    "#AECDE1",//Epithelial cell (alveolar type I)
    "#EF8632",//Myocyte (cardiac)
    "#3B76AF",//Immune (alveolar macrophage)
    "#549E3E",//Pericyte/SMC
    "#F3C27B",//Endothelial cell (lymphatic)
    "#AECDE1",//Epithelial cell (club)
    "#3B76AF",//Immune (T cell)
    "#AECDE1",//Epithelial cell (squamous)
    "#EF8632",//Myocyte (cardiac, cytoplasmic)
    "#AECDE1",//Epithelial cell (suprabasal)
];

let schemeCellsNew = [
  "#549E3E", // Fibroblast (base green)
  "#F3C27B", // Endothelial cell (vascular, base orange-beige)
  "#EF8632", // Myocyte (sk. muscle, base orange)
  "#AECDE1", // Epithelial cell (luminal, base light blue)
  "#4A8F38", // Myocyte (smooth muscle, darker green variant)
  "#96C1DC", // Epithelial cell (basal, medium blue variant)
  "#C3E2EF", // Epithelial cell (alveolar type II, lightest blue variant)
  "#3B76AF", // Immune (DC/macrophage, base medium blue)
  "#7CAECD", // Epithelial cell (alveolar type I, steel blue variant)
  "#E6731D", // Myocyte (cardiac, darker/richer orange variant)
  "#2E5E93", // Immune (alveolar macrophage, darker navy variant)
  "#67B84F", // Pericyte/SMC, brighter green variant
  "#DFA64F", // Endothelial cell (lymphatic, darker beige-gold)
  "#82B4CF", // Epithelial cell (club, muted teal-blue)
  "#4C85C4", // Immune (T cell, stronger blue variant)
  "#5E9CBF", // Epithelial cell (squamous, medium aqua variant)
  "#C95E15", // Myocyte (cardiac, cytoplasmic, burnt orange variant)
  "#73A7BA", // Epithelial cell (suprabasal, gray-blue variant)
];




let schemeRugzo4 = [
    '#ff800e',
    '#006ba4',
    '#FFC0CB',
    '#8B0000',
    "#D3D3D3"
]



import {default as cmasherColorsJSONData} from './cmasherColorsData.json';
import {default as CETColorsData} from './CETColorsData.json';

let newColors = {}
function processColors(colorsData) {
    let processedColors = {};
    for(let name of Object.keys(colorsData)) {
        //capitalize first letter and add interpolate to name start
        let newName = name.charAt(0).toUpperCase() + name.slice(1);
        newName = "interpolate" + newName;
        let textData = colorsData[name];
        let process = (d) => d3.dsvFormat(" ").parseRows(d, d => d3.rgb(d[0], d[1], d[2]));
        let process2 = ((l) => (t) => l[Math.floor(t * (l.length - 1e-7))]);
        let color = process2(process(textData));
        processedColors[newName] = color;
    }
    return processedColors;
}

Object.assign(newColors, processColors(cmasherColorsJSONData));
Object.assign(newColors, processColors(CETColorsData));

// for each colormap also create the reverse
for (let name of Object.keys(newColors)) {
    // only if interpolate type
    if (!name.startsWith("interpolate")) continue;
    let color = newColors[name];
    // append (r) to name
    let reverseName = name + "(r)";
    newColors[reverseName] = (t) => color(1 - t);
}

// let names = "amber amethyst apple arctic bubblegum chroma copper cosmic dusk eclipse ember emerald emergency fall flamingo freeze fusion gem ghostlight gothic guppy holly horizon iceburn infinity jungle lavender lilac neon neutral nuclear ocean pepper pride prinsenvlag rainforest redshift sapphire savanna seasons seaweed sepia sunburst swamp torch toxic tree tropical viola voltage waterlily watermelon wildfire".split(
//     / /
//   )

// cmasherColorsData = {}

// for(let name of names) {
//     //capitalize first letter and add interpolate to name start
//     let newName = name.charAt(0).toUpperCase() + name.slice(1)
//     newName = "interpolate" + newName
//     cmasherColorsData[newName] = await d3.text(
//         `https://raw.githubusercontent.com/1313e/CMasher/master/cmasher/colormaps/${name}/${name}_8bit.txt`
//       )
// }
// // Using nodejs save cmasherColorsData to file "cmasherColorsData.js"
// const fs = require('fs');
// fs.writeFile("cmasherColorsData.js", JSON.stringify(cmasherColorsData), function(err) {
//     if(err) {
//         return console.log(err);
//     }
//     console.log("The file was saved!");
// });


let schemeOrangeGrayBlue3 = [
    // Three matching and beautiful colors based on Blue, Gray and Red
    // 
    "#ff7f0e",
    "#888888",
    "#1f77b4",
];

// lut = (name) =>d3.text(
//       `https://raw.githubusercontent.com/1313e/CMasher/master/cmasher/colormaps/${name}/${name}_8bit.txt`
//     ).then(d => d3.dsvFormat(" ").parseRows(d, d => d3.rgb(d[0], d[1], d[2]))).then((l) => (t) => l[Math.floor(t * (l.length - 1e-7))])
Object.assign(newColors, {
    schemeCategory18,
    schemeOrangeGrayBlue3,
    schemeRugzo4,
    schemeCells,
    schemeCellsNew,
    // lut,
    // names
})
export default newColors;
