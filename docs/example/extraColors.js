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


import {default as cmasherColorsJSONData} from './cmasherColorsData.json';

let cmasherColors = {}
for(let name of Object.keys(cmasherColorsJSONData)) {
    //capitalize first letter and add interpolate to name start
    let newName = name.charAt(0).toUpperCase() + name.slice(1)
    newName = "interpolate" + newName
    let textData = cmasherColorsJSONData[name]
    let process = (d) => d3.dsvFormat(" ").parseRows(d, d => d3.rgb(d[0], d[1], d[2]))
    let process2 = ((l) => (t) => l[Math.floor(t * (l.length - 1e-7))])
    let color = process2(process(textData))
    cmasherColors[newName] = color
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




// lut = (name) =>d3.text(
//       `https://raw.githubusercontent.com/1313e/CMasher/master/cmasher/colormaps/${name}/${name}_8bit.txt`
//     ).then(d => d3.dsvFormat(" ").parseRows(d, d => d3.rgb(d[0], d[1], d[2]))).then((l) => (t) => l[Math.floor(t * (l.length - 1e-7))])
Object.assign(cmasherColors, {
    schemeCategory18,
    // lut,
    // names
})
export default cmasherColors;
