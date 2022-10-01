import { expect,it } from 'vitest';

import * as arrayUtils from "../src/utilities/array.js";


it('Array buffer capacity', () => {
	for(let arrayType of arrayUtils.arrayTypes) {
		let array = arrayUtils.createArrayWithCapacity(arrayType,100)
		expect(array).to.be.an.instanceof(arrayType);
	}
});


it('Array buffer checking capacity', () => {
	for(let arrayType of arrayUtils.arrayTypes) {
		const originalCapacity = 100;
		//size 0
		let array = arrayUtils.createArrayWithCapacity(arrayType,originalCapacity);
		expect(arrayUtils.getArrayCapacity(array)).to.equal(originalCapacity);
		expect(array.length).to.equal(0);
	}
});


it('Array buffer resize to same size', () => {
	for(let arrayType of arrayUtils.arrayTypes) {
		const originalCapacity = 100;
		const originalSize = originalCapacity;
		let array = arrayUtils.createArrayWithCapacity(arrayType,originalCapacity,originalCapacity);
		array = arrayUtils.resizeArray(array, originalSize);
		expect(array.length).to.equal(originalSize);
	}
});


it('Array buffer resize to a larger size', () => {
	for(let arrayType of arrayUtils.arrayTypes) {
		const originalCapacity = 100;
		const originalSize = originalCapacity;
		let array = arrayUtils.createArrayWithCapacity(arrayType,originalCapacity,originalCapacity);
		array = arrayUtils.resizeArray(array, originalSize);
		expect(array.length).to.equal(originalSize);

		// resize to a larger size
		let newSize = 90;
		array = arrayUtils.resizeArray(array, newSize);
		expect(array.length).to.equal(newSize);
	}
});


it('Array buffer resize to a smaller size', () => {
	for(let arrayType of arrayUtils.arrayTypes) {
		const originalCapacity = 100;
		const originalSize = originalCapacity;
		let array = arrayUtils.createArrayWithCapacity(arrayType,originalCapacity,originalCapacity);
		array = arrayUtils.resizeArray(array, originalSize);
		expect(array.length).to.equal(originalSize);

		// resize to a smaller size
		let newSize = 2;
		array = arrayUtils.resizeArray(array, newSize);
		expect(array.length).to.equal(newSize);
	}
});


it('Array buffer resize to a larger and then smaller size and pack', () => {
	for(let arrayType of arrayUtils.arrayTypes) {
		const originalCapacity = 100;
		const originalSize = originalCapacity;
		let array = arrayUtils.createArrayWithCapacity(arrayType,originalCapacity,originalCapacity);
		array = arrayUtils.resizeArray(array, originalSize);
		expect(array.length).to.equal(originalSize);

		// resize to an even larger size
		let newSize = 1000;
		array = arrayUtils.resizeArray(array, newSize);
		expect(array.length).to.equal(newSize);

		// resize to a smaller size and pack
		newSize = 2;
		array = arrayUtils.resizeArray(array, newSize);
		expect(array.length).to.equal(newSize);
		array = arrayUtils.packArray(array);
		expect(arrayUtils.getArrayCapacity(array)).to.equal(array.length);
	}
});


it('Array buffer misc operations', () => {
	for(let arrayType of arrayUtils.arrayTypes) {
		const originalCapacity = 100;
		//size 0
		let array = arrayUtils.createArrayWithCapacity(arrayType,originalCapacity);
		expect(arrayUtils.getArrayCapacity(array)).to.equal(originalCapacity);
		expect(array.length).to.equal(0);
		let originalSize = 10;
		// resize to a size
		array = arrayUtils.resizeArray(array, originalSize);
		expect(array.length).to.equal(originalSize);

		// resize to the same size
		array = arrayUtils.resizeArray(array, originalSize);
		expect(array.length).to.equal(originalSize);

		// resize to a larger size
		let newSize = 90;
		array = arrayUtils.resizeArray(array, newSize);
		expect(array.length).to.equal(newSize);
		
		// resize to a smaller size
		newSize = 2;
		array = arrayUtils.resizeArray(array, newSize);
		expect(array.length).to.equal(newSize);

		// resize to an even larger size
		newSize = 1000;
		array = arrayUtils.resizeArray(array, newSize);
		expect(array.length).to.equal(newSize);

		// resize to a smaller size and pack
		newSize = 2;
		array = arrayUtils.resizeArray(array, newSize);
		expect(array.length).to.equal(newSize);
		array = arrayUtils.packArray(array);
		expect(arrayUtils.getArrayCapacity(array)).to.equal(array.length);
	}
});


