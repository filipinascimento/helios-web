import * as helios from "../Core/heliosTest"


// floatArray[index] = floatArray[index] + v1x - v1y + v1z;
// index = (index + 1) % defaultCount;

let v1 = new helios.CVec(1,2,3);
let v2 = new helios.CVec(4,5,6);

v1.add(v2);
v1.normalize();
v1.cross(v2);


console.log(`${v1.x} ${v1.y} ${v1.z}`)
// floatArray[index] = floatArray[index] + v1.x - v1.y + v1.z;
// index = (index + 1) % defaultCount;

