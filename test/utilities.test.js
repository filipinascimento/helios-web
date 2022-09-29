import { expect } from 'chai';

import * as glUtils from "../src/utils/webglutils.js";

it('Checking array types', () => {
    // expect(1 + 2).to.equal(3);
    const arrayTypes = [
        Uint8Array,
        Uint16Array,
        Uint32Array,
        Int8Array,
        Int16Array,
        Int32Array,
        Float32Array,
        Float64Array
    ];
    for(let arrayType of arrayTypes) {
        let array = glUtils.createArrayWithCapacity(arrayType,100)
        expect(array).to.be.an.instanceof(arrayType);
    }
});


it('Resizing arrays', () => {
    // expect(1 + 2).to.equal(3);
    // const arrayTypes = [
    //     Uint8Array,
    //     Uint16Array,
    //     Uint32Array,
    //     Int8Array,
    //     Int16Array,
    //     Int32Array,
    //     Float32Array,
    //     Float64Array
    // ];
    expect(1).to.equal(2);

    // for(let arrayType of arrayTypes) {
    //     const originalSize = 100;
    //     let array = glUtils.createArrayWithCapacity(arrayType,originalSize)
    //     // array = glUtils.resizeArrayToCapacity(array,originalSize*2);
    //     // expect(array.length).to.equal(originalSize);
    //     // let arrayCapacity = glUtils.getArrayCapacity(array);
    //     // expect(arrayCapacity).to.equal(originalSize*2);
    // }
});


