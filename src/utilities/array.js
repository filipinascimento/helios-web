// /** @module utilities/array */

// /**
//  * A instance of a TypedArray.
//  * @typedef {(Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|Float32Array|Float64Array|BigInt64Array|BigUint64Array)} TypedArray
//  */

// /**
//  * Types of TypedArrays.
//  * @type {TypedArray[]}
//  * @constant
//  */
// const arrayTypes = [
// 	Int8Array,
// 	Uint8Array,
// 	Uint8ClampedArray,
// 	Int16Array,
// 	Uint16Array,
// 	Int32Array,
// 	Uint32Array,
// 	Float32Array,
// 	Float64Array,
// 	BigInt64Array,
// 	BigUint64Array
// ]


// /**
//  * Get the capacity of a typed array based on the original buffer size
//  * @param {TypedArray} TypedArray - The type of array
//  * @returns {number} - The capacity of the array
//  * @example
//  * const array = new Uint8Array(100);
//  * const capacity = getArrayCapacity(array);
//  * 
//  */
// function getArrayCapacity(typedArray){
// 	const bytesPerElement = typedArray.BYTES_PER_ELEMENT;
// 	const originalBuffer = typedArray.buffer;
// 	return originalBuffer.byteLength / bytesPerElement;
// }

// /**
//  * Create a new typed array with a given size and capacity.
//  * @param {typeof TypedArray} arrayType - The type of array
//  * @param {number} capacity - The capacity of the array
//  * @param {number=} size - The size of the array. If not supplied the size will be 0
//  * @returns {TypedArray} - The new array of type TypedArray
//  * @example
//  * const array = createArrayWithCapacity(Uint8Array, 100, 50);
//  * getArrayCapacity(array); //100
//  * array.length; //50
//  */
// function createArrayWithCapacity(arrayType, capacity, size){
// 	if(size === undefined){
// 		size = 0;
// 	}
// 	const bytesPerElement = arrayType.BYTES_PER_ELEMENT;
// 	const buffer = new ArrayBuffer(bytesPerElement * capacity);
// 	return new arrayType(buffer,0,size);
// }

// /**
//  * Resize a typed array to a new capacity.
//  * @param {TypedArray} typedArray - The array to resize
//  * @param {number} newCapacity - The new capacity of the array
//  * @param {number} newSize - The new size of the array. If not provided, the size will be the same as the current size.
//  * @returns {TypedArray} - The resized array
//  */
// function resizeArrayToCapacity(typedArray, newCapacity, newSize) {
// 	if(newSize === undefined){
// 		newSize = typedArray.length;
// 	}
// 	const newTypedArray = new typedArray.constructor(newCapacity);
// 	newTypedArray.set(typedArray);
// 	return newTypedArray.subarray(0, newSize);
// }

// const capacityFactor = 2;
// const capacityIncrement = 1;

// /**
//  * Resize a typed array to a new size.
//  * @param {TypedArray} typedArray - The array to resize
//  * @param {number} newSize - The new size of the array
//  * @returns {TypedArray} - The resized array
//  * @example
//  * let array = new Uint8Array(100);
//  * array = resizeArray(array, 200);
//  */
// function resizeArray(typedArray, newSize) {
// 	if (newSize <= typedArray.length){
// 		return typedArray.subarray(0,newSize);
// 	}
// 	const originalCapacity = getArrayCapacity(typedArray);
// 	if(newSize <= originalCapacity){ //still fits, but requires a new view
// 		return new typedArray.constructor(typedArray.buffer,0,newSize);
// 	}
// 	const newCapacity = newSize*capacityFactor + capacityIncrement;
// 	return resizeArrayToCapacity(typedArray, newCapacity,newSize);
// }

// /**
//  * Pack a typed array to its size (capacity will be equal to size).
//  * @param {TypedArray} typedArray - The array to resize
//  * @returns {TypedArray} - The resized array
//  * @example
//  * let array = new Uint8Array(100);
//  * array = resizeArray(array, 20);
//  * array = packArrayBuffer(array);
//  * getArrayCapacity(array); //20
//  */
// function packArray(typedArray) {
// 	return resizeArrayToCapacity(typedArray, typedArray.length, typedArray.length);
// }


// export {
// 	arrayTypes,
// 	resizeArray,
// 	createArrayWithCapacity,
// 	getArrayCapacity,
// 	resizeArrayToCapacity,
// 	packArray
// };