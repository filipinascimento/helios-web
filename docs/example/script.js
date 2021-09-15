var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};

// build/_snowpack/env.js
var env_exports = {};
__export(env_exports, {
  MODE: () => MODE,
  NODE_ENV: () => NODE_ENV,
  SSR: () => SSR
});
var MODE = "production";
var NODE_ENV = "production";
var SSR = false;

// build/_snowpack/pkg/gl-matrix.js
var EPSILON = 1e-6;
var ARRAY_TYPE = typeof Float32Array !== "undefined" ? Float32Array : Array;
var RANDOM = Math.random;
var degree = Math.PI / 180;
if (!Math.hypot)
  Math.hypot = function() {
    var y = 0, i = arguments.length;
    while (i--) {
      y += arguments[i] * arguments[i];
    }
    return Math.sqrt(y);
  };
function create$2() {
  var out = new ARRAY_TYPE(9);
  if (ARRAY_TYPE != Float32Array) {
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
  }
  out[0] = 1;
  out[4] = 1;
  out[8] = 1;
  return out;
}
function fromMat4(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[4];
  out[4] = a[5];
  out[5] = a[6];
  out[6] = a[8];
  out[7] = a[9];
  out[8] = a[10];
  return out;
}
function clone$2(a) {
  var out = new ARRAY_TYPE(9);
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  return out;
}
function copy$2(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  return out;
}
function fromValues$2(m00, m01, m02, m10, m11, m12, m20, m21, m22) {
  var out = new ARRAY_TYPE(9);
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m10;
  out[4] = m11;
  out[5] = m12;
  out[6] = m20;
  out[7] = m21;
  out[8] = m22;
  return out;
}
function set$2(out, m00, m01, m02, m10, m11, m12, m20, m21, m22) {
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m10;
  out[4] = m11;
  out[5] = m12;
  out[6] = m20;
  out[7] = m21;
  out[8] = m22;
  return out;
}
function identity$2(out) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 1;
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;
  out[8] = 1;
  return out;
}
function transpose$1(out, a) {
  if (out === a) {
    var a01 = a[1], a02 = a[2], a12 = a[5];
    out[1] = a[3];
    out[2] = a[6];
    out[3] = a01;
    out[5] = a[7];
    out[6] = a02;
    out[7] = a12;
  } else {
    out[0] = a[0];
    out[1] = a[3];
    out[2] = a[6];
    out[3] = a[1];
    out[4] = a[4];
    out[5] = a[7];
    out[6] = a[2];
    out[7] = a[5];
    out[8] = a[8];
  }
  return out;
}
function invert$2(out, a) {
  var a00 = a[0], a01 = a[1], a02 = a[2];
  var a10 = a[3], a11 = a[4], a12 = a[5];
  var a20 = a[6], a21 = a[7], a22 = a[8];
  var b01 = a22 * a11 - a12 * a21;
  var b11 = -a22 * a10 + a12 * a20;
  var b21 = a21 * a10 - a11 * a20;
  var det = a00 * b01 + a01 * b11 + a02 * b21;
  if (!det) {
    return null;
  }
  det = 1 / det;
  out[0] = b01 * det;
  out[1] = (-a22 * a01 + a02 * a21) * det;
  out[2] = (a12 * a01 - a02 * a11) * det;
  out[3] = b11 * det;
  out[4] = (a22 * a00 - a02 * a20) * det;
  out[5] = (-a12 * a00 + a02 * a10) * det;
  out[6] = b21 * det;
  out[7] = (-a21 * a00 + a01 * a20) * det;
  out[8] = (a11 * a00 - a01 * a10) * det;
  return out;
}
function adjoint$1(out, a) {
  var a00 = a[0], a01 = a[1], a02 = a[2];
  var a10 = a[3], a11 = a[4], a12 = a[5];
  var a20 = a[6], a21 = a[7], a22 = a[8];
  out[0] = a11 * a22 - a12 * a21;
  out[1] = a02 * a21 - a01 * a22;
  out[2] = a01 * a12 - a02 * a11;
  out[3] = a12 * a20 - a10 * a22;
  out[4] = a00 * a22 - a02 * a20;
  out[5] = a02 * a10 - a00 * a12;
  out[6] = a10 * a21 - a11 * a20;
  out[7] = a01 * a20 - a00 * a21;
  out[8] = a00 * a11 - a01 * a10;
  return out;
}
function determinant$2(a) {
  var a00 = a[0], a01 = a[1], a02 = a[2];
  var a10 = a[3], a11 = a[4], a12 = a[5];
  var a20 = a[6], a21 = a[7], a22 = a[8];
  return a00 * (a22 * a11 - a12 * a21) + a01 * (-a22 * a10 + a12 * a20) + a02 * (a21 * a10 - a11 * a20);
}
function multiply$2(out, a, b) {
  var a00 = a[0], a01 = a[1], a02 = a[2];
  var a10 = a[3], a11 = a[4], a12 = a[5];
  var a20 = a[6], a21 = a[7], a22 = a[8];
  var b00 = b[0], b01 = b[1], b02 = b[2];
  var b10 = b[3], b11 = b[4], b12 = b[5];
  var b20 = b[6], b21 = b[7], b22 = b[8];
  out[0] = b00 * a00 + b01 * a10 + b02 * a20;
  out[1] = b00 * a01 + b01 * a11 + b02 * a21;
  out[2] = b00 * a02 + b01 * a12 + b02 * a22;
  out[3] = b10 * a00 + b11 * a10 + b12 * a20;
  out[4] = b10 * a01 + b11 * a11 + b12 * a21;
  out[5] = b10 * a02 + b11 * a12 + b12 * a22;
  out[6] = b20 * a00 + b21 * a10 + b22 * a20;
  out[7] = b20 * a01 + b21 * a11 + b22 * a21;
  out[8] = b20 * a02 + b21 * a12 + b22 * a22;
  return out;
}
function translate$1(out, a, v) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a10 = a[3], a11 = a[4], a12 = a[5], a20 = a[6], a21 = a[7], a22 = a[8], x = v[0], y = v[1];
  out[0] = a00;
  out[1] = a01;
  out[2] = a02;
  out[3] = a10;
  out[4] = a11;
  out[5] = a12;
  out[6] = x * a00 + y * a10 + a20;
  out[7] = x * a01 + y * a11 + a21;
  out[8] = x * a02 + y * a12 + a22;
  return out;
}
function rotate$2(out, a, rad) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a10 = a[3], a11 = a[4], a12 = a[5], a20 = a[6], a21 = a[7], a22 = a[8], s = Math.sin(rad), c2 = Math.cos(rad);
  out[0] = c2 * a00 + s * a10;
  out[1] = c2 * a01 + s * a11;
  out[2] = c2 * a02 + s * a12;
  out[3] = c2 * a10 - s * a00;
  out[4] = c2 * a11 - s * a01;
  out[5] = c2 * a12 - s * a02;
  out[6] = a20;
  out[7] = a21;
  out[8] = a22;
  return out;
}
function scale$2(out, a, v) {
  var x = v[0], y = v[1];
  out[0] = x * a[0];
  out[1] = x * a[1];
  out[2] = x * a[2];
  out[3] = y * a[3];
  out[4] = y * a[4];
  out[5] = y * a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  return out;
}
function fromTranslation$1(out, v) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 1;
  out[5] = 0;
  out[6] = v[0];
  out[7] = v[1];
  out[8] = 1;
  return out;
}
function fromRotation$2(out, rad) {
  var s = Math.sin(rad), c2 = Math.cos(rad);
  out[0] = c2;
  out[1] = s;
  out[2] = 0;
  out[3] = -s;
  out[4] = c2;
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;
  out[8] = 1;
  return out;
}
function fromScaling$2(out, v) {
  out[0] = v[0];
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = v[1];
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;
  out[8] = 1;
  return out;
}
function fromMat2d(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = 0;
  out[3] = a[2];
  out[4] = a[3];
  out[5] = 0;
  out[6] = a[4];
  out[7] = a[5];
  out[8] = 1;
  return out;
}
function fromQuat(out, q) {
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;
  var xx = x * x2;
  var yx = y * x2;
  var yy = y * y2;
  var zx = z * x2;
  var zy = z * y2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;
  out[0] = 1 - yy - zz;
  out[3] = yx - wz;
  out[6] = zx + wy;
  out[1] = yx + wz;
  out[4] = 1 - xx - zz;
  out[7] = zy - wx;
  out[2] = zx - wy;
  out[5] = zy + wx;
  out[8] = 1 - xx - yy;
  return out;
}
function normalFromMat4(out, a) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  var b00 = a00 * a11 - a01 * a10;
  var b01 = a00 * a12 - a02 * a10;
  var b02 = a00 * a13 - a03 * a10;
  var b03 = a01 * a12 - a02 * a11;
  var b04 = a01 * a13 - a03 * a11;
  var b05 = a02 * a13 - a03 * a12;
  var b06 = a20 * a31 - a21 * a30;
  var b07 = a20 * a32 - a22 * a30;
  var b08 = a20 * a33 - a23 * a30;
  var b09 = a21 * a32 - a22 * a31;
  var b10 = a21 * a33 - a23 * a31;
  var b11 = a22 * a33 - a23 * a32;
  var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) {
    return null;
  }
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[2] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[3] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[4] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[5] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[6] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[7] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[8] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  return out;
}
function projection(out, width, height) {
  out[0] = 2 / width;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = -2 / height;
  out[5] = 0;
  out[6] = -1;
  out[7] = 1;
  out[8] = 1;
  return out;
}
function str$2(a) {
  return "mat3(" + a[0] + ", " + a[1] + ", " + a[2] + ", " + a[3] + ", " + a[4] + ", " + a[5] + ", " + a[6] + ", " + a[7] + ", " + a[8] + ")";
}
function frob$2(a) {
  return Math.hypot(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]);
}
function add$2(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  out[3] = a[3] + b[3];
  out[4] = a[4] + b[4];
  out[5] = a[5] + b[5];
  out[6] = a[6] + b[6];
  out[7] = a[7] + b[7];
  out[8] = a[8] + b[8];
  return out;
}
function subtract$2(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  out[3] = a[3] - b[3];
  out[4] = a[4] - b[4];
  out[5] = a[5] - b[5];
  out[6] = a[6] - b[6];
  out[7] = a[7] - b[7];
  out[8] = a[8] - b[8];
  return out;
}
function multiplyScalar$2(out, a, b) {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  out[3] = a[3] * b;
  out[4] = a[4] * b;
  out[5] = a[5] * b;
  out[6] = a[6] * b;
  out[7] = a[7] * b;
  out[8] = a[8] * b;
  return out;
}
function multiplyScalarAndAdd$2(out, a, b, scale) {
  out[0] = a[0] + b[0] * scale;
  out[1] = a[1] + b[1] * scale;
  out[2] = a[2] + b[2] * scale;
  out[3] = a[3] + b[3] * scale;
  out[4] = a[4] + b[4] * scale;
  out[5] = a[5] + b[5] * scale;
  out[6] = a[6] + b[6] * scale;
  out[7] = a[7] + b[7] * scale;
  out[8] = a[8] + b[8] * scale;
  return out;
}
function exactEquals$2(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5] && a[6] === b[6] && a[7] === b[7] && a[8] === b[8];
}
function equals$3(a, b) {
  var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7], a8 = a[8];
  var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7], b8 = b[8];
  return Math.abs(a0 - b0) <= EPSILON * Math.max(1, Math.abs(a0), Math.abs(b0)) && Math.abs(a1 - b1) <= EPSILON * Math.max(1, Math.abs(a1), Math.abs(b1)) && Math.abs(a2 - b2) <= EPSILON * Math.max(1, Math.abs(a2), Math.abs(b2)) && Math.abs(a3 - b3) <= EPSILON * Math.max(1, Math.abs(a3), Math.abs(b3)) && Math.abs(a4 - b4) <= EPSILON * Math.max(1, Math.abs(a4), Math.abs(b4)) && Math.abs(a5 - b5) <= EPSILON * Math.max(1, Math.abs(a5), Math.abs(b5)) && Math.abs(a6 - b6) <= EPSILON * Math.max(1, Math.abs(a6), Math.abs(b6)) && Math.abs(a7 - b7) <= EPSILON * Math.max(1, Math.abs(a7), Math.abs(b7)) && Math.abs(a8 - b8) <= EPSILON * Math.max(1, Math.abs(a8), Math.abs(b8));
}
var mul$2 = multiply$2;
var sub$2 = subtract$2;
var mat3 = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  create: create$2,
  fromMat4,
  clone: clone$2,
  copy: copy$2,
  fromValues: fromValues$2,
  set: set$2,
  identity: identity$2,
  transpose: transpose$1,
  invert: invert$2,
  adjoint: adjoint$1,
  determinant: determinant$2,
  multiply: multiply$2,
  translate: translate$1,
  rotate: rotate$2,
  scale: scale$2,
  fromTranslation: fromTranslation$1,
  fromRotation: fromRotation$2,
  fromScaling: fromScaling$2,
  fromMat2d,
  fromQuat,
  normalFromMat4,
  projection,
  str: str$2,
  frob: frob$2,
  add: add$2,
  subtract: subtract$2,
  multiplyScalar: multiplyScalar$2,
  multiplyScalarAndAdd: multiplyScalarAndAdd$2,
  exactEquals: exactEquals$2,
  equals: equals$3,
  mul: mul$2,
  sub: sub$2
});
function create$3() {
  var out = new ARRAY_TYPE(16);
  if (ARRAY_TYPE != Float32Array) {
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
  }
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}
function clone$3(a) {
  var out = new ARRAY_TYPE(16);
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  out[9] = a[9];
  out[10] = a[10];
  out[11] = a[11];
  out[12] = a[12];
  out[13] = a[13];
  out[14] = a[14];
  out[15] = a[15];
  return out;
}
function copy$3(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  out[9] = a[9];
  out[10] = a[10];
  out[11] = a[11];
  out[12] = a[12];
  out[13] = a[13];
  out[14] = a[14];
  out[15] = a[15];
  return out;
}
function fromValues$3(m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33) {
  var out = new ARRAY_TYPE(16);
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m03;
  out[4] = m10;
  out[5] = m11;
  out[6] = m12;
  out[7] = m13;
  out[8] = m20;
  out[9] = m21;
  out[10] = m22;
  out[11] = m23;
  out[12] = m30;
  out[13] = m31;
  out[14] = m32;
  out[15] = m33;
  return out;
}
function set$3(out, m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33) {
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m03;
  out[4] = m10;
  out[5] = m11;
  out[6] = m12;
  out[7] = m13;
  out[8] = m20;
  out[9] = m21;
  out[10] = m22;
  out[11] = m23;
  out[12] = m30;
  out[13] = m31;
  out[14] = m32;
  out[15] = m33;
  return out;
}
function identity$3(out) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function transpose$2(out, a) {
  if (out === a) {
    var a01 = a[1], a02 = a[2], a03 = a[3];
    var a12 = a[6], a13 = a[7];
    var a23 = a[11];
    out[1] = a[4];
    out[2] = a[8];
    out[3] = a[12];
    out[4] = a01;
    out[6] = a[9];
    out[7] = a[13];
    out[8] = a02;
    out[9] = a12;
    out[11] = a[14];
    out[12] = a03;
    out[13] = a13;
    out[14] = a23;
  } else {
    out[0] = a[0];
    out[1] = a[4];
    out[2] = a[8];
    out[3] = a[12];
    out[4] = a[1];
    out[5] = a[5];
    out[6] = a[9];
    out[7] = a[13];
    out[8] = a[2];
    out[9] = a[6];
    out[10] = a[10];
    out[11] = a[14];
    out[12] = a[3];
    out[13] = a[7];
    out[14] = a[11];
    out[15] = a[15];
  }
  return out;
}
function invert$3(out, a) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  var b00 = a00 * a11 - a01 * a10;
  var b01 = a00 * a12 - a02 * a10;
  var b02 = a00 * a13 - a03 * a10;
  var b03 = a01 * a12 - a02 * a11;
  var b04 = a01 * a13 - a03 * a11;
  var b05 = a02 * a13 - a03 * a12;
  var b06 = a20 * a31 - a21 * a30;
  var b07 = a20 * a32 - a22 * a30;
  var b08 = a20 * a33 - a23 * a30;
  var b09 = a21 * a32 - a22 * a31;
  var b10 = a21 * a33 - a23 * a31;
  var b11 = a22 * a33 - a23 * a32;
  var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) {
    return null;
  }
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}
function adjoint$2(out, a) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  out[0] = a11 * (a22 * a33 - a23 * a32) - a21 * (a12 * a33 - a13 * a32) + a31 * (a12 * a23 - a13 * a22);
  out[1] = -(a01 * (a22 * a33 - a23 * a32) - a21 * (a02 * a33 - a03 * a32) + a31 * (a02 * a23 - a03 * a22));
  out[2] = a01 * (a12 * a33 - a13 * a32) - a11 * (a02 * a33 - a03 * a32) + a31 * (a02 * a13 - a03 * a12);
  out[3] = -(a01 * (a12 * a23 - a13 * a22) - a11 * (a02 * a23 - a03 * a22) + a21 * (a02 * a13 - a03 * a12));
  out[4] = -(a10 * (a22 * a33 - a23 * a32) - a20 * (a12 * a33 - a13 * a32) + a30 * (a12 * a23 - a13 * a22));
  out[5] = a00 * (a22 * a33 - a23 * a32) - a20 * (a02 * a33 - a03 * a32) + a30 * (a02 * a23 - a03 * a22);
  out[6] = -(a00 * (a12 * a33 - a13 * a32) - a10 * (a02 * a33 - a03 * a32) + a30 * (a02 * a13 - a03 * a12));
  out[7] = a00 * (a12 * a23 - a13 * a22) - a10 * (a02 * a23 - a03 * a22) + a20 * (a02 * a13 - a03 * a12);
  out[8] = a10 * (a21 * a33 - a23 * a31) - a20 * (a11 * a33 - a13 * a31) + a30 * (a11 * a23 - a13 * a21);
  out[9] = -(a00 * (a21 * a33 - a23 * a31) - a20 * (a01 * a33 - a03 * a31) + a30 * (a01 * a23 - a03 * a21));
  out[10] = a00 * (a11 * a33 - a13 * a31) - a10 * (a01 * a33 - a03 * a31) + a30 * (a01 * a13 - a03 * a11);
  out[11] = -(a00 * (a11 * a23 - a13 * a21) - a10 * (a01 * a23 - a03 * a21) + a20 * (a01 * a13 - a03 * a11));
  out[12] = -(a10 * (a21 * a32 - a22 * a31) - a20 * (a11 * a32 - a12 * a31) + a30 * (a11 * a22 - a12 * a21));
  out[13] = a00 * (a21 * a32 - a22 * a31) - a20 * (a01 * a32 - a02 * a31) + a30 * (a01 * a22 - a02 * a21);
  out[14] = -(a00 * (a11 * a32 - a12 * a31) - a10 * (a01 * a32 - a02 * a31) + a30 * (a01 * a12 - a02 * a11));
  out[15] = a00 * (a11 * a22 - a12 * a21) - a10 * (a01 * a22 - a02 * a21) + a20 * (a01 * a12 - a02 * a11);
  return out;
}
function determinant$3(a) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  var b00 = a00 * a11 - a01 * a10;
  var b01 = a00 * a12 - a02 * a10;
  var b02 = a00 * a13 - a03 * a10;
  var b03 = a01 * a12 - a02 * a11;
  var b04 = a01 * a13 - a03 * a11;
  var b05 = a02 * a13 - a03 * a12;
  var b06 = a20 * a31 - a21 * a30;
  var b07 = a20 * a32 - a22 * a30;
  var b08 = a20 * a33 - a23 * a30;
  var b09 = a21 * a32 - a22 * a31;
  var b10 = a21 * a33 - a23 * a31;
  var b11 = a22 * a33 - a23 * a32;
  return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
}
function multiply$3(out, a, b) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  b0 = b[4];
  b1 = b[5];
  b2 = b[6];
  b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  b0 = b[8];
  b1 = b[9];
  b2 = b[10];
  b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  b0 = b[12];
  b1 = b[13];
  b2 = b[14];
  b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  return out;
}
function translate$2(out, a, v) {
  var x = v[0], y = v[1], z = v[2];
  var a00, a01, a02, a03;
  var a10, a11, a12, a13;
  var a20, a21, a22, a23;
  if (a === out) {
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
  } else {
    a00 = a[0];
    a01 = a[1];
    a02 = a[2];
    a03 = a[3];
    a10 = a[4];
    a11 = a[5];
    a12 = a[6];
    a13 = a[7];
    a20 = a[8];
    a21 = a[9];
    a22 = a[10];
    a23 = a[11];
    out[0] = a00;
    out[1] = a01;
    out[2] = a02;
    out[3] = a03;
    out[4] = a10;
    out[5] = a11;
    out[6] = a12;
    out[7] = a13;
    out[8] = a20;
    out[9] = a21;
    out[10] = a22;
    out[11] = a23;
    out[12] = a00 * x + a10 * y + a20 * z + a[12];
    out[13] = a01 * x + a11 * y + a21 * z + a[13];
    out[14] = a02 * x + a12 * y + a22 * z + a[14];
    out[15] = a03 * x + a13 * y + a23 * z + a[15];
  }
  return out;
}
function scale$3(out, a, v) {
  var x = v[0], y = v[1], z = v[2];
  out[0] = a[0] * x;
  out[1] = a[1] * x;
  out[2] = a[2] * x;
  out[3] = a[3] * x;
  out[4] = a[4] * y;
  out[5] = a[5] * y;
  out[6] = a[6] * y;
  out[7] = a[7] * y;
  out[8] = a[8] * z;
  out[9] = a[9] * z;
  out[10] = a[10] * z;
  out[11] = a[11] * z;
  out[12] = a[12];
  out[13] = a[13];
  out[14] = a[14];
  out[15] = a[15];
  return out;
}
function rotate$3(out, a, rad, axis) {
  var x = axis[0], y = axis[1], z = axis[2];
  var len2 = Math.hypot(x, y, z);
  var s, c2, t;
  var a00, a01, a02, a03;
  var a10, a11, a12, a13;
  var a20, a21, a22, a23;
  var b00, b01, b02;
  var b10, b11, b12;
  var b20, b21, b22;
  if (len2 < EPSILON) {
    return null;
  }
  len2 = 1 / len2;
  x *= len2;
  y *= len2;
  z *= len2;
  s = Math.sin(rad);
  c2 = Math.cos(rad);
  t = 1 - c2;
  a00 = a[0];
  a01 = a[1];
  a02 = a[2];
  a03 = a[3];
  a10 = a[4];
  a11 = a[5];
  a12 = a[6];
  a13 = a[7];
  a20 = a[8];
  a21 = a[9];
  a22 = a[10];
  a23 = a[11];
  b00 = x * x * t + c2;
  b01 = y * x * t + z * s;
  b02 = z * x * t - y * s;
  b10 = x * y * t - z * s;
  b11 = y * y * t + c2;
  b12 = z * y * t + x * s;
  b20 = x * z * t + y * s;
  b21 = y * z * t - x * s;
  b22 = z * z * t + c2;
  out[0] = a00 * b00 + a10 * b01 + a20 * b02;
  out[1] = a01 * b00 + a11 * b01 + a21 * b02;
  out[2] = a02 * b00 + a12 * b01 + a22 * b02;
  out[3] = a03 * b00 + a13 * b01 + a23 * b02;
  out[4] = a00 * b10 + a10 * b11 + a20 * b12;
  out[5] = a01 * b10 + a11 * b11 + a21 * b12;
  out[6] = a02 * b10 + a12 * b11 + a22 * b12;
  out[7] = a03 * b10 + a13 * b11 + a23 * b12;
  out[8] = a00 * b20 + a10 * b21 + a20 * b22;
  out[9] = a01 * b20 + a11 * b21 + a21 * b22;
  out[10] = a02 * b20 + a12 * b21 + a22 * b22;
  out[11] = a03 * b20 + a13 * b21 + a23 * b22;
  if (a !== out) {
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }
  return out;
}
function rotateX(out, a, rad) {
  var s = Math.sin(rad);
  var c2 = Math.cos(rad);
  var a10 = a[4];
  var a11 = a[5];
  var a12 = a[6];
  var a13 = a[7];
  var a20 = a[8];
  var a21 = a[9];
  var a22 = a[10];
  var a23 = a[11];
  if (a !== out) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }
  out[4] = a10 * c2 + a20 * s;
  out[5] = a11 * c2 + a21 * s;
  out[6] = a12 * c2 + a22 * s;
  out[7] = a13 * c2 + a23 * s;
  out[8] = a20 * c2 - a10 * s;
  out[9] = a21 * c2 - a11 * s;
  out[10] = a22 * c2 - a12 * s;
  out[11] = a23 * c2 - a13 * s;
  return out;
}
function rotateY(out, a, rad) {
  var s = Math.sin(rad);
  var c2 = Math.cos(rad);
  var a00 = a[0];
  var a01 = a[1];
  var a02 = a[2];
  var a03 = a[3];
  var a20 = a[8];
  var a21 = a[9];
  var a22 = a[10];
  var a23 = a[11];
  if (a !== out) {
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }
  out[0] = a00 * c2 - a20 * s;
  out[1] = a01 * c2 - a21 * s;
  out[2] = a02 * c2 - a22 * s;
  out[3] = a03 * c2 - a23 * s;
  out[8] = a00 * s + a20 * c2;
  out[9] = a01 * s + a21 * c2;
  out[10] = a02 * s + a22 * c2;
  out[11] = a03 * s + a23 * c2;
  return out;
}
function rotateZ(out, a, rad) {
  var s = Math.sin(rad);
  var c2 = Math.cos(rad);
  var a00 = a[0];
  var a01 = a[1];
  var a02 = a[2];
  var a03 = a[3];
  var a10 = a[4];
  var a11 = a[5];
  var a12 = a[6];
  var a13 = a[7];
  if (a !== out) {
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }
  out[0] = a00 * c2 + a10 * s;
  out[1] = a01 * c2 + a11 * s;
  out[2] = a02 * c2 + a12 * s;
  out[3] = a03 * c2 + a13 * s;
  out[4] = a10 * c2 - a00 * s;
  out[5] = a11 * c2 - a01 * s;
  out[6] = a12 * c2 - a02 * s;
  out[7] = a13 * c2 - a03 * s;
  return out;
}
function fromTranslation$2(out, v) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = v[0];
  out[13] = v[1];
  out[14] = v[2];
  out[15] = 1;
  return out;
}
function fromScaling$3(out, v) {
  out[0] = v[0];
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = v[1];
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = v[2];
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function fromRotation$3(out, rad, axis) {
  var x = axis[0], y = axis[1], z = axis[2];
  var len2 = Math.hypot(x, y, z);
  var s, c2, t;
  if (len2 < EPSILON) {
    return null;
  }
  len2 = 1 / len2;
  x *= len2;
  y *= len2;
  z *= len2;
  s = Math.sin(rad);
  c2 = Math.cos(rad);
  t = 1 - c2;
  out[0] = x * x * t + c2;
  out[1] = y * x * t + z * s;
  out[2] = z * x * t - y * s;
  out[3] = 0;
  out[4] = x * y * t - z * s;
  out[5] = y * y * t + c2;
  out[6] = z * y * t + x * s;
  out[7] = 0;
  out[8] = x * z * t + y * s;
  out[9] = y * z * t - x * s;
  out[10] = z * z * t + c2;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function fromXRotation(out, rad) {
  var s = Math.sin(rad);
  var c2 = Math.cos(rad);
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = c2;
  out[6] = s;
  out[7] = 0;
  out[8] = 0;
  out[9] = -s;
  out[10] = c2;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function fromYRotation(out, rad) {
  var s = Math.sin(rad);
  var c2 = Math.cos(rad);
  out[0] = c2;
  out[1] = 0;
  out[2] = -s;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = s;
  out[9] = 0;
  out[10] = c2;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function fromZRotation(out, rad) {
  var s = Math.sin(rad);
  var c2 = Math.cos(rad);
  out[0] = c2;
  out[1] = s;
  out[2] = 0;
  out[3] = 0;
  out[4] = -s;
  out[5] = c2;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function fromRotationTranslation(out, q, v) {
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;
  var xx = x * x2;
  var xy = x * y2;
  var xz = x * z2;
  var yy = y * y2;
  var yz = y * z2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;
  out[0] = 1 - (yy + zz);
  out[1] = xy + wz;
  out[2] = xz - wy;
  out[3] = 0;
  out[4] = xy - wz;
  out[5] = 1 - (xx + zz);
  out[6] = yz + wx;
  out[7] = 0;
  out[8] = xz + wy;
  out[9] = yz - wx;
  out[10] = 1 - (xx + yy);
  out[11] = 0;
  out[12] = v[0];
  out[13] = v[1];
  out[14] = v[2];
  out[15] = 1;
  return out;
}
function fromQuat2(out, a) {
  var translation = new ARRAY_TYPE(3);
  var bx = -a[0], by = -a[1], bz = -a[2], bw = a[3], ax = a[4], ay = a[5], az = a[6], aw = a[7];
  var magnitude = bx * bx + by * by + bz * bz + bw * bw;
  if (magnitude > 0) {
    translation[0] = (ax * bw + aw * bx + ay * bz - az * by) * 2 / magnitude;
    translation[1] = (ay * bw + aw * by + az * bx - ax * bz) * 2 / magnitude;
    translation[2] = (az * bw + aw * bz + ax * by - ay * bx) * 2 / magnitude;
  } else {
    translation[0] = (ax * bw + aw * bx + ay * bz - az * by) * 2;
    translation[1] = (ay * bw + aw * by + az * bx - ax * bz) * 2;
    translation[2] = (az * bw + aw * bz + ax * by - ay * bx) * 2;
  }
  fromRotationTranslation(out, a, translation);
  return out;
}
function getTranslation(out, mat) {
  out[0] = mat[12];
  out[1] = mat[13];
  out[2] = mat[14];
  return out;
}
function getScaling(out, mat) {
  var m11 = mat[0];
  var m12 = mat[1];
  var m13 = mat[2];
  var m21 = mat[4];
  var m22 = mat[5];
  var m23 = mat[6];
  var m31 = mat[8];
  var m32 = mat[9];
  var m33 = mat[10];
  out[0] = Math.hypot(m11, m12, m13);
  out[1] = Math.hypot(m21, m22, m23);
  out[2] = Math.hypot(m31, m32, m33);
  return out;
}
function getRotation(out, mat) {
  var scaling = new ARRAY_TYPE(3);
  getScaling(scaling, mat);
  var is1 = 1 / scaling[0];
  var is2 = 1 / scaling[1];
  var is3 = 1 / scaling[2];
  var sm11 = mat[0] * is1;
  var sm12 = mat[1] * is2;
  var sm13 = mat[2] * is3;
  var sm21 = mat[4] * is1;
  var sm22 = mat[5] * is2;
  var sm23 = mat[6] * is3;
  var sm31 = mat[8] * is1;
  var sm32 = mat[9] * is2;
  var sm33 = mat[10] * is3;
  var trace = sm11 + sm22 + sm33;
  var S = 0;
  if (trace > 0) {
    S = Math.sqrt(trace + 1) * 2;
    out[3] = 0.25 * S;
    out[0] = (sm23 - sm32) / S;
    out[1] = (sm31 - sm13) / S;
    out[2] = (sm12 - sm21) / S;
  } else if (sm11 > sm22 && sm11 > sm33) {
    S = Math.sqrt(1 + sm11 - sm22 - sm33) * 2;
    out[3] = (sm23 - sm32) / S;
    out[0] = 0.25 * S;
    out[1] = (sm12 + sm21) / S;
    out[2] = (sm31 + sm13) / S;
  } else if (sm22 > sm33) {
    S = Math.sqrt(1 + sm22 - sm11 - sm33) * 2;
    out[3] = (sm31 - sm13) / S;
    out[0] = (sm12 + sm21) / S;
    out[1] = 0.25 * S;
    out[2] = (sm23 + sm32) / S;
  } else {
    S = Math.sqrt(1 + sm33 - sm11 - sm22) * 2;
    out[3] = (sm12 - sm21) / S;
    out[0] = (sm31 + sm13) / S;
    out[1] = (sm23 + sm32) / S;
    out[2] = 0.25 * S;
  }
  return out;
}
function fromRotationTranslationScale(out, q, v, s) {
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;
  var xx = x * x2;
  var xy = x * y2;
  var xz = x * z2;
  var yy = y * y2;
  var yz = y * z2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;
  var sx = s[0];
  var sy = s[1];
  var sz = s[2];
  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;
  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;
  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;
  out[12] = v[0];
  out[13] = v[1];
  out[14] = v[2];
  out[15] = 1;
  return out;
}
function fromRotationTranslationScaleOrigin(out, q, v, s, o) {
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;
  var xx = x * x2;
  var xy = x * y2;
  var xz = x * z2;
  var yy = y * y2;
  var yz = y * z2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;
  var sx = s[0];
  var sy = s[1];
  var sz = s[2];
  var ox = o[0];
  var oy = o[1];
  var oz = o[2];
  var out0 = (1 - (yy + zz)) * sx;
  var out1 = (xy + wz) * sx;
  var out2 = (xz - wy) * sx;
  var out4 = (xy - wz) * sy;
  var out5 = (1 - (xx + zz)) * sy;
  var out6 = (yz + wx) * sy;
  var out8 = (xz + wy) * sz;
  var out9 = (yz - wx) * sz;
  var out10 = (1 - (xx + yy)) * sz;
  out[0] = out0;
  out[1] = out1;
  out[2] = out2;
  out[3] = 0;
  out[4] = out4;
  out[5] = out5;
  out[6] = out6;
  out[7] = 0;
  out[8] = out8;
  out[9] = out9;
  out[10] = out10;
  out[11] = 0;
  out[12] = v[0] + ox - (out0 * ox + out4 * oy + out8 * oz);
  out[13] = v[1] + oy - (out1 * ox + out5 * oy + out9 * oz);
  out[14] = v[2] + oz - (out2 * ox + out6 * oy + out10 * oz);
  out[15] = 1;
  return out;
}
function fromQuat$1(out, q) {
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;
  var xx = x * x2;
  var yx = y * x2;
  var yy = y * y2;
  var zx = z * x2;
  var zy = z * y2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;
  out[0] = 1 - yy - zz;
  out[1] = yx + wz;
  out[2] = zx - wy;
  out[3] = 0;
  out[4] = yx - wz;
  out[5] = 1 - xx - zz;
  out[6] = zy + wx;
  out[7] = 0;
  out[8] = zx + wy;
  out[9] = zy - wx;
  out[10] = 1 - xx - yy;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function frustum(out, left, right, bottom, top, near, far) {
  var rl = 1 / (right - left);
  var tb = 1 / (top - bottom);
  var nf = 1 / (near - far);
  out[0] = near * 2 * rl;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = near * 2 * tb;
  out[6] = 0;
  out[7] = 0;
  out[8] = (right + left) * rl;
  out[9] = (top + bottom) * tb;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = far * near * 2 * nf;
  out[15] = 0;
  return out;
}
function perspective(out, fovy, aspect, near, far) {
  var f = 1 / Math.tan(fovy / 2), nf;
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[15] = 0;
  if (far != null && far !== Infinity) {
    nf = 1 / (near - far);
    out[10] = (far + near) * nf;
    out[14] = 2 * far * near * nf;
  } else {
    out[10] = -1;
    out[14] = -2 * near;
  }
  return out;
}
function perspectiveFromFieldOfView(out, fov, near, far) {
  var upTan = Math.tan(fov.upDegrees * Math.PI / 180);
  var downTan = Math.tan(fov.downDegrees * Math.PI / 180);
  var leftTan = Math.tan(fov.leftDegrees * Math.PI / 180);
  var rightTan = Math.tan(fov.rightDegrees * Math.PI / 180);
  var xScale = 2 / (leftTan + rightTan);
  var yScale = 2 / (upTan + downTan);
  out[0] = xScale;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = yScale;
  out[6] = 0;
  out[7] = 0;
  out[8] = -((leftTan - rightTan) * xScale * 0.5);
  out[9] = (upTan - downTan) * yScale * 0.5;
  out[10] = far / (near - far);
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = far * near / (near - far);
  out[15] = 0;
  return out;
}
function ortho(out, left, right, bottom, top, near, far) {
  var lr = 1 / (left - right);
  var bt = 1 / (bottom - top);
  var nf = 1 / (near - far);
  out[0] = -2 * lr;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = -2 * bt;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 2 * nf;
  out[11] = 0;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = (far + near) * nf;
  out[15] = 1;
  return out;
}
function lookAt(out, eye, center2, up) {
  var x0, x1, x2, y0, y1, y2, z0, z1, z2, len2;
  var eyex = eye[0];
  var eyey = eye[1];
  var eyez = eye[2];
  var upx = up[0];
  var upy = up[1];
  var upz = up[2];
  var centerx = center2[0];
  var centery = center2[1];
  var centerz = center2[2];
  if (Math.abs(eyex - centerx) < EPSILON && Math.abs(eyey - centery) < EPSILON && Math.abs(eyez - centerz) < EPSILON) {
    return identity$3(out);
  }
  z0 = eyex - centerx;
  z1 = eyey - centery;
  z2 = eyez - centerz;
  len2 = 1 / Math.hypot(z0, z1, z2);
  z0 *= len2;
  z1 *= len2;
  z2 *= len2;
  x0 = upy * z2 - upz * z1;
  x1 = upz * z0 - upx * z2;
  x2 = upx * z1 - upy * z0;
  len2 = Math.hypot(x0, x1, x2);
  if (!len2) {
    x0 = 0;
    x1 = 0;
    x2 = 0;
  } else {
    len2 = 1 / len2;
    x0 *= len2;
    x1 *= len2;
    x2 *= len2;
  }
  y0 = z1 * x2 - z2 * x1;
  y1 = z2 * x0 - z0 * x2;
  y2 = z0 * x1 - z1 * x0;
  len2 = Math.hypot(y0, y1, y2);
  if (!len2) {
    y0 = 0;
    y1 = 0;
    y2 = 0;
  } else {
    len2 = 1 / len2;
    y0 *= len2;
    y1 *= len2;
    y2 *= len2;
  }
  out[0] = x0;
  out[1] = y0;
  out[2] = z0;
  out[3] = 0;
  out[4] = x1;
  out[5] = y1;
  out[6] = z1;
  out[7] = 0;
  out[8] = x2;
  out[9] = y2;
  out[10] = z2;
  out[11] = 0;
  out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
  out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
  out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
  out[15] = 1;
  return out;
}
function targetTo(out, eye, target, up) {
  var eyex = eye[0], eyey = eye[1], eyez = eye[2], upx = up[0], upy = up[1], upz = up[2];
  var z0 = eyex - target[0], z1 = eyey - target[1], z2 = eyez - target[2];
  var len2 = z0 * z0 + z1 * z1 + z2 * z2;
  if (len2 > 0) {
    len2 = 1 / Math.sqrt(len2);
    z0 *= len2;
    z1 *= len2;
    z2 *= len2;
  }
  var x0 = upy * z2 - upz * z1, x1 = upz * z0 - upx * z2, x2 = upx * z1 - upy * z0;
  len2 = x0 * x0 + x1 * x1 + x2 * x2;
  if (len2 > 0) {
    len2 = 1 / Math.sqrt(len2);
    x0 *= len2;
    x1 *= len2;
    x2 *= len2;
  }
  out[0] = x0;
  out[1] = x1;
  out[2] = x2;
  out[3] = 0;
  out[4] = z1 * x2 - z2 * x1;
  out[5] = z2 * x0 - z0 * x2;
  out[6] = z0 * x1 - z1 * x0;
  out[7] = 0;
  out[8] = z0;
  out[9] = z1;
  out[10] = z2;
  out[11] = 0;
  out[12] = eyex;
  out[13] = eyey;
  out[14] = eyez;
  out[15] = 1;
  return out;
}
function str$3(a) {
  return "mat4(" + a[0] + ", " + a[1] + ", " + a[2] + ", " + a[3] + ", " + a[4] + ", " + a[5] + ", " + a[6] + ", " + a[7] + ", " + a[8] + ", " + a[9] + ", " + a[10] + ", " + a[11] + ", " + a[12] + ", " + a[13] + ", " + a[14] + ", " + a[15] + ")";
}
function frob$3(a) {
  return Math.hypot(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12], a[13], a[14], a[15]);
}
function add$3(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  out[3] = a[3] + b[3];
  out[4] = a[4] + b[4];
  out[5] = a[5] + b[5];
  out[6] = a[6] + b[6];
  out[7] = a[7] + b[7];
  out[8] = a[8] + b[8];
  out[9] = a[9] + b[9];
  out[10] = a[10] + b[10];
  out[11] = a[11] + b[11];
  out[12] = a[12] + b[12];
  out[13] = a[13] + b[13];
  out[14] = a[14] + b[14];
  out[15] = a[15] + b[15];
  return out;
}
function subtract$3(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  out[3] = a[3] - b[3];
  out[4] = a[4] - b[4];
  out[5] = a[5] - b[5];
  out[6] = a[6] - b[6];
  out[7] = a[7] - b[7];
  out[8] = a[8] - b[8];
  out[9] = a[9] - b[9];
  out[10] = a[10] - b[10];
  out[11] = a[11] - b[11];
  out[12] = a[12] - b[12];
  out[13] = a[13] - b[13];
  out[14] = a[14] - b[14];
  out[15] = a[15] - b[15];
  return out;
}
function multiplyScalar$3(out, a, b) {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  out[3] = a[3] * b;
  out[4] = a[4] * b;
  out[5] = a[5] * b;
  out[6] = a[6] * b;
  out[7] = a[7] * b;
  out[8] = a[8] * b;
  out[9] = a[9] * b;
  out[10] = a[10] * b;
  out[11] = a[11] * b;
  out[12] = a[12] * b;
  out[13] = a[13] * b;
  out[14] = a[14] * b;
  out[15] = a[15] * b;
  return out;
}
function multiplyScalarAndAdd$3(out, a, b, scale) {
  out[0] = a[0] + b[0] * scale;
  out[1] = a[1] + b[1] * scale;
  out[2] = a[2] + b[2] * scale;
  out[3] = a[3] + b[3] * scale;
  out[4] = a[4] + b[4] * scale;
  out[5] = a[5] + b[5] * scale;
  out[6] = a[6] + b[6] * scale;
  out[7] = a[7] + b[7] * scale;
  out[8] = a[8] + b[8] * scale;
  out[9] = a[9] + b[9] * scale;
  out[10] = a[10] + b[10] * scale;
  out[11] = a[11] + b[11] * scale;
  out[12] = a[12] + b[12] * scale;
  out[13] = a[13] + b[13] * scale;
  out[14] = a[14] + b[14] * scale;
  out[15] = a[15] + b[15] * scale;
  return out;
}
function exactEquals$3(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5] && a[6] === b[6] && a[7] === b[7] && a[8] === b[8] && a[9] === b[9] && a[10] === b[10] && a[11] === b[11] && a[12] === b[12] && a[13] === b[13] && a[14] === b[14] && a[15] === b[15];
}
function equals$4(a, b) {
  var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3];
  var a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7];
  var a8 = a[8], a9 = a[9], a10 = a[10], a11 = a[11];
  var a12 = a[12], a13 = a[13], a14 = a[14], a15 = a[15];
  var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  var b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7];
  var b8 = b[8], b9 = b[9], b10 = b[10], b11 = b[11];
  var b12 = b[12], b13 = b[13], b14 = b[14], b15 = b[15];
  return Math.abs(a0 - b0) <= EPSILON * Math.max(1, Math.abs(a0), Math.abs(b0)) && Math.abs(a1 - b1) <= EPSILON * Math.max(1, Math.abs(a1), Math.abs(b1)) && Math.abs(a2 - b2) <= EPSILON * Math.max(1, Math.abs(a2), Math.abs(b2)) && Math.abs(a3 - b3) <= EPSILON * Math.max(1, Math.abs(a3), Math.abs(b3)) && Math.abs(a4 - b4) <= EPSILON * Math.max(1, Math.abs(a4), Math.abs(b4)) && Math.abs(a5 - b5) <= EPSILON * Math.max(1, Math.abs(a5), Math.abs(b5)) && Math.abs(a6 - b6) <= EPSILON * Math.max(1, Math.abs(a6), Math.abs(b6)) && Math.abs(a7 - b7) <= EPSILON * Math.max(1, Math.abs(a7), Math.abs(b7)) && Math.abs(a8 - b8) <= EPSILON * Math.max(1, Math.abs(a8), Math.abs(b8)) && Math.abs(a9 - b9) <= EPSILON * Math.max(1, Math.abs(a9), Math.abs(b9)) && Math.abs(a10 - b10) <= EPSILON * Math.max(1, Math.abs(a10), Math.abs(b10)) && Math.abs(a11 - b11) <= EPSILON * Math.max(1, Math.abs(a11), Math.abs(b11)) && Math.abs(a12 - b12) <= EPSILON * Math.max(1, Math.abs(a12), Math.abs(b12)) && Math.abs(a13 - b13) <= EPSILON * Math.max(1, Math.abs(a13), Math.abs(b13)) && Math.abs(a14 - b14) <= EPSILON * Math.max(1, Math.abs(a14), Math.abs(b14)) && Math.abs(a15 - b15) <= EPSILON * Math.max(1, Math.abs(a15), Math.abs(b15));
}
var mul$3 = multiply$3;
var sub$3 = subtract$3;
var mat4 = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  create: create$3,
  clone: clone$3,
  copy: copy$3,
  fromValues: fromValues$3,
  set: set$3,
  identity: identity$3,
  transpose: transpose$2,
  invert: invert$3,
  adjoint: adjoint$2,
  determinant: determinant$3,
  multiply: multiply$3,
  translate: translate$2,
  scale: scale$3,
  rotate: rotate$3,
  rotateX,
  rotateY,
  rotateZ,
  fromTranslation: fromTranslation$2,
  fromScaling: fromScaling$3,
  fromRotation: fromRotation$3,
  fromXRotation,
  fromYRotation,
  fromZRotation,
  fromRotationTranslation,
  fromQuat2,
  getTranslation,
  getScaling,
  getRotation,
  fromRotationTranslationScale,
  fromRotationTranslationScaleOrigin,
  fromQuat: fromQuat$1,
  frustum,
  perspective,
  perspectiveFromFieldOfView,
  ortho,
  lookAt,
  targetTo,
  str: str$3,
  frob: frob$3,
  add: add$3,
  subtract: subtract$3,
  multiplyScalar: multiplyScalar$3,
  multiplyScalarAndAdd: multiplyScalarAndAdd$3,
  exactEquals: exactEquals$3,
  equals: equals$4,
  mul: mul$3,
  sub: sub$3
});
function create$4() {
  var out = new ARRAY_TYPE(3);
  if (ARRAY_TYPE != Float32Array) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
  }
  return out;
}
function clone$4(a) {
  var out = new ARRAY_TYPE(3);
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  return out;
}
function length(a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  return Math.hypot(x, y, z);
}
function fromValues$4(x, y, z) {
  var out = new ARRAY_TYPE(3);
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}
function copy$4(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  return out;
}
function set$4(out, x, y, z) {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}
function add$4(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  return out;
}
function subtract$4(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  return out;
}
function multiply$4(out, a, b) {
  out[0] = a[0] * b[0];
  out[1] = a[1] * b[1];
  out[2] = a[2] * b[2];
  return out;
}
function divide(out, a, b) {
  out[0] = a[0] / b[0];
  out[1] = a[1] / b[1];
  out[2] = a[2] / b[2];
  return out;
}
function ceil(out, a) {
  out[0] = Math.ceil(a[0]);
  out[1] = Math.ceil(a[1]);
  out[2] = Math.ceil(a[2]);
  return out;
}
function floor(out, a) {
  out[0] = Math.floor(a[0]);
  out[1] = Math.floor(a[1]);
  out[2] = Math.floor(a[2]);
  return out;
}
function min(out, a, b) {
  out[0] = Math.min(a[0], b[0]);
  out[1] = Math.min(a[1], b[1]);
  out[2] = Math.min(a[2], b[2]);
  return out;
}
function max(out, a, b) {
  out[0] = Math.max(a[0], b[0]);
  out[1] = Math.max(a[1], b[1]);
  out[2] = Math.max(a[2], b[2]);
  return out;
}
function round(out, a) {
  out[0] = Math.round(a[0]);
  out[1] = Math.round(a[1]);
  out[2] = Math.round(a[2]);
  return out;
}
function scale$4(out, a, b) {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  return out;
}
function scaleAndAdd(out, a, b, scale) {
  out[0] = a[0] + b[0] * scale;
  out[1] = a[1] + b[1] * scale;
  out[2] = a[2] + b[2] * scale;
  return out;
}
function distance(a, b) {
  var x = b[0] - a[0];
  var y = b[1] - a[1];
  var z = b[2] - a[2];
  return Math.hypot(x, y, z);
}
function squaredDistance(a, b) {
  var x = b[0] - a[0];
  var y = b[1] - a[1];
  var z = b[2] - a[2];
  return x * x + y * y + z * z;
}
function squaredLength(a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  return x * x + y * y + z * z;
}
function negate(out, a) {
  out[0] = -a[0];
  out[1] = -a[1];
  out[2] = -a[2];
  return out;
}
function inverse(out, a) {
  out[0] = 1 / a[0];
  out[1] = 1 / a[1];
  out[2] = 1 / a[2];
  return out;
}
function normalize(out, a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  var len2 = x * x + y * y + z * z;
  if (len2 > 0) {
    len2 = 1 / Math.sqrt(len2);
  }
  out[0] = a[0] * len2;
  out[1] = a[1] * len2;
  out[2] = a[2] * len2;
  return out;
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(out, a, b) {
  var ax = a[0], ay = a[1], az = a[2];
  var bx = b[0], by = b[1], bz = b[2];
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}
function lerp(out, a, b, t) {
  var ax = a[0];
  var ay = a[1];
  var az = a[2];
  out[0] = ax + t * (b[0] - ax);
  out[1] = ay + t * (b[1] - ay);
  out[2] = az + t * (b[2] - az);
  return out;
}
function hermite(out, a, b, c2, d, t) {
  var factorTimes2 = t * t;
  var factor1 = factorTimes2 * (2 * t - 3) + 1;
  var factor2 = factorTimes2 * (t - 2) + t;
  var factor3 = factorTimes2 * (t - 1);
  var factor4 = factorTimes2 * (3 - 2 * t);
  out[0] = a[0] * factor1 + b[0] * factor2 + c2[0] * factor3 + d[0] * factor4;
  out[1] = a[1] * factor1 + b[1] * factor2 + c2[1] * factor3 + d[1] * factor4;
  out[2] = a[2] * factor1 + b[2] * factor2 + c2[2] * factor3 + d[2] * factor4;
  return out;
}
function bezier(out, a, b, c2, d, t) {
  var inverseFactor = 1 - t;
  var inverseFactorTimesTwo = inverseFactor * inverseFactor;
  var factorTimes2 = t * t;
  var factor1 = inverseFactorTimesTwo * inverseFactor;
  var factor2 = 3 * t * inverseFactorTimesTwo;
  var factor3 = 3 * factorTimes2 * inverseFactor;
  var factor4 = factorTimes2 * t;
  out[0] = a[0] * factor1 + b[0] * factor2 + c2[0] * factor3 + d[0] * factor4;
  out[1] = a[1] * factor1 + b[1] * factor2 + c2[1] * factor3 + d[1] * factor4;
  out[2] = a[2] * factor1 + b[2] * factor2 + c2[2] * factor3 + d[2] * factor4;
  return out;
}
function random(out, scale) {
  scale = scale || 1;
  var r = RANDOM() * 2 * Math.PI;
  var z = RANDOM() * 2 - 1;
  var zScale = Math.sqrt(1 - z * z) * scale;
  out[0] = Math.cos(r) * zScale;
  out[1] = Math.sin(r) * zScale;
  out[2] = z * scale;
  return out;
}
function transformMat4(out, a, m) {
  var x = a[0], y = a[1], z = a[2];
  var w = m[3] * x + m[7] * y + m[11] * z + m[15];
  w = w || 1;
  out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return out;
}
function transformMat3(out, a, m) {
  var x = a[0], y = a[1], z = a[2];
  out[0] = x * m[0] + y * m[3] + z * m[6];
  out[1] = x * m[1] + y * m[4] + z * m[7];
  out[2] = x * m[2] + y * m[5] + z * m[8];
  return out;
}
function transformQuat(out, a, q) {
  var qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  var x = a[0], y = a[1], z = a[2];
  var uvx = qy * z - qz * y, uvy = qz * x - qx * z, uvz = qx * y - qy * x;
  var uuvx = qy * uvz - qz * uvy, uuvy = qz * uvx - qx * uvz, uuvz = qx * uvy - qy * uvx;
  var w2 = qw * 2;
  uvx *= w2;
  uvy *= w2;
  uvz *= w2;
  uuvx *= 2;
  uuvy *= 2;
  uuvz *= 2;
  out[0] = x + uvx + uuvx;
  out[1] = y + uvy + uuvy;
  out[2] = z + uvz + uuvz;
  return out;
}
function rotateX$1(out, a, b, rad) {
  var p = [], r = [];
  p[0] = a[0] - b[0];
  p[1] = a[1] - b[1];
  p[2] = a[2] - b[2];
  r[0] = p[0];
  r[1] = p[1] * Math.cos(rad) - p[2] * Math.sin(rad);
  r[2] = p[1] * Math.sin(rad) + p[2] * Math.cos(rad);
  out[0] = r[0] + b[0];
  out[1] = r[1] + b[1];
  out[2] = r[2] + b[2];
  return out;
}
function rotateY$1(out, a, b, rad) {
  var p = [], r = [];
  p[0] = a[0] - b[0];
  p[1] = a[1] - b[1];
  p[2] = a[2] - b[2];
  r[0] = p[2] * Math.sin(rad) + p[0] * Math.cos(rad);
  r[1] = p[1];
  r[2] = p[2] * Math.cos(rad) - p[0] * Math.sin(rad);
  out[0] = r[0] + b[0];
  out[1] = r[1] + b[1];
  out[2] = r[2] + b[2];
  return out;
}
function rotateZ$1(out, a, b, rad) {
  var p = [], r = [];
  p[0] = a[0] - b[0];
  p[1] = a[1] - b[1];
  p[2] = a[2] - b[2];
  r[0] = p[0] * Math.cos(rad) - p[1] * Math.sin(rad);
  r[1] = p[0] * Math.sin(rad) + p[1] * Math.cos(rad);
  r[2] = p[2];
  out[0] = r[0] + b[0];
  out[1] = r[1] + b[1];
  out[2] = r[2] + b[2];
  return out;
}
function angle(a, b) {
  var ax = a[0], ay = a[1], az = a[2], bx = b[0], by = b[1], bz = b[2], mag1 = Math.sqrt(ax * ax + ay * ay + az * az), mag2 = Math.sqrt(bx * bx + by * by + bz * bz), mag = mag1 * mag2, cosine = mag && dot(a, b) / mag;
  return Math.acos(Math.min(Math.max(cosine, -1), 1));
}
function zero(out) {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  return out;
}
function str$4(a) {
  return "vec3(" + a[0] + ", " + a[1] + ", " + a[2] + ")";
}
function exactEquals$4(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
function equals$5(a, b) {
  var a0 = a[0], a1 = a[1], a2 = a[2];
  var b0 = b[0], b1 = b[1], b2 = b[2];
  return Math.abs(a0 - b0) <= EPSILON * Math.max(1, Math.abs(a0), Math.abs(b0)) && Math.abs(a1 - b1) <= EPSILON * Math.max(1, Math.abs(a1), Math.abs(b1)) && Math.abs(a2 - b2) <= EPSILON * Math.max(1, Math.abs(a2), Math.abs(b2));
}
var sub$4 = subtract$4;
var mul$4 = multiply$4;
var div = divide;
var dist = distance;
var sqrDist = squaredDistance;
var len = length;
var sqrLen = squaredLength;
var forEach = function() {
  var vec = create$4();
  return function(a, stride, offset, count, fn, arg) {
    var i, l;
    if (!stride) {
      stride = 3;
    }
    if (!offset) {
      offset = 0;
    }
    if (count) {
      l = Math.min(count * stride + offset, a.length);
    } else {
      l = a.length;
    }
    for (i = offset; i < l; i += stride) {
      vec[0] = a[i];
      vec[1] = a[i + 1];
      vec[2] = a[i + 2];
      fn(vec, vec, arg);
      a[i] = vec[0];
      a[i + 1] = vec[1];
      a[i + 2] = vec[2];
    }
    return a;
  };
}();
var vec3 = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  create: create$4,
  clone: clone$4,
  length,
  fromValues: fromValues$4,
  copy: copy$4,
  set: set$4,
  add: add$4,
  subtract: subtract$4,
  multiply: multiply$4,
  divide,
  ceil,
  floor,
  min,
  max,
  round,
  scale: scale$4,
  scaleAndAdd,
  distance,
  squaredDistance,
  squaredLength,
  negate,
  inverse,
  normalize,
  dot,
  cross,
  lerp,
  hermite,
  bezier,
  random,
  transformMat4,
  transformMat3,
  transformQuat,
  rotateX: rotateX$1,
  rotateY: rotateY$1,
  rotateZ: rotateZ$1,
  angle,
  zero,
  str: str$4,
  exactEquals: exactEquals$4,
  equals: equals$5,
  sub: sub$4,
  mul: mul$4,
  div,
  dist,
  sqrDist,
  len,
  sqrLen,
  forEach
});
function create$5() {
  var out = new ARRAY_TYPE(4);
  if (ARRAY_TYPE != Float32Array) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
  }
  return out;
}
function normalize$1(out, a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  var w = a[3];
  var len2 = x * x + y * y + z * z + w * w;
  if (len2 > 0) {
    len2 = 1 / Math.sqrt(len2);
  }
  out[0] = x * len2;
  out[1] = y * len2;
  out[2] = z * len2;
  out[3] = w * len2;
  return out;
}
var forEach$1 = function() {
  var vec = create$5();
  return function(a, stride, offset, count, fn, arg) {
    var i, l;
    if (!stride) {
      stride = 4;
    }
    if (!offset) {
      offset = 0;
    }
    if (count) {
      l = Math.min(count * stride + offset, a.length);
    } else {
      l = a.length;
    }
    for (i = offset; i < l; i += stride) {
      vec[0] = a[i];
      vec[1] = a[i + 1];
      vec[2] = a[i + 2];
      vec[3] = a[i + 3];
      fn(vec, vec, arg);
      a[i] = vec[0];
      a[i + 1] = vec[1];
      a[i + 2] = vec[2];
      a[i + 3] = vec[3];
    }
    return a;
  };
}();
function create$6() {
  var out = new ARRAY_TYPE(4);
  if (ARRAY_TYPE != Float32Array) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
  }
  out[3] = 1;
  return out;
}
function setAxisAngle(out, axis, rad) {
  rad = rad * 0.5;
  var s = Math.sin(rad);
  out[0] = s * axis[0];
  out[1] = s * axis[1];
  out[2] = s * axis[2];
  out[3] = Math.cos(rad);
  return out;
}
function slerp(out, a, b, t) {
  var ax = a[0], ay = a[1], az = a[2], aw = a[3];
  var bx = b[0], by = b[1], bz = b[2], bw = b[3];
  var omega, cosom, sinom, scale0, scale1;
  cosom = ax * bx + ay * by + az * bz + aw * bw;
  if (cosom < 0) {
    cosom = -cosom;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (1 - cosom > EPSILON) {
    omega = Math.acos(cosom);
    sinom = Math.sin(omega);
    scale0 = Math.sin((1 - t) * omega) / sinom;
    scale1 = Math.sin(t * omega) / sinom;
  } else {
    scale0 = 1 - t;
    scale1 = t;
  }
  out[0] = scale0 * ax + scale1 * bx;
  out[1] = scale0 * ay + scale1 * by;
  out[2] = scale0 * az + scale1 * bz;
  out[3] = scale0 * aw + scale1 * bw;
  return out;
}
function fromMat3(out, m) {
  var fTrace = m[0] + m[4] + m[8];
  var fRoot;
  if (fTrace > 0) {
    fRoot = Math.sqrt(fTrace + 1);
    out[3] = 0.5 * fRoot;
    fRoot = 0.5 / fRoot;
    out[0] = (m[5] - m[7]) * fRoot;
    out[1] = (m[6] - m[2]) * fRoot;
    out[2] = (m[1] - m[3]) * fRoot;
  } else {
    var i = 0;
    if (m[4] > m[0])
      i = 1;
    if (m[8] > m[i * 3 + i])
      i = 2;
    var j = (i + 1) % 3;
    var k = (i + 2) % 3;
    fRoot = Math.sqrt(m[i * 3 + i] - m[j * 3 + j] - m[k * 3 + k] + 1);
    out[i] = 0.5 * fRoot;
    fRoot = 0.5 / fRoot;
    out[3] = (m[j * 3 + k] - m[k * 3 + j]) * fRoot;
    out[j] = (m[j * 3 + i] + m[i * 3 + j]) * fRoot;
    out[k] = (m[k * 3 + i] + m[i * 3 + k]) * fRoot;
  }
  return out;
}
var normalize$2 = normalize$1;
var rotationTo = function() {
  var tmpvec3 = create$4();
  var xUnitVec3 = fromValues$4(1, 0, 0);
  var yUnitVec3 = fromValues$4(0, 1, 0);
  return function(out, a, b) {
    var dot$1 = dot(a, b);
    if (dot$1 < -0.999999) {
      cross(tmpvec3, xUnitVec3, a);
      if (len(tmpvec3) < 1e-6)
        cross(tmpvec3, yUnitVec3, a);
      normalize(tmpvec3, tmpvec3);
      setAxisAngle(out, tmpvec3, Math.PI);
      return out;
    } else if (dot$1 > 0.999999) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      out[3] = 1;
      return out;
    } else {
      cross(tmpvec3, a, b);
      out[0] = tmpvec3[0];
      out[1] = tmpvec3[1];
      out[2] = tmpvec3[2];
      out[3] = 1 + dot$1;
      return normalize$2(out, out);
    }
  };
}();
var sqlerp = function() {
  var temp1 = create$6();
  var temp2 = create$6();
  return function(out, a, b, c2, d, t) {
    slerp(temp1, a, d, t);
    slerp(temp2, b, c2, t);
    slerp(out, temp1, temp2, 2 * t * (1 - t));
    return out;
  };
}();
var setAxes = function() {
  var matr = create$2();
  return function(out, view, right, up) {
    matr[0] = right[0];
    matr[3] = right[1];
    matr[6] = right[2];
    matr[1] = up[0];
    matr[4] = up[1];
    matr[7] = up[2];
    matr[2] = -view[0];
    matr[5] = -view[1];
    matr[8] = -view[2];
    return normalize$2(out, fromMat3(out, matr));
  };
}();
function create$8() {
  var out = new ARRAY_TYPE(2);
  if (ARRAY_TYPE != Float32Array) {
    out[0] = 0;
    out[1] = 0;
  }
  return out;
}
var forEach$2 = function() {
  var vec = create$8();
  return function(a, stride, offset, count, fn, arg) {
    var i, l;
    if (!stride) {
      stride = 2;
    }
    if (!offset) {
      offset = 0;
    }
    if (count) {
      l = Math.min(count * stride + offset, a.length);
    } else {
      l = a.length;
    }
    for (i = offset; i < l; i += stride) {
      vec[0] = a[i];
      vec[1] = a[i + 1];
      fn(vec, vec, arg);
      a[i] = vec[0];
      a[i + 1] = vec[1];
    }
    return a;
  };
}();

// build/_snowpack/pkg/@colormap/core.js
function findIndex(nodes, value, start2, stop) {
  if (stop <= start2) {
    return start2;
  }
  const index = Math.floor(start2 + (stop - start2) / 2);
  const delta = value - nodes[index].value;
  const delta1 = value - nodes[index + 1].value;
  if (delta < 0) {
    return findIndex(nodes, value, start2, index - 1);
  } else if (delta1 < 0) {
    return index;
  } else {
    return findIndex(nodes, value, index + 1, stop);
  }
}
var linearMixer = (value, lowerNodeValue, upperNodeValue) => {
  const frac = (value - lowerNodeValue) / (upperNodeValue - lowerNodeValue);
  return [1 - frac, frac];
};
function isNode(node) {
  return node.value !== void 0 && node.mapped !== void 0;
}
function isNodeArray(nodes) {
  return nodes.length > 0 && isNode(nodes[0]);
}
function colorCombination(a, X, b, Y) {
  return [
    a * X[0] + b * Y[0],
    a * X[1] + b * Y[1],
    a * X[2] + b * Y[2]
  ];
}
function ensureMixer(mixer) {
  return mixer ? mixer : linearMixer;
}
function createColorMap(colors3, scale, mixer) {
  if (!Array.isArray(colors3) || colors3.length < 1) {
    return noColorMap;
  }
  if (isNodeArray(colors3)) {
    return createMapFromNodes(colors3, scale, ensureMixer(mixer), colorCombination);
  } else {
    return createMapFromArray(colors3, scale, ensureMixer(mixer), colorCombination);
  }
}
function createMapFromNodes(nodes, scale, mixer, linearCombination) {
  const sortedNodes = nodes.sort((a, b) => a.value < b.value ? -1 : 1);
  return function(value) {
    const scaledValue = scale(value);
    const index = findIndex(sortedNodes, scaledValue, 0, sortedNodes.length - 1);
    if (index == 0 && scaledValue < sortedNodes[0].value) {
      return sortedNodes[index].mapped;
    } else if (index == sortedNodes.length - 1) {
      return sortedNodes[index].mapped;
    }
    const [coeff0, coeff1] = mixer(scaledValue, sortedNodes[index].value, sortedNodes[index + 1].value);
    return linearCombination(coeff0, sortedNodes[index].mapped, coeff1, sortedNodes[index + 1].mapped);
  };
}
function createMapFromArray(arr, scale, mixer, linearCombination) {
  return function(value) {
    const scaledValue = scale(value);
    const indexFloat = (arr.length - 1) * scaledValue;
    if (indexFloat <= 0) {
      return arr[0];
    } else if (indexFloat >= arr.length - 1) {
      return arr[arr.length - 1];
    }
    const index = Math.floor(indexFloat);
    const [coeff0, coeff1] = mixer(indexFloat, index, index + 1);
    return linearCombination(coeff0, arr[index], coeff1, arr[index + 1]);
  };
}
function noColorMap(_value) {
  return [0, 0, 0];
}
function linearScale(domain, range) {
  let [d0, d1] = domain;
  const [r0, r1] = range;
  if (Math.abs(d0 - d1) < Number.EPSILON) {
    d1 = d0 + 1;
  }
  return function(value) {
    return r0 + (r1 - r0) * ((value - d0) / (d1 - d0));
  };
}

// build/_snowpack/pkg/@colormap/presets.js
var colors$2 = [
  [1462e-6, 466e-6, 0.013866],
  [2267e-6, 127e-5, 0.01857],
  [3299e-6, 2249e-6, 0.024239],
  [4547e-6, 3392e-6, 0.030909],
  [6006e-6, 4692e-6, 0.038558],
  [7676e-6, 6136e-6, 0.046836],
  [9561e-6, 7713e-6, 0.055143],
  [0.011663, 9417e-6, 0.06346],
  [0.013995, 0.011225, 0.071862],
  [0.016561, 0.013136, 0.080282],
  [0.019373, 0.015133, 0.088767],
  [0.022447, 0.017199, 0.097327],
  [0.025793, 0.019331, 0.10593],
  [0.029432, 0.021503, 0.114621],
  [0.033385, 0.023702, 0.123397],
  [0.037668, 0.025921, 0.132232],
  [0.042253, 0.028139, 0.141141],
  [0.046915, 0.030324, 0.150164],
  [0.051644, 0.032474, 0.159254],
  [0.056449, 0.034569, 0.168414],
  [0.06134, 0.03659, 0.177642],
  [0.066331, 0.038504, 0.186962],
  [0.071429, 0.040294, 0.196354],
  [0.076637, 0.041905, 0.205799],
  [0.081962, 0.043328, 0.215289],
  [0.087411, 0.044556, 0.224813],
  [0.09299, 0.045583, 0.234358],
  [0.098702, 0.046402, 0.243904],
  [0.104551, 0.047008, 0.25343],
  [0.110536, 0.047399, 0.262912],
  [0.116656, 0.047574, 0.272321],
  [0.122908, 0.047536, 0.281624],
  [0.129285, 0.047293, 0.290788],
  [0.135778, 0.046856, 0.299776],
  [0.142378, 0.046242, 0.308553],
  [0.149073, 0.045468, 0.317085],
  [0.15585, 0.044559, 0.325338],
  [0.162689, 0.043554, 0.333277],
  [0.169575, 0.042489, 0.340874],
  [0.176493, 0.041402, 0.348111],
  [0.183429, 0.040329, 0.354971],
  [0.190367, 0.039309, 0.361447],
  [0.197297, 0.0384, 0.367535],
  [0.204209, 0.037632, 0.373238],
  [0.211095, 0.03703, 0.378563],
  [0.217949, 0.036615, 0.383522],
  [0.224763, 0.036405, 0.388129],
  [0.231538, 0.036405, 0.3924],
  [0.238273, 0.036621, 0.396353],
  [0.244967, 0.037055, 0.400007],
  [0.25162, 0.037705, 0.403378],
  [0.258234, 0.038571, 0.406485],
  [0.26481, 0.039647, 0.409345],
  [0.271347, 0.040922, 0.411976],
  [0.27785, 0.042353, 0.414392],
  [0.284321, 0.043933, 0.416608],
  [0.290763, 0.045644, 0.418637],
  [0.297178, 0.04747, 0.420491],
  [0.303568, 0.049396, 0.422182],
  [0.309935, 0.051407, 0.423721],
  [0.316282, 0.05349, 0.425116],
  [0.32261, 0.055634, 0.426377],
  [0.328921, 0.057827, 0.427511],
  [0.335217, 0.06006, 0.428524],
  [0.3415, 0.062325, 0.429425],
  [0.347771, 0.064616, 0.430217],
  [0.354032, 0.066925, 0.430906],
  [0.360284, 0.069247, 0.431497],
  [0.366529, 0.071579, 0.431994],
  [0.372768, 0.073915, 0.4324],
  [0.379001, 0.076253, 0.432719],
  [0.385228, 0.078591, 0.432955],
  [0.391453, 0.080927, 0.433109],
  [0.397674, 0.083257, 0.433183],
  [0.403894, 0.08558, 0.433179],
  [0.410113, 0.087896, 0.433098],
  [0.416331, 0.090203, 0.432943],
  [0.422549, 0.092501, 0.432714],
  [0.428768, 0.09479, 0.432412],
  [0.434987, 0.097069, 0.432039],
  [0.441207, 0.099338, 0.431594],
  [0.447428, 0.101597, 0.43108],
  [0.453651, 0.103848, 0.430498],
  [0.459875, 0.106089, 0.429846],
  [0.4661, 0.108322, 0.429125],
  [0.472328, 0.110547, 0.428334],
  [0.478558, 0.112764, 0.427475],
  [0.484789, 0.114974, 0.426548],
  [0.491022, 0.117179, 0.425552],
  [0.497257, 0.119379, 0.424488],
  [0.503493, 0.121575, 0.423356],
  [0.50973, 0.123769, 0.422156],
  [0.515967, 0.12596, 0.420887],
  [0.522206, 0.12815, 0.419549],
  [0.528444, 0.130341, 0.418142],
  [0.534683, 0.132534, 0.416667],
  [0.54092, 0.134729, 0.415123],
  [0.547157, 0.136929, 0.413511],
  [0.553392, 0.139134, 0.411829],
  [0.559624, 0.141346, 0.410078],
  [0.565854, 0.143567, 0.408258],
  [0.572081, 0.145797, 0.406369],
  [0.578304, 0.148039, 0.404411],
  [0.584521, 0.150294, 0.402385],
  [0.590734, 0.152563, 0.40029],
  [0.59694, 0.154848, 0.398125],
  [0.603139, 0.157151, 0.395891],
  [0.60933, 0.159474, 0.393589],
  [0.615513, 0.161817, 0.391219],
  [0.621685, 0.164184, 0.388781],
  [0.627847, 0.166575, 0.386276],
  [0.633998, 0.168992, 0.383704],
  [0.640135, 0.171438, 0.381065],
  [0.64626, 0.173914, 0.378359],
  [0.652369, 0.176421, 0.375586],
  [0.658463, 0.178962, 0.372748],
  [0.66454, 0.181539, 0.369846],
  [0.670599, 0.184153, 0.366879],
  [0.676638, 0.186807, 0.363849],
  [0.682656, 0.189501, 0.360757],
  [0.688653, 0.192239, 0.357603],
  [0.694627, 0.195021, 0.354388],
  [0.700576, 0.197851, 0.351113],
  [0.7065, 0.200728, 0.347777],
  [0.712396, 0.203656, 0.344383],
  [0.718264, 0.206636, 0.340931],
  [0.724103, 0.20967, 0.337424],
  [0.729909, 0.212759, 0.333861],
  [0.735683, 0.215906, 0.330245],
  [0.741423, 0.219112, 0.326576],
  [0.747127, 0.222378, 0.322856],
  [0.752794, 0.225706, 0.319085],
  [0.758422, 0.229097, 0.315266],
  [0.76401, 0.232554, 0.311399],
  [0.769556, 0.236077, 0.307485],
  [0.775059, 0.239667, 0.303526],
  [0.780517, 0.243327, 0.299523],
  [0.785929, 0.247056, 0.295477],
  [0.791293, 0.250856, 0.29139],
  [0.796607, 0.254728, 0.287264],
  [0.801871, 0.258674, 0.283099],
  [0.807082, 0.262692, 0.278898],
  [0.812239, 0.266786, 0.274661],
  [0.817341, 0.270954, 0.27039],
  [0.822386, 0.275197, 0.266085],
  [0.827372, 0.279517, 0.26175],
  [0.832299, 0.283913, 0.257383],
  [0.837165, 0.288385, 0.252988],
  [0.841969, 0.292933, 0.248564],
  [0.846709, 0.297559, 0.244113],
  [0.851384, 0.30226, 0.239636],
  [0.855992, 0.307038, 0.235133],
  [0.860533, 0.311892, 0.230606],
  [0.865006, 0.316822, 0.226055],
  [0.869409, 0.321827, 0.221482],
  [0.873741, 0.326906, 0.216886],
  [0.878001, 0.33206, 0.212268],
  [0.882188, 0.337287, 0.207628],
  [0.886302, 0.342586, 0.202968],
  [0.890341, 0.347957, 0.198286],
  [0.894305, 0.353399, 0.193584],
  [0.898192, 0.358911, 0.18886],
  [0.902003, 0.364492, 0.184116],
  [0.905735, 0.37014, 0.17935],
  [0.90939, 0.375856, 0.174563],
  [0.912966, 0.381636, 0.169755],
  [0.916462, 0.387481, 0.164924],
  [0.919879, 0.393389, 0.16007],
  [0.923215, 0.399359, 0.155193],
  [0.92647, 0.405389, 0.150292],
  [0.929644, 0.411479, 0.145367],
  [0.932737, 0.417627, 0.140417],
  [0.935747, 0.423831, 0.13544],
  [0.938675, 0.430091, 0.130438],
  [0.941521, 0.436405, 0.125409],
  [0.944285, 0.442772, 0.120354],
  [0.946965, 0.449191, 0.115272],
  [0.949562, 0.45566, 0.110164],
  [0.952075, 0.462178, 0.105031],
  [0.954506, 0.468744, 0.099874],
  [0.956852, 0.475356, 0.094695],
  [0.959114, 0.482014, 0.089499],
  [0.961293, 0.488716, 0.084289],
  [0.963387, 0.495462, 0.079073],
  [0.965397, 0.502249, 0.073859],
  [0.967322, 0.509078, 0.068659],
  [0.969163, 0.515946, 0.063488],
  [0.970919, 0.522853, 0.058367],
  [0.97259, 0.529798, 0.053324],
  [0.974176, 0.53678, 0.048392],
  [0.975677, 0.543798, 0.043618],
  [0.977092, 0.55085, 0.03905],
  [0.978422, 0.557937, 0.034931],
  [0.979666, 0.565057, 0.031409],
  [0.980824, 0.572209, 0.028508],
  [0.981895, 0.579392, 0.02625],
  [0.982881, 0.586606, 0.024661],
  [0.983779, 0.593849, 0.02377],
  [0.984591, 0.601122, 0.023606],
  [0.985315, 0.608422, 0.024202],
  [0.985952, 0.61575, 0.025592],
  [0.986502, 0.623105, 0.027814],
  [0.986964, 0.630485, 0.030908],
  [0.987337, 0.63789, 0.034916],
  [0.987622, 0.64532, 0.039886],
  [0.987819, 0.652773, 0.045581],
  [0.987926, 0.66025, 0.05175],
  [0.987945, 0.667748, 0.058329],
  [0.987874, 0.675267, 0.065257],
  [0.987714, 0.682807, 0.072489],
  [0.987464, 0.690366, 0.07999],
  [0.987124, 0.697944, 0.087731],
  [0.986694, 0.70554, 0.095694],
  [0.986175, 0.713153, 0.103863],
  [0.985566, 0.720782, 0.112229],
  [0.984865, 0.728427, 0.120785],
  [0.984075, 0.736087, 0.129527],
  [0.983196, 0.743758, 0.138453],
  [0.982228, 0.751442, 0.147565],
  [0.981173, 0.759135, 0.156863],
  [0.980032, 0.766837, 0.166353],
  [0.978806, 0.774545, 0.176037],
  [0.977497, 0.782258, 0.185923],
  [0.976108, 0.789974, 0.196018],
  [0.974638, 0.797692, 0.206332],
  [0.973088, 0.805409, 0.216877],
  [0.971468, 0.813122, 0.227658],
  [0.969783, 0.820825, 0.238686],
  [0.968041, 0.828515, 0.249972],
  [0.966243, 0.836191, 0.261534],
  [0.964394, 0.843848, 0.273391],
  [0.962517, 0.851476, 0.285546],
  [0.960626, 0.859069, 0.29801],
  [0.95872, 0.866624, 0.31082],
  [0.956834, 0.874129, 0.323974],
  [0.954997, 0.881569, 0.337475],
  [0.953215, 0.888942, 0.351369],
  [0.951546, 0.896226, 0.365627],
  [0.950018, 0.903409, 0.380271],
  [0.948683, 0.910473, 0.395289],
  [0.947594, 0.917399, 0.410665],
  [0.946809, 0.924168, 0.426373],
  [0.946392, 0.930761, 0.442367],
  [0.946403, 0.937159, 0.458592],
  [0.946903, 0.943348, 0.47497],
  [0.947937, 0.949318, 0.491426],
  [0.949545, 0.955063, 0.50786],
  [0.95174, 0.960587, 0.524203],
  [0.954529, 0.965896, 0.540361],
  [0.957896, 0.971003, 0.556275],
  [0.961812, 0.975924, 0.571925],
  [0.966249, 0.980678, 0.587206],
  [0.971162, 0.985282, 0.602154],
  [0.976511, 0.989753, 0.61676],
  [0.982257, 0.994109, 0.631017],
  [0.988362, 0.998364, 0.644924]
];

// build/src/core/Network.js
var Node = class {
  constructor(originalObject, ID, index, network) {
    for (const [nodeProperty, value] of Object.entries(originalObject)) {
      if (nodeProperty == "color" || nodeProperty == "size" || nodeProperty == "position" || nodeProperty == "outlineColor" || nodeProperty == "outlineWidth") {
        continue;
      }
      this[nodeProperty] = value;
    }
    this._network = network;
    this.ID = ID;
    this.index = index;
  }
  set color(newColor) {
    let nodeIndex = this.index;
    this._network.colors[nodeIndex * 3 + 0] = newColor[0];
    this._network.colors[nodeIndex * 3 + 1] = newColor[1];
    this._network.colors[nodeIndex * 3 + 2] = newColor[2];
  }
  get color() {
    let nodeIndex = this.index;
    return [this._network.colors[nodeIndex * 3 + 0], this._network.colors[nodeIndex * 3 + 1], this._network.colors[nodeIndex * 3 + 2]];
  }
  set size(newSize) {
    this._network.sizes[this.index] = newSize;
  }
  get size() {
    return this._network.sizes[this.index];
  }
  set outlineColor(newColor) {
    let nodeIndex = this.index;
    this._network.outlineColors[nodeIndex * 3 + 0] = newColor[0];
    this._network.outlineColors[nodeIndex * 3 + 1] = newColor[1];
    this._network.outlineColors[nodeIndex * 3 + 2] = newColor[2];
  }
  get outlineColor() {
    let nodeIndex = this.index;
    return [this._network.outlineColors[nodeIndex * 3 + 0], this._network.outlineColors[nodeIndex * 3 + 1], this._network.outlineColors[nodeIndex * 3 + 2]];
  }
  set outlineWidth(newWidth) {
    this._network.outlineWidths[this.index] = newWidth;
  }
  get outlineWidth() {
    return this._network.outlineWidths[this.index];
  }
  get network() {
    return this._network;
  }
  set position(newPosition) {
    let nodeIndex = this.index;
    this._network.positions[nodeIndex * 3 + 0] = newPosition[0];
    this._network.positions[nodeIndex * 3 + 1] = newPosition[1];
    this._network.positions[nodeIndex * 3 + 2] = newPosition[2];
  }
  get position() {
    let nodeIndex = this.index;
    return [this._network.positions[nodeIndex * 3 + 0], this._network.positions[nodeIndex * 3 + 1], this._network.positions[nodeIndex * 3 + 2]];
  }
};
var Network = class {
  constructor(nodes, edges, properties) {
    this.ID2index = new Object();
    this.index2Node = [];
    for (const [nodeID, node] of Object.entries(nodes)) {
      if (!this.ID2index.hasOwnProperty(nodeID)) {
        let nodeIndex = this.index2Node.length;
        this.ID2index[nodeID] = nodeIndex;
        node.index = nodeIndex;
        node.ID = nodeID;
        this.index2Node.push(node);
      }
    }
    this.indexedEdges = new Int32Array(edges.length * 2);
    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
      const edge = edges[edgeIndex];
      this.indexedEdges[edgeIndex * 2] = this.ID2index[edge.source];
      this.indexedEdges[edgeIndex * 2 + 1] = this.ID2index[edge.target];
    }
    this.positions = new Float32Array(3 * this.index2Node.length);
    this.colors = new Float32Array(3 * this.index2Node.length);
    this.sizes = new Float32Array(this.index2Node.length);
    this.intensities = new Float32Array(this.index2Node.length);
    this.outlineColors = new Float32Array(3 * this.index2Node.length);
    this.outlineWidths = new Float32Array(this.index2Node.length);
    this.nodes = {};
    let colorScale = linearScale([0, this.index2Node.length], [0, 1]);
    let colorMap = createColorMap(colors$2, colorScale);
    for (let index = 0; index < this.index2Node.length; index++) {
      let node = this.index2Node[index];
      if (node.hasOwnProperty("position")) {
        this.positions[index * 3] = node["position"][0];
        this.positions[index * 3 + 1] = node["position"][1];
        this.positions[index * 3 + 2] = node["position"][2];
      } else {
        this.positions[index * 3 + 0] = (Math.random() - 0.5) * 2 * 200;
        this.positions[index * 3 + 1] = (Math.random() - 0.5) * 2 * 200;
        this.positions[index * 3 + 2] = (Math.random() - 0.5) * 2 * 200;
      }
      if (node.hasOwnProperty("color")) {
        if (index == 0) {
          console.log("NODE COLOR:", node["color"]);
        }
        this.colors[index * 3 + 0] = node["color"][0];
        this.colors[index * 3 + 1] = node["color"][1];
        this.colors[index * 3 + 2] = node["color"][2];
      } else {
        let color2 = colorMap(index);
        this.colors[index * 3 + 0] = color2[0];
        this.colors[index * 3 + 1] = color2[1];
        this.colors[index * 3 + 2] = color2[2];
      }
      if (node.hasOwnProperty("size")) {
        this.sizes[index] = node["size"];
      } else {
        this.sizes[index] = 1;
      }
      if (node.hasOwnProperty("outlineColor")) {
        this.outlineColors[index * 3 + 0] = node["outlineColor"][0];
        this.outlineColors[index * 3 + 1] = node["outlineColor"][1];
        this.outlineColors[index * 3 + 2] = node["outlineColor"][2];
      } else {
        this.outlineColors[index * 3 + 0] = 255;
        this.outlineColors[index * 3 + 1] = 255;
        this.outlineColors[index * 3 + 2] = 255;
      }
      if (node.hasOwnProperty("outlineWidth")) {
        this.outlineWidths[index] = node["outlineWidth"];
      } else {
        this.outlineWidths[index] = 0;
      }
      this.intensities[index] = 1;
      let newNode = new Node(node, node.ID, index, this);
      this.index2Node[index] = newNode;
      this.nodes[node.ID] = newNode;
    }
  }
};

// build/src/utils/webglutils.js
import.meta.env = env_exports;
var requestAnimationFrame2 = function() {
  return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || function(callback, element) {
    return window.setTimeout(callback, 1e3 / 60);
  };
}();
var cancelAnimationFrame = window.cancelAnimationFrame || window.mozCancelAnimationFrame;
function createWebGLContext(canvas, opt_attribs) {
  let names = ["webgl", "experimental-webgl", "webkit-3d", "moz-webgl"];
  let context = null;
  for (let ii = 0; ii < names.length; ++ii) {
    try {
      context = canvas.getContext(names[ii], opt_attribs);
    } catch (e) {
    }
    if (context) {
      break;
    }
  }
  return context;
}
async function getShader(gl, ID) {
  let shaderScript = document.getElementById(ID);
  if (!shaderScript) {
    return null;
  }
  let str = "";
  let k = shaderScript.firstChild;
  while (k) {
    if (k.nodeType == 3) {
      str += k.textContent;
    }
    k = k.nextSibling;
  }
  if (shaderScript.src) {
    str = await fetch(shaderScript.src).then((response) => response.text());
  }
  let shader;
  if (shaderScript.type == "text/glsl-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == "text/glsl-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }
  gl.shaderSource(shader, str);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.log("ERROR with script: ", ID);
    console.log(gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}
function ShaderProgram(vertexShader, fragmentShader, uniforms, attributes, glContext) {
  let shaderProgram = glContext.createProgram();
  glContext.attachShader(shaderProgram, vertexShader);
  glContext.attachShader(shaderProgram, fragmentShader);
  glContext.linkProgram(shaderProgram);
  if (!glContext.getProgramParameter(shaderProgram, glContext.LINK_STATUS)) {
    alert("Shader Compilation Error." + glContext.getProgramInfoLog(shaderProgram));
    return;
  }
  this.ID = shaderProgram;
  this.uniforms = new Object();
  this.attributes = new Object();
  if (uniforms) {
    for (let i = 0; i < uniforms.length; i++) {
      this.uniforms[uniforms[i]] = glContext.getUniformLocation(this.ID, uniforms[i]);
    }
  }
  this.attributes.enable = function(attributeName) {
    glContext.enableVertexAttribArray(this[attributeName]);
  };
  this.attributes.disable = function(attributeName) {
    glContext.disableVertexAttribArray(this[attributeName]);
  };
  if (attributes) {
    for (let i = 0; i < attributes.length; i++) {
      this.attributes[attributes[i]] = glContext.getAttribLocation(this.ID, attributes[i]);
    }
  }
  this.use = function(glContext2) {
    glContext2.useProgram(this.ID);
  };
}
function makePlane(ctx, generateNormal = true, generateTexCoord = true) {
  let geometryData = [
    -1,
    1,
    0,
    -1,
    -1,
    0,
    1,
    1,
    0,
    1,
    -1,
    0
  ];
  let normalData = [
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1
  ];
  let texCoordData = [
    0,
    1,
    0,
    1,
    0,
    0,
    1,
    1,
    0,
    0,
    0,
    0
  ];
  let retval = {};
  if (generateTexCoord) {
    retval.texCoordObject = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, retval.texCoordObject);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(texCoordData), ctx.STATIC_DRAW);
  }
  if (generateNormal) {
    retval.normalObject = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, retval.normalObject);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(normalData), ctx.STATIC_DRAW);
  }
  retval.vertexObject = ctx.createBuffer();
  ctx.bindBuffer(ctx.ARRAY_BUFFER, retval.vertexObject);
  ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(geometryData), ctx.STATIC_DRAW);
  retval.numIndices = 4;
  return retval;
}
function degToRad(degrees3) {
  return degrees3 * Math.PI / 180;
}

// build/src/utils/xnet.js
var xnet_exports = {};
__export(xnet_exports, {
  loadXNET: () => loadXNET,
  loadXNETFile: () => loadXNETFile
});
"use strict";
var textSplit2 = (text) => {
  let entries = text.split(/\s/);
  if (entries.length < 2) {
    return null;
  }
  return [+entries[0], +entries[1]];
};
var textSplit3 = (text) => {
  let entries = text.split(/\s/);
  if (entries.length < 3) {
    return null;
  }
  return [+entries[0], +entries[1], +entries[2]];
};
var readNumberIgnoringNone = (text) => {
  if (isNaN(text)) {
    return 0;
  } else {
    return +text;
  }
};
var propertyHeaderRegular = /#([ve]) \"(.+)\" ([sn]|v2|v3)/;
var propertyFunctions = {
  s: String,
  n: readNumberIgnoringNone,
  v2: textSplit2,
  v3: textSplit3
};
var readXNETVerticesHeader = (status) => {
  while (status.lineIndex + 1 < status.lines.length && status.lines[status.lineIndex].length == 0) {
    status.lineIndex++;
  }
  let headerLine = status.lines[status.lineIndex];
  let headerEntries = headerLine.split(/\s/);
  let nodeCount = 0;
  if (headerEntries.length == 0 || headerEntries[0].toLowerCase() != "#vertices" || isNaN(headerEntries[1]) || !Number.isInteger(+headerEntries[1])) {
    throw `Malformed xnet data (Reading Vertices Header)[line: ${status.lineIndex}]
	> ${status.lines[status.lineIndex]}`;
  }
  nodeCount = +headerEntries[1];
  status.lineIndex++;
  return nodeCount;
};
var readXNETLabels = (status) => {
  let labels = [];
  while (status.lineIndex < status.lines.length) {
    let currentLine = status.lines[status.lineIndex];
    let lineLength = currentLine.length;
    if (lineLength == 0) {
      status.lineIndex++;
      continue;
    }
    if (currentLine[0] == "#") {
      break;
    }
    var label = currentLine;
    if (currentLine[0] == '"' && currentLine[lineLength - 1] == '"') {
      label = currentLine.slice(1, -1);
    }
    labels.push(label);
    status.lineIndex++;
  }
  return labels;
};
var readXNETEdgesHeader = (status) => {
  while (status.lineIndex + 1 < status.lines.length && status.lines[status.lineIndex].length == 0) {
    status.lineIndex++;
  }
  let headerLine = status.lines[status.lineIndex];
  let headerEntries = headerLine.split(/\s/);
  let weighted = false;
  let directed = false;
  if (headerEntries.length == 0 || headerEntries[0].toLowerCase() != "#edges") {
    throw `Malformed xnet data (Reading Edges Header)[line: ${status.lineIndex}]
	> ${status.lines[status.lineIndex]}`;
  }
  headerEntries.forEach((headerEntry) => {
    if (headerEntry.toLowerCase() == "weighted") {
      weighted = true;
    }
    if (headerEntry.toLowerCase() == "nonweighted") {
      weighted = false;
    }
    if (headerEntry.toLowerCase() == "directed") {
      directed = true;
    }
    if (headerEntry.toLowerCase() == "undirected") {
      directed = false;
    }
  });
  status.lineIndex++;
  return {weighted, directed};
};
var readXNETEdges = (status) => {
  let edges = [];
  let weights = [];
  while (status.lineIndex < status.lines.length) {
    let currentLine = status.lines[status.lineIndex];
    let lineLength = currentLine.length;
    if (lineLength == 0) {
      status.lineIndex++;
      continue;
    }
    if (currentLine[0] == "#") {
      break;
    }
    let entries = currentLine.split(/\s/);
    let weight = 1;
    if (entries.length < 2) {
      throw `Malformed xnet data (Reading Edges)[line: ${status.lineIndex}]
	> ${status.lines[status.lineIndex]}`;
    }
    if (entries.length > 2) {
      weight = +entries[2];
    }
    edges.push([+entries[0], +entries[1]]);
    weights.push(weight);
    status.lineIndex++;
  }
  return {edges, weights};
};
var readXNETPropertyHeader = (status) => {
  while (status.lineIndex + 1 < status.lines.length && status.lines[status.lineIndex].length == 0) {
    status.lineIndex++;
  }
  let headerEntries = propertyHeaderRegular.exec(status.lines[status.lineIndex]);
  if (headerEntries.length != 4) {
    throw `Malformed xnet data [line: ${status.lineIndex}]
	> ${status.lines[status.lineIndex]}`;
  }
  let propertyType = headerEntries[1];
  let propertyKey = headerEntries[2];
  let propertyFormat = headerEntries[3];
  status.lineIndex++;
  return {type: propertyType, key: propertyKey, format: propertyFormat};
};
var readXNETProperty = (status, propertyHeader) => {
  let properties = [];
  let propertyFunction2 = propertyFunctions[propertyHeader.format];
  while (status.lineIndex < status.lines.length) {
    let currentLine = status.lines[status.lineIndex];
    let lineLength = currentLine.length;
    if (lineLength == 0) {
      status.lineIndex++;
      continue;
    }
    if (currentLine[0] == "#") {
      break;
    }
    let value = currentLine;
    if (value[0] == '"' && value[lineLength - 1] == '"') {
      value = value.slice(1, -1);
    }
    properties.push(propertyFunction2(value));
    status.lineIndex++;
  }
  return properties;
};
var loadXNET = (data) => {
  let status = {lineIndex: 0, lines: data.split("\n")};
  let nodesCount = readXNETVerticesHeader(status);
  let labels = readXNETLabels(status);
  let network = {nodesCount, verticesProperties: {}, edgesProperties: {}};
  if (labels.length > 0) {
    if (labels.length < nodesCount) {
      throw `Malformed xnet data [line: ${status.lineIndex}]
	> ${status.lines[status.lineIndex]}`;
    } else {
      network.labels = labels;
    }
  }
  let edgesHeader = readXNETEdgesHeader(status);
  network.directed = edgesHeader.directed;
  network.weighted = edgesHeader.weighted;
  let edgesData = readXNETEdges(status);
  network.edges = edgesData.edges;
  if (network.weighted) {
    network.weights = edgesData.weights;
  }
  do {
    while (status.lineIndex < status.lines.length && status.lines[status.lineIndex].length == 0) {
      status.lineIndex++;
    }
    if (!(status.lineIndex < status.lines.length)) {
      break;
    }
    let propertyHeader = readXNETPropertyHeader(status);
    let propertyData = readXNETProperty(status, propertyHeader);
    if (propertyHeader.type == "e") {
      network.edgesProperties[propertyHeader.key] = propertyData;
    } else if (propertyHeader.type == "v") {
      network.verticesProperties[propertyHeader.key] = propertyData;
    }
  } while (status.lineIndex < status.lines.length);
  return network;
};
async function loadXNETFile(networkFile) {
  let networkData = await fetch(networkFile).then((response) => response.text());
  return loadXNET(networkData);
}

// build/_snowpack/pkg/common/select-9bda5bb9.js
var xhtml = "http://www.w3.org/1999/xhtml";
var namespaces = {
  svg: "http://www.w3.org/2000/svg",
  xhtml,
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace",
  xmlns: "http://www.w3.org/2000/xmlns/"
};
function namespace(name) {
  var prefix = name += "", i = prefix.indexOf(":");
  if (i >= 0 && (prefix = name.slice(0, i)) !== "xmlns")
    name = name.slice(i + 1);
  return namespaces.hasOwnProperty(prefix) ? {space: namespaces[prefix], local: name} : name;
}
function creatorInherit(name) {
  return function() {
    var document2 = this.ownerDocument, uri = this.namespaceURI;
    return uri === xhtml && document2.documentElement.namespaceURI === xhtml ? document2.createElement(name) : document2.createElementNS(uri, name);
  };
}
function creatorFixed(fullname) {
  return function() {
    return this.ownerDocument.createElementNS(fullname.space, fullname.local);
  };
}
function creator(name) {
  var fullname = namespace(name);
  return (fullname.local ? creatorFixed : creatorInherit)(fullname);
}
function none() {
}
function selector(selector2) {
  return selector2 == null ? none : function() {
    return this.querySelector(selector2);
  };
}
function selection_select(select2) {
  if (typeof select2 !== "function")
    select2 = selector(select2);
  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i) {
      if ((node = group[i]) && (subnode = select2.call(node, node.__data__, i, group))) {
        if ("__data__" in node)
          subnode.__data__ = node.__data__;
        subgroup[i] = subnode;
      }
    }
  }
  return new Selection(subgroups, this._parents);
}
function array(x) {
  return x == null ? [] : Array.isArray(x) ? x : Array.from(x);
}
function empty() {
  return [];
}
function selectorAll(selector2) {
  return selector2 == null ? empty : function() {
    return this.querySelectorAll(selector2);
  };
}
function arrayAll(select2) {
  return function() {
    return array(select2.apply(this, arguments));
  };
}
function selection_selectAll(select2) {
  if (typeof select2 === "function")
    select2 = arrayAll(select2);
  else
    select2 = selectorAll(select2);
  for (var groups = this._groups, m = groups.length, subgroups = [], parents = [], j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
      if (node = group[i]) {
        subgroups.push(select2.call(node, node.__data__, i, group));
        parents.push(node);
      }
    }
  }
  return new Selection(subgroups, parents);
}
function matcher(selector2) {
  return function() {
    return this.matches(selector2);
  };
}
function childMatcher(selector2) {
  return function(node) {
    return node.matches(selector2);
  };
}
var find = Array.prototype.find;
function childFind(match) {
  return function() {
    return find.call(this.children, match);
  };
}
function childFirst() {
  return this.firstElementChild;
}
function selection_selectChild(match) {
  return this.select(match == null ? childFirst : childFind(typeof match === "function" ? match : childMatcher(match)));
}
var filter = Array.prototype.filter;
function children() {
  return Array.from(this.children);
}
function childrenFilter(match) {
  return function() {
    return filter.call(this.children, match);
  };
}
function selection_selectChildren(match) {
  return this.selectAll(match == null ? children : childrenFilter(typeof match === "function" ? match : childMatcher(match)));
}
function selection_filter(match) {
  if (typeof match !== "function")
    match = matcher(match);
  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i) {
      if ((node = group[i]) && match.call(node, node.__data__, i, group)) {
        subgroup.push(node);
      }
    }
  }
  return new Selection(subgroups, this._parents);
}
function sparse(update) {
  return new Array(update.length);
}
function selection_enter() {
  return new Selection(this._enter || this._groups.map(sparse), this._parents);
}
function EnterNode(parent, datum2) {
  this.ownerDocument = parent.ownerDocument;
  this.namespaceURI = parent.namespaceURI;
  this._next = null;
  this._parent = parent;
  this.__data__ = datum2;
}
EnterNode.prototype = {
  constructor: EnterNode,
  appendChild: function(child) {
    return this._parent.insertBefore(child, this._next);
  },
  insertBefore: function(child, next) {
    return this._parent.insertBefore(child, next);
  },
  querySelector: function(selector2) {
    return this._parent.querySelector(selector2);
  },
  querySelectorAll: function(selector2) {
    return this._parent.querySelectorAll(selector2);
  }
};
function constant(x) {
  return function() {
    return x;
  };
}
function bindIndex(parent, group, enter, update, exit, data) {
  var i = 0, node, groupLength = group.length, dataLength = data.length;
  for (; i < dataLength; ++i) {
    if (node = group[i]) {
      node.__data__ = data[i];
      update[i] = node;
    } else {
      enter[i] = new EnterNode(parent, data[i]);
    }
  }
  for (; i < groupLength; ++i) {
    if (node = group[i]) {
      exit[i] = node;
    }
  }
}
function bindKey(parent, group, enter, update, exit, data, key) {
  var i, node, nodeByKeyValue = new Map(), groupLength = group.length, dataLength = data.length, keyValues = new Array(groupLength), keyValue;
  for (i = 0; i < groupLength; ++i) {
    if (node = group[i]) {
      keyValues[i] = keyValue = key.call(node, node.__data__, i, group) + "";
      if (nodeByKeyValue.has(keyValue)) {
        exit[i] = node;
      } else {
        nodeByKeyValue.set(keyValue, node);
      }
    }
  }
  for (i = 0; i < dataLength; ++i) {
    keyValue = key.call(parent, data[i], i, data) + "";
    if (node = nodeByKeyValue.get(keyValue)) {
      update[i] = node;
      node.__data__ = data[i];
      nodeByKeyValue.delete(keyValue);
    } else {
      enter[i] = new EnterNode(parent, data[i]);
    }
  }
  for (i = 0; i < groupLength; ++i) {
    if ((node = group[i]) && nodeByKeyValue.get(keyValues[i]) === node) {
      exit[i] = node;
    }
  }
}
function datum(node) {
  return node.__data__;
}
function selection_data(value, key) {
  if (!arguments.length)
    return Array.from(this, datum);
  var bind = key ? bindKey : bindIndex, parents = this._parents, groups = this._groups;
  if (typeof value !== "function")
    value = constant(value);
  for (var m = groups.length, update = new Array(m), enter = new Array(m), exit = new Array(m), j = 0; j < m; ++j) {
    var parent = parents[j], group = groups[j], groupLength = group.length, data = arraylike(value.call(parent, parent && parent.__data__, j, parents)), dataLength = data.length, enterGroup = enter[j] = new Array(dataLength), updateGroup = update[j] = new Array(dataLength), exitGroup = exit[j] = new Array(groupLength);
    bind(parent, group, enterGroup, updateGroup, exitGroup, data, key);
    for (var i0 = 0, i1 = 0, previous, next; i0 < dataLength; ++i0) {
      if (previous = enterGroup[i0]) {
        if (i0 >= i1)
          i1 = i0 + 1;
        while (!(next = updateGroup[i1]) && ++i1 < dataLength)
          ;
        previous._next = next || null;
      }
    }
  }
  update = new Selection(update, parents);
  update._enter = enter;
  update._exit = exit;
  return update;
}
function arraylike(data) {
  return typeof data === "object" && "length" in data ? data : Array.from(data);
}
function selection_exit() {
  return new Selection(this._exit || this._groups.map(sparse), this._parents);
}
function selection_join(onenter, onupdate, onexit) {
  var enter = this.enter(), update = this, exit = this.exit();
  if (typeof onenter === "function") {
    enter = onenter(enter);
    if (enter)
      enter = enter.selection();
  } else {
    enter = enter.append(onenter + "");
  }
  if (onupdate != null) {
    update = onupdate(update);
    if (update)
      update = update.selection();
  }
  if (onexit == null)
    exit.remove();
  else
    onexit(exit);
  return enter && update ? enter.merge(update).order() : update;
}
function selection_merge(context) {
  var selection2 = context.selection ? context.selection() : context;
  for (var groups0 = this._groups, groups1 = selection2._groups, m0 = groups0.length, m1 = groups1.length, m = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m; ++j) {
    for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge2 = merges[j] = new Array(n), node, i = 0; i < n; ++i) {
      if (node = group0[i] || group1[i]) {
        merge2[i] = node;
      }
    }
  }
  for (; j < m0; ++j) {
    merges[j] = groups0[j];
  }
  return new Selection(merges, this._parents);
}
function selection_order() {
  for (var groups = this._groups, j = -1, m = groups.length; ++j < m; ) {
    for (var group = groups[j], i = group.length - 1, next = group[i], node; --i >= 0; ) {
      if (node = group[i]) {
        if (next && node.compareDocumentPosition(next) ^ 4)
          next.parentNode.insertBefore(node, next);
        next = node;
      }
    }
  }
  return this;
}
function selection_sort(compare) {
  if (!compare)
    compare = ascending;
  function compareNode(a, b) {
    return a && b ? compare(a.__data__, b.__data__) : !a - !b;
  }
  for (var groups = this._groups, m = groups.length, sortgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, sortgroup = sortgroups[j] = new Array(n), node, i = 0; i < n; ++i) {
      if (node = group[i]) {
        sortgroup[i] = node;
      }
    }
    sortgroup.sort(compareNode);
  }
  return new Selection(sortgroups, this._parents).order();
}
function ascending(a, b) {
  return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
}
function selection_call() {
  var callback = arguments[0];
  arguments[0] = this;
  callback.apply(null, arguments);
  return this;
}
function selection_nodes() {
  return Array.from(this);
}
function selection_node() {
  for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
    for (var group = groups[j], i = 0, n = group.length; i < n; ++i) {
      var node = group[i];
      if (node)
        return node;
    }
  }
  return null;
}
function selection_size() {
  let size = 0;
  for (const node of this)
    ++size;
  return size;
}
function selection_empty() {
  return !this.node();
}
function selection_each(callback) {
  for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
    for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i) {
      if (node = group[i])
        callback.call(node, node.__data__, i, group);
    }
  }
  return this;
}
function attrRemove(name) {
  return function() {
    this.removeAttribute(name);
  };
}
function attrRemoveNS(fullname) {
  return function() {
    this.removeAttributeNS(fullname.space, fullname.local);
  };
}
function attrConstant(name, value) {
  return function() {
    this.setAttribute(name, value);
  };
}
function attrConstantNS(fullname, value) {
  return function() {
    this.setAttributeNS(fullname.space, fullname.local, value);
  };
}
function attrFunction(name, value) {
  return function() {
    var v = value.apply(this, arguments);
    if (v == null)
      this.removeAttribute(name);
    else
      this.setAttribute(name, v);
  };
}
function attrFunctionNS(fullname, value) {
  return function() {
    var v = value.apply(this, arguments);
    if (v == null)
      this.removeAttributeNS(fullname.space, fullname.local);
    else
      this.setAttributeNS(fullname.space, fullname.local, v);
  };
}
function selection_attr(name, value) {
  var fullname = namespace(name);
  if (arguments.length < 2) {
    var node = this.node();
    return fullname.local ? node.getAttributeNS(fullname.space, fullname.local) : node.getAttribute(fullname);
  }
  return this.each((value == null ? fullname.local ? attrRemoveNS : attrRemove : typeof value === "function" ? fullname.local ? attrFunctionNS : attrFunction : fullname.local ? attrConstantNS : attrConstant)(fullname, value));
}
function defaultView(node) {
  return node.ownerDocument && node.ownerDocument.defaultView || node.document && node || node.defaultView;
}
function styleRemove(name) {
  return function() {
    this.style.removeProperty(name);
  };
}
function styleConstant(name, value, priority) {
  return function() {
    this.style.setProperty(name, value, priority);
  };
}
function styleFunction(name, value, priority) {
  return function() {
    var v = value.apply(this, arguments);
    if (v == null)
      this.style.removeProperty(name);
    else
      this.style.setProperty(name, v, priority);
  };
}
function selection_style(name, value, priority) {
  return arguments.length > 1 ? this.each((value == null ? styleRemove : typeof value === "function" ? styleFunction : styleConstant)(name, value, priority == null ? "" : priority)) : styleValue(this.node(), name);
}
function styleValue(node, name) {
  return node.style.getPropertyValue(name) || defaultView(node).getComputedStyle(node, null).getPropertyValue(name);
}
function propertyRemove(name) {
  return function() {
    delete this[name];
  };
}
function propertyConstant(name, value) {
  return function() {
    this[name] = value;
  };
}
function propertyFunction(name, value) {
  return function() {
    var v = value.apply(this, arguments);
    if (v == null)
      delete this[name];
    else
      this[name] = v;
  };
}
function selection_property(name, value) {
  return arguments.length > 1 ? this.each((value == null ? propertyRemove : typeof value === "function" ? propertyFunction : propertyConstant)(name, value)) : this.node()[name];
}
function classArray(string) {
  return string.trim().split(/^|\s+/);
}
function classList(node) {
  return node.classList || new ClassList(node);
}
function ClassList(node) {
  this._node = node;
  this._names = classArray(node.getAttribute("class") || "");
}
ClassList.prototype = {
  add: function(name) {
    var i = this._names.indexOf(name);
    if (i < 0) {
      this._names.push(name);
      this._node.setAttribute("class", this._names.join(" "));
    }
  },
  remove: function(name) {
    var i = this._names.indexOf(name);
    if (i >= 0) {
      this._names.splice(i, 1);
      this._node.setAttribute("class", this._names.join(" "));
    }
  },
  contains: function(name) {
    return this._names.indexOf(name) >= 0;
  }
};
function classedAdd(node, names) {
  var list = classList(node), i = -1, n = names.length;
  while (++i < n)
    list.add(names[i]);
}
function classedRemove(node, names) {
  var list = classList(node), i = -1, n = names.length;
  while (++i < n)
    list.remove(names[i]);
}
function classedTrue(names) {
  return function() {
    classedAdd(this, names);
  };
}
function classedFalse(names) {
  return function() {
    classedRemove(this, names);
  };
}
function classedFunction(names, value) {
  return function() {
    (value.apply(this, arguments) ? classedAdd : classedRemove)(this, names);
  };
}
function selection_classed(name, value) {
  var names = classArray(name + "");
  if (arguments.length < 2) {
    var list = classList(this.node()), i = -1, n = names.length;
    while (++i < n)
      if (!list.contains(names[i]))
        return false;
    return true;
  }
  return this.each((typeof value === "function" ? classedFunction : value ? classedTrue : classedFalse)(names, value));
}
function textRemove() {
  this.textContent = "";
}
function textConstant(value) {
  return function() {
    this.textContent = value;
  };
}
function textFunction(value) {
  return function() {
    var v = value.apply(this, arguments);
    this.textContent = v == null ? "" : v;
  };
}
function selection_text(value) {
  return arguments.length ? this.each(value == null ? textRemove : (typeof value === "function" ? textFunction : textConstant)(value)) : this.node().textContent;
}
function htmlRemove() {
  this.innerHTML = "";
}
function htmlConstant(value) {
  return function() {
    this.innerHTML = value;
  };
}
function htmlFunction(value) {
  return function() {
    var v = value.apply(this, arguments);
    this.innerHTML = v == null ? "" : v;
  };
}
function selection_html(value) {
  return arguments.length ? this.each(value == null ? htmlRemove : (typeof value === "function" ? htmlFunction : htmlConstant)(value)) : this.node().innerHTML;
}
function raise() {
  if (this.nextSibling)
    this.parentNode.appendChild(this);
}
function selection_raise() {
  return this.each(raise);
}
function lower() {
  if (this.previousSibling)
    this.parentNode.insertBefore(this, this.parentNode.firstChild);
}
function selection_lower() {
  return this.each(lower);
}
function selection_append(name) {
  var create2 = typeof name === "function" ? name : creator(name);
  return this.select(function() {
    return this.appendChild(create2.apply(this, arguments));
  });
}
function constantNull() {
  return null;
}
function selection_insert(name, before) {
  var create2 = typeof name === "function" ? name : creator(name), select2 = before == null ? constantNull : typeof before === "function" ? before : selector(before);
  return this.select(function() {
    return this.insertBefore(create2.apply(this, arguments), select2.apply(this, arguments) || null);
  });
}
function remove() {
  var parent = this.parentNode;
  if (parent)
    parent.removeChild(this);
}
function selection_remove() {
  return this.each(remove);
}
function selection_cloneShallow() {
  var clone = this.cloneNode(false), parent = this.parentNode;
  return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
}
function selection_cloneDeep() {
  var clone = this.cloneNode(true), parent = this.parentNode;
  return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
}
function selection_clone(deep) {
  return this.select(deep ? selection_cloneDeep : selection_cloneShallow);
}
function selection_datum(value) {
  return arguments.length ? this.property("__data__", value) : this.node().__data__;
}
function contextListener(listener) {
  return function(event) {
    listener.call(this, event, this.__data__);
  };
}
function parseTypenames(typenames) {
  return typenames.trim().split(/^|\s+/).map(function(t) {
    var name = "", i = t.indexOf(".");
    if (i >= 0)
      name = t.slice(i + 1), t = t.slice(0, i);
    return {type: t, name};
  });
}
function onRemove(typename) {
  return function() {
    var on = this.__on;
    if (!on)
      return;
    for (var j = 0, i = -1, m = on.length, o; j < m; ++j) {
      if (o = on[j], (!typename.type || o.type === typename.type) && o.name === typename.name) {
        this.removeEventListener(o.type, o.listener, o.options);
      } else {
        on[++i] = o;
      }
    }
    if (++i)
      on.length = i;
    else
      delete this.__on;
  };
}
function onAdd(typename, value, options) {
  return function() {
    var on = this.__on, o, listener = contextListener(value);
    if (on)
      for (var j = 0, m = on.length; j < m; ++j) {
        if ((o = on[j]).type === typename.type && o.name === typename.name) {
          this.removeEventListener(o.type, o.listener, o.options);
          this.addEventListener(o.type, o.listener = listener, o.options = options);
          o.value = value;
          return;
        }
      }
    this.addEventListener(typename.type, listener, options);
    o = {type: typename.type, name: typename.name, value, listener, options};
    if (!on)
      this.__on = [o];
    else
      on.push(o);
  };
}
function selection_on(typename, value, options) {
  var typenames = parseTypenames(typename + ""), i, n = typenames.length, t;
  if (arguments.length < 2) {
    var on = this.node().__on;
    if (on)
      for (var j = 0, m = on.length, o; j < m; ++j) {
        for (i = 0, o = on[j]; i < n; ++i) {
          if ((t = typenames[i]).type === o.type && t.name === o.name) {
            return o.value;
          }
        }
      }
    return;
  }
  on = value ? onAdd : onRemove;
  for (i = 0; i < n; ++i)
    this.each(on(typenames[i], value, options));
  return this;
}
function dispatchEvent(node, type, params) {
  var window2 = defaultView(node), event = window2.CustomEvent;
  if (typeof event === "function") {
    event = new event(type, params);
  } else {
    event = window2.document.createEvent("Event");
    if (params)
      event.initEvent(type, params.bubbles, params.cancelable), event.detail = params.detail;
    else
      event.initEvent(type, false, false);
  }
  node.dispatchEvent(event);
}
function dispatchConstant(type, params) {
  return function() {
    return dispatchEvent(this, type, params);
  };
}
function dispatchFunction(type, params) {
  return function() {
    return dispatchEvent(this, type, params.apply(this, arguments));
  };
}
function selection_dispatch(type, params) {
  return this.each((typeof params === "function" ? dispatchFunction : dispatchConstant)(type, params));
}
function* selection_iterator() {
  for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
    for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i) {
      if (node = group[i])
        yield node;
    }
  }
}
var root = [null];
function Selection(groups, parents) {
  this._groups = groups;
  this._parents = parents;
}
function selection() {
  return new Selection([[document.documentElement]], root);
}
function selection_selection() {
  return this;
}
Selection.prototype = selection.prototype = {
  constructor: Selection,
  select: selection_select,
  selectAll: selection_selectAll,
  selectChild: selection_selectChild,
  selectChildren: selection_selectChildren,
  filter: selection_filter,
  data: selection_data,
  enter: selection_enter,
  exit: selection_exit,
  join: selection_join,
  merge: selection_merge,
  selection: selection_selection,
  order: selection_order,
  sort: selection_sort,
  call: selection_call,
  nodes: selection_nodes,
  node: selection_node,
  size: selection_size,
  empty: selection_empty,
  each: selection_each,
  attr: selection_attr,
  style: selection_style,
  property: selection_property,
  classed: selection_classed,
  text: selection_text,
  html: selection_html,
  raise: selection_raise,
  lower: selection_lower,
  append: selection_append,
  insert: selection_insert,
  remove: selection_remove,
  clone: selection_clone,
  datum: selection_datum,
  on: selection_on,
  dispatch: selection_dispatch,
  [Symbol.iterator]: selection_iterator
};
function select(selector2) {
  return typeof selector2 === "string" ? new Selection([[document.querySelector(selector2)]], [document.documentElement]) : new Selection([[selector2]], root);
}

// build/_snowpack/pkg/common/dispatch-a4cc9f48.js
var noop = {value: () => {
}};
function dispatch() {
  for (var i = 0, n = arguments.length, _ = {}, t; i < n; ++i) {
    if (!(t = arguments[i] + "") || t in _ || /[\s.]/.test(t))
      throw new Error("illegal type: " + t);
    _[t] = [];
  }
  return new Dispatch(_);
}
function Dispatch(_) {
  this._ = _;
}
function parseTypenames2(typenames, types) {
  return typenames.trim().split(/^|\s+/).map(function(t) {
    var name = "", i = t.indexOf(".");
    if (i >= 0)
      name = t.slice(i + 1), t = t.slice(0, i);
    if (t && !types.hasOwnProperty(t))
      throw new Error("unknown type: " + t);
    return {type: t, name};
  });
}
Dispatch.prototype = dispatch.prototype = {
  constructor: Dispatch,
  on: function(typename, callback) {
    var _ = this._, T = parseTypenames2(typename + "", _), t, i = -1, n = T.length;
    if (arguments.length < 2) {
      while (++i < n)
        if ((t = (typename = T[i]).type) && (t = get(_[t], typename.name)))
          return t;
      return;
    }
    if (callback != null && typeof callback !== "function")
      throw new Error("invalid callback: " + callback);
    while (++i < n) {
      if (t = (typename = T[i]).type)
        _[t] = set(_[t], typename.name, callback);
      else if (callback == null)
        for (t in _)
          _[t] = set(_[t], typename.name, null);
    }
    return this;
  },
  copy: function() {
    var copy2 = {}, _ = this._;
    for (var t in _)
      copy2[t] = _[t].slice();
    return new Dispatch(copy2);
  },
  call: function(type, that) {
    if ((n = arguments.length - 2) > 0)
      for (var args = new Array(n), i = 0, n, t; i < n; ++i)
        args[i] = arguments[i + 2];
    if (!this._.hasOwnProperty(type))
      throw new Error("unknown type: " + type);
    for (t = this._[type], i = 0, n = t.length; i < n; ++i)
      t[i].value.apply(that, args);
  },
  apply: function(type, that, args) {
    if (!this._.hasOwnProperty(type))
      throw new Error("unknown type: " + type);
    for (var t = this._[type], i = 0, n = t.length; i < n; ++i)
      t[i].value.apply(that, args);
  }
};
function get(type, name) {
  for (var i = 0, n = type.length, c2; i < n; ++i) {
    if ((c2 = type[i]).name === name) {
      return c2.value;
    }
  }
}
function set(type, name, callback) {
  for (var i = 0, n = type.length; i < n; ++i) {
    if (type[i].name === name) {
      type[i] = noop, type = type.slice(0, i).concat(type.slice(i + 1));
      break;
    }
  }
  if (callback != null)
    type.push({name, value: callback});
  return type;
}

// build/_snowpack/pkg/common/timer-0f89e737.js
var frame = 0;
var timeout = 0;
var interval = 0;
var pokeDelay = 1e3;
var taskHead;
var taskTail;
var clockLast = 0;
var clockNow = 0;
var clockSkew = 0;
var clock = typeof performance === "object" && performance.now ? performance : Date;
var setFrame = typeof window === "object" && window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function(f) {
  setTimeout(f, 17);
};
function now() {
  return clockNow || (setFrame(clearNow), clockNow = clock.now() + clockSkew);
}
function clearNow() {
  clockNow = 0;
}
function Timer() {
  this._call = this._time = this._next = null;
}
Timer.prototype = timer.prototype = {
  constructor: Timer,
  restart: function(callback, delay, time) {
    if (typeof callback !== "function")
      throw new TypeError("callback is not a function");
    time = (time == null ? now() : +time) + (delay == null ? 0 : +delay);
    if (!this._next && taskTail !== this) {
      if (taskTail)
        taskTail._next = this;
      else
        taskHead = this;
      taskTail = this;
    }
    this._call = callback;
    this._time = time;
    sleep();
  },
  stop: function() {
    if (this._call) {
      this._call = null;
      this._time = Infinity;
      sleep();
    }
  }
};
function timer(callback, delay, time) {
  var t = new Timer();
  t.restart(callback, delay, time);
  return t;
}
function timerFlush() {
  now();
  ++frame;
  var t = taskHead, e;
  while (t) {
    if ((e = clockNow - t._time) >= 0)
      t._call.call(void 0, e);
    t = t._next;
  }
  --frame;
}
function wake() {
  clockNow = (clockLast = clock.now()) + clockSkew;
  frame = timeout = 0;
  try {
    timerFlush();
  } finally {
    frame = 0;
    nap();
    clockNow = 0;
  }
}
function poke() {
  var now2 = clock.now(), delay = now2 - clockLast;
  if (delay > pokeDelay)
    clockSkew -= delay, clockLast = now2;
}
function nap() {
  var t0, t1 = taskHead, t2, time = Infinity;
  while (t1) {
    if (t1._call) {
      if (time > t1._time)
        time = t1._time;
      t0 = t1, t1 = t1._next;
    } else {
      t2 = t1._next, t1._next = null;
      t1 = t0 ? t0._next = t2 : taskHead = t2;
    }
  }
  taskTail = t0;
  sleep(time);
}
function sleep(time) {
  if (frame)
    return;
  if (timeout)
    timeout = clearTimeout(timeout);
  var delay = time - clockNow;
  if (delay > 24) {
    if (time < Infinity)
      timeout = setTimeout(wake, time - clock.now() - clockSkew);
    if (interval)
      interval = clearInterval(interval);
  } else {
    if (!interval)
      clockLast = clock.now(), interval = setInterval(poke, pokeDelay);
    frame = 1, setFrame(wake);
  }
}

// build/_snowpack/pkg/common/string-cfd0b55d.js
function interpolateNumber(a, b) {
  return a = +a, b = +b, function(t) {
    return a * (1 - t) + b * t;
  };
}
var reA = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g;
var reB = new RegExp(reA.source, "g");
function zero2(b) {
  return function() {
    return b;
  };
}
function one(b) {
  return function(t) {
    return b(t) + "";
  };
}
function interpolateString(a, b) {
  var bi = reA.lastIndex = reB.lastIndex = 0, am, bm, bs, i = -1, s = [], q = [];
  a = a + "", b = b + "";
  while ((am = reA.exec(a)) && (bm = reB.exec(b))) {
    if ((bs = bm.index) > bi) {
      bs = b.slice(bi, bs);
      if (s[i])
        s[i] += bs;
      else
        s[++i] = bs;
    }
    if ((am = am[0]) === (bm = bm[0])) {
      if (s[i])
        s[i] += bm;
      else
        s[++i] = bm;
    } else {
      s[++i] = null;
      q.push({i, x: interpolateNumber(am, bm)});
    }
    bi = reB.lastIndex;
  }
  if (bi < b.length) {
    bs = b.slice(bi);
    if (s[i])
      s[i] += bs;
    else
      s[++i] = bs;
  }
  return s.length < 2 ? q[0] ? one(q[0].x) : zero2(b) : (b = q.length, function(t) {
    for (var i2 = 0, o; i2 < b; ++i2)
      s[(o = q[i2]).i] = o.x(t);
    return s.join("");
  });
}

// build/_snowpack/pkg/common/color-a4ab9cc4.js
function define(constructor, factory, prototype) {
  constructor.prototype = factory.prototype = prototype;
  prototype.constructor = constructor;
}
function extend(parent, definition) {
  var prototype = Object.create(parent.prototype);
  for (var key in definition)
    prototype[key] = definition[key];
  return prototype;
}
function Color() {
}
var darker = 0.7;
var brighter = 1 / darker;
var reI = "\\s*([+-]?\\d+)\\s*";
var reN = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)\\s*";
var reP = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)%\\s*";
var reHex = /^#([0-9a-f]{3,8})$/;
var reRgbInteger = new RegExp("^rgb\\(" + [reI, reI, reI] + "\\)$");
var reRgbPercent = new RegExp("^rgb\\(" + [reP, reP, reP] + "\\)$");
var reRgbaInteger = new RegExp("^rgba\\(" + [reI, reI, reI, reN] + "\\)$");
var reRgbaPercent = new RegExp("^rgba\\(" + [reP, reP, reP, reN] + "\\)$");
var reHslPercent = new RegExp("^hsl\\(" + [reN, reP, reP] + "\\)$");
var reHslaPercent = new RegExp("^hsla\\(" + [reN, reP, reP, reN] + "\\)$");
var named = {
  aliceblue: 15792383,
  antiquewhite: 16444375,
  aqua: 65535,
  aquamarine: 8388564,
  azure: 15794175,
  beige: 16119260,
  bisque: 16770244,
  black: 0,
  blanchedalmond: 16772045,
  blue: 255,
  blueviolet: 9055202,
  brown: 10824234,
  burlywood: 14596231,
  cadetblue: 6266528,
  chartreuse: 8388352,
  chocolate: 13789470,
  coral: 16744272,
  cornflowerblue: 6591981,
  cornsilk: 16775388,
  crimson: 14423100,
  cyan: 65535,
  darkblue: 139,
  darkcyan: 35723,
  darkgoldenrod: 12092939,
  darkgray: 11119017,
  darkgreen: 25600,
  darkgrey: 11119017,
  darkkhaki: 12433259,
  darkmagenta: 9109643,
  darkolivegreen: 5597999,
  darkorange: 16747520,
  darkorchid: 10040012,
  darkred: 9109504,
  darksalmon: 15308410,
  darkseagreen: 9419919,
  darkslateblue: 4734347,
  darkslategray: 3100495,
  darkslategrey: 3100495,
  darkturquoise: 52945,
  darkviolet: 9699539,
  deeppink: 16716947,
  deepskyblue: 49151,
  dimgray: 6908265,
  dimgrey: 6908265,
  dodgerblue: 2003199,
  firebrick: 11674146,
  floralwhite: 16775920,
  forestgreen: 2263842,
  fuchsia: 16711935,
  gainsboro: 14474460,
  ghostwhite: 16316671,
  gold: 16766720,
  goldenrod: 14329120,
  gray: 8421504,
  green: 32768,
  greenyellow: 11403055,
  grey: 8421504,
  honeydew: 15794160,
  hotpink: 16738740,
  indianred: 13458524,
  indigo: 4915330,
  ivory: 16777200,
  khaki: 15787660,
  lavender: 15132410,
  lavenderblush: 16773365,
  lawngreen: 8190976,
  lemonchiffon: 16775885,
  lightblue: 11393254,
  lightcoral: 15761536,
  lightcyan: 14745599,
  lightgoldenrodyellow: 16448210,
  lightgray: 13882323,
  lightgreen: 9498256,
  lightgrey: 13882323,
  lightpink: 16758465,
  lightsalmon: 16752762,
  lightseagreen: 2142890,
  lightskyblue: 8900346,
  lightslategray: 7833753,
  lightslategrey: 7833753,
  lightsteelblue: 11584734,
  lightyellow: 16777184,
  lime: 65280,
  limegreen: 3329330,
  linen: 16445670,
  magenta: 16711935,
  maroon: 8388608,
  mediumaquamarine: 6737322,
  mediumblue: 205,
  mediumorchid: 12211667,
  mediumpurple: 9662683,
  mediumseagreen: 3978097,
  mediumslateblue: 8087790,
  mediumspringgreen: 64154,
  mediumturquoise: 4772300,
  mediumvioletred: 13047173,
  midnightblue: 1644912,
  mintcream: 16121850,
  mistyrose: 16770273,
  moccasin: 16770229,
  navajowhite: 16768685,
  navy: 128,
  oldlace: 16643558,
  olive: 8421376,
  olivedrab: 7048739,
  orange: 16753920,
  orangered: 16729344,
  orchid: 14315734,
  palegoldenrod: 15657130,
  palegreen: 10025880,
  paleturquoise: 11529966,
  palevioletred: 14381203,
  papayawhip: 16773077,
  peachpuff: 16767673,
  peru: 13468991,
  pink: 16761035,
  plum: 14524637,
  powderblue: 11591910,
  purple: 8388736,
  rebeccapurple: 6697881,
  red: 16711680,
  rosybrown: 12357519,
  royalblue: 4286945,
  saddlebrown: 9127187,
  salmon: 16416882,
  sandybrown: 16032864,
  seagreen: 3050327,
  seashell: 16774638,
  sienna: 10506797,
  silver: 12632256,
  skyblue: 8900331,
  slateblue: 6970061,
  slategray: 7372944,
  slategrey: 7372944,
  snow: 16775930,
  springgreen: 65407,
  steelblue: 4620980,
  tan: 13808780,
  teal: 32896,
  thistle: 14204888,
  tomato: 16737095,
  turquoise: 4251856,
  violet: 15631086,
  wheat: 16113331,
  white: 16777215,
  whitesmoke: 16119285,
  yellow: 16776960,
  yellowgreen: 10145074
};
define(Color, color, {
  copy: function(channels) {
    return Object.assign(new this.constructor(), this, channels);
  },
  displayable: function() {
    return this.rgb().displayable();
  },
  hex: color_formatHex,
  formatHex: color_formatHex,
  formatHsl: color_formatHsl,
  formatRgb: color_formatRgb,
  toString: color_formatRgb
});
function color_formatHex() {
  return this.rgb().formatHex();
}
function color_formatHsl() {
  return hslConvert(this).formatHsl();
}
function color_formatRgb() {
  return this.rgb().formatRgb();
}
function color(format2) {
  var m, l;
  format2 = (format2 + "").trim().toLowerCase();
  return (m = reHex.exec(format2)) ? (l = m[1].length, m = parseInt(m[1], 16), l === 6 ? rgbn(m) : l === 3 ? new Rgb(m >> 8 & 15 | m >> 4 & 240, m >> 4 & 15 | m & 240, (m & 15) << 4 | m & 15, 1) : l === 8 ? rgba(m >> 24 & 255, m >> 16 & 255, m >> 8 & 255, (m & 255) / 255) : l === 4 ? rgba(m >> 12 & 15 | m >> 8 & 240, m >> 8 & 15 | m >> 4 & 240, m >> 4 & 15 | m & 240, ((m & 15) << 4 | m & 15) / 255) : null) : (m = reRgbInteger.exec(format2)) ? new Rgb(m[1], m[2], m[3], 1) : (m = reRgbPercent.exec(format2)) ? new Rgb(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, 1) : (m = reRgbaInteger.exec(format2)) ? rgba(m[1], m[2], m[3], m[4]) : (m = reRgbaPercent.exec(format2)) ? rgba(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, m[4]) : (m = reHslPercent.exec(format2)) ? hsla(m[1], m[2] / 100, m[3] / 100, 1) : (m = reHslaPercent.exec(format2)) ? hsla(m[1], m[2] / 100, m[3] / 100, m[4]) : named.hasOwnProperty(format2) ? rgbn(named[format2]) : format2 === "transparent" ? new Rgb(NaN, NaN, NaN, 0) : null;
}
function rgbn(n) {
  return new Rgb(n >> 16 & 255, n >> 8 & 255, n & 255, 1);
}
function rgba(r, g, b, a) {
  if (a <= 0)
    r = g = b = NaN;
  return new Rgb(r, g, b, a);
}
function rgbConvert(o) {
  if (!(o instanceof Color))
    o = color(o);
  if (!o)
    return new Rgb();
  o = o.rgb();
  return new Rgb(o.r, o.g, o.b, o.opacity);
}
function rgb(r, g, b, opacity) {
  return arguments.length === 1 ? rgbConvert(r) : new Rgb(r, g, b, opacity == null ? 1 : opacity);
}
function Rgb(r, g, b, opacity) {
  this.r = +r;
  this.g = +g;
  this.b = +b;
  this.opacity = +opacity;
}
define(Rgb, rgb, extend(Color, {
  brighter: function(k) {
    k = k == null ? brighter : Math.pow(brighter, k);
    return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
  },
  darker: function(k) {
    k = k == null ? darker : Math.pow(darker, k);
    return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
  },
  rgb: function() {
    return this;
  },
  displayable: function() {
    return -0.5 <= this.r && this.r < 255.5 && (-0.5 <= this.g && this.g < 255.5) && (-0.5 <= this.b && this.b < 255.5) && (0 <= this.opacity && this.opacity <= 1);
  },
  hex: rgb_formatHex,
  formatHex: rgb_formatHex,
  formatRgb: rgb_formatRgb,
  toString: rgb_formatRgb
}));
function rgb_formatHex() {
  return "#" + hex(this.r) + hex(this.g) + hex(this.b);
}
function rgb_formatRgb() {
  var a = this.opacity;
  a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
  return (a === 1 ? "rgb(" : "rgba(") + Math.max(0, Math.min(255, Math.round(this.r) || 0)) + ", " + Math.max(0, Math.min(255, Math.round(this.g) || 0)) + ", " + Math.max(0, Math.min(255, Math.round(this.b) || 0)) + (a === 1 ? ")" : ", " + a + ")");
}
function hex(value) {
  value = Math.max(0, Math.min(255, Math.round(value) || 0));
  return (value < 16 ? "0" : "") + value.toString(16);
}
function hsla(h, s, l, a) {
  if (a <= 0)
    h = s = l = NaN;
  else if (l <= 0 || l >= 1)
    h = s = NaN;
  else if (s <= 0)
    h = NaN;
  return new Hsl(h, s, l, a);
}
function hslConvert(o) {
  if (o instanceof Hsl)
    return new Hsl(o.h, o.s, o.l, o.opacity);
  if (!(o instanceof Color))
    o = color(o);
  if (!o)
    return new Hsl();
  if (o instanceof Hsl)
    return o;
  o = o.rgb();
  var r = o.r / 255, g = o.g / 255, b = o.b / 255, min2 = Math.min(r, g, b), max2 = Math.max(r, g, b), h = NaN, s = max2 - min2, l = (max2 + min2) / 2;
  if (s) {
    if (r === max2)
      h = (g - b) / s + (g < b) * 6;
    else if (g === max2)
      h = (b - r) / s + 2;
    else
      h = (r - g) / s + 4;
    s /= l < 0.5 ? max2 + min2 : 2 - max2 - min2;
    h *= 60;
  } else {
    s = l > 0 && l < 1 ? 0 : h;
  }
  return new Hsl(h, s, l, o.opacity);
}
function hsl(h, s, l, opacity) {
  return arguments.length === 1 ? hslConvert(h) : new Hsl(h, s, l, opacity == null ? 1 : opacity);
}
function Hsl(h, s, l, opacity) {
  this.h = +h;
  this.s = +s;
  this.l = +l;
  this.opacity = +opacity;
}
define(Hsl, hsl, extend(Color, {
  brighter: function(k) {
    k = k == null ? brighter : Math.pow(brighter, k);
    return new Hsl(this.h, this.s, this.l * k, this.opacity);
  },
  darker: function(k) {
    k = k == null ? darker : Math.pow(darker, k);
    return new Hsl(this.h, this.s, this.l * k, this.opacity);
  },
  rgb: function() {
    var h = this.h % 360 + (this.h < 0) * 360, s = isNaN(h) || isNaN(this.s) ? 0 : this.s, l = this.l, m2 = l + (l < 0.5 ? l : 1 - l) * s, m1 = 2 * l - m2;
    return new Rgb(hsl2rgb(h >= 240 ? h - 240 : h + 120, m1, m2), hsl2rgb(h, m1, m2), hsl2rgb(h < 120 ? h + 240 : h - 120, m1, m2), this.opacity);
  },
  displayable: function() {
    return (0 <= this.s && this.s <= 1 || isNaN(this.s)) && (0 <= this.l && this.l <= 1) && (0 <= this.opacity && this.opacity <= 1);
  },
  formatHsl: function() {
    var a = this.opacity;
    a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
    return (a === 1 ? "hsl(" : "hsla(") + (this.h || 0) + ", " + (this.s || 0) * 100 + "%, " + (this.l || 0) * 100 + "%" + (a === 1 ? ")" : ", " + a + ")");
  }
}));
function hsl2rgb(h, m1, m2) {
  return (h < 60 ? m1 + (m2 - m1) * h / 60 : h < 180 ? m2 : h < 240 ? m1 + (m2 - m1) * (240 - h) / 60 : m1) * 255;
}

// build/_snowpack/pkg/common/rgb-90dc4bb7.js
function basis(t1, v0, v1, v2, v3) {
  var t2 = t1 * t1, t3 = t2 * t1;
  return ((1 - 3 * t1 + 3 * t2 - t3) * v0 + (4 - 6 * t2 + 3 * t3) * v1 + (1 + 3 * t1 + 3 * t2 - 3 * t3) * v2 + t3 * v3) / 6;
}
function basis$1(values) {
  var n = values.length - 1;
  return function(t) {
    var i = t <= 0 ? t = 0 : t >= 1 ? (t = 1, n - 1) : Math.floor(t * n), v1 = values[i], v2 = values[i + 1], v0 = i > 0 ? values[i - 1] : 2 * v1 - v2, v3 = i < n - 1 ? values[i + 2] : 2 * v2 - v1;
    return basis((t - i / n) * n, v0, v1, v2, v3);
  };
}
var constant2 = (x) => () => x;
function linear(a, d) {
  return function(t) {
    return a + t * d;
  };
}
function exponential(a, b, y) {
  return a = Math.pow(a, y), b = Math.pow(b, y) - a, y = 1 / y, function(t) {
    return Math.pow(a + t * b, y);
  };
}
function hue(a, b) {
  var d = b - a;
  return d ? linear(a, d > 180 || d < -180 ? d - 360 * Math.round(d / 360) : d) : constant2(isNaN(a) ? b : a);
}
function gamma(y) {
  return (y = +y) === 1 ? nogamma : function(a, b) {
    return b - a ? exponential(a, b, y) : constant2(isNaN(a) ? b : a);
  };
}
function nogamma(a, b) {
  var d = b - a;
  return d ? linear(a, d) : constant2(isNaN(a) ? b : a);
}
var interpolateRgb = function rgbGamma(y) {
  var color2 = gamma(y);
  function rgb$1(start2, end) {
    var r = color2((start2 = rgb(start2)).r, (end = rgb(end)).r), g = color2(start2.g, end.g), b = color2(start2.b, end.b), opacity = nogamma(start2.opacity, end.opacity);
    return function(t) {
      start2.r = r(t);
      start2.g = g(t);
      start2.b = b(t);
      start2.opacity = opacity(t);
      return start2 + "";
    };
  }
  rgb$1.gamma = rgbGamma;
  return rgb$1;
}(1);
function rgbSpline(spline) {
  return function(colors3) {
    var n = colors3.length, r = new Array(n), g = new Array(n), b = new Array(n), i, color2;
    for (i = 0; i < n; ++i) {
      color2 = rgb(colors3[i]);
      r[i] = color2.r || 0;
      g[i] = color2.g || 0;
      b[i] = color2.b || 0;
    }
    r = spline(r);
    g = spline(g);
    b = spline(b);
    color2.opacity = 1;
    return function(t) {
      color2.r = r(t);
      color2.g = g(t);
      color2.b = b(t);
      return color2 + "";
    };
  };
}
var rgbBasis = rgbSpline(basis$1);

// build/_snowpack/pkg/common/nodrag-5a51286e.js
function sourceEvent(event) {
  let sourceEvent2;
  while (sourceEvent2 = event.sourceEvent)
    event = sourceEvent2;
  return event;
}
function pointer(event, node) {
  event = sourceEvent(event);
  if (node === void 0)
    node = event.currentTarget;
  if (node) {
    var svg = node.ownerSVGElement || node;
    if (svg.createSVGPoint) {
      var point = svg.createSVGPoint();
      point.x = event.clientX, point.y = event.clientY;
      point = point.matrixTransform(node.getScreenCTM().inverse());
      return [point.x, point.y];
    }
    if (node.getBoundingClientRect) {
      var rect = node.getBoundingClientRect();
      return [event.clientX - rect.left - node.clientLeft, event.clientY - rect.top - node.clientTop];
    }
  }
  return [event.pageX, event.pageY];
}
var nonpassivecapture = {capture: true, passive: false};
function noevent(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}
function dragDisable(view) {
  var root2 = view.document.documentElement, selection2 = select(view).on("dragstart.drag", noevent, nonpassivecapture);
  if ("onselectstart" in root2) {
    selection2.on("selectstart.drag", noevent, nonpassivecapture);
  } else {
    root2.__noselect = root2.style.MozUserSelect;
    root2.style.MozUserSelect = "none";
  }
}
function yesdrag(view, noclick) {
  var root2 = view.document.documentElement, selection2 = select(view).on("dragstart.drag", null);
  if (noclick) {
    selection2.on("click.drag", noevent, nonpassivecapture);
    setTimeout(function() {
      selection2.on("click.drag", null);
    }, 0);
  }
  if ("onselectstart" in root2) {
    selection2.on("selectstart.drag", null);
  } else {
    root2.style.MozUserSelect = root2.__noselect;
    delete root2.__noselect;
  }
}

// build/_snowpack/pkg/d3-zoom.js
function timeout2(callback, delay, time) {
  var t = new Timer();
  delay = delay == null ? 0 : +delay;
  t.restart((elapsed) => {
    t.stop();
    callback(elapsed + delay);
  }, delay, time);
  return t;
}
var degrees = 180 / Math.PI;
var identity = {
  translateX: 0,
  translateY: 0,
  rotate: 0,
  skewX: 0,
  scaleX: 1,
  scaleY: 1
};
function decompose(a, b, c2, d, e, f) {
  var scaleX, scaleY, skewX;
  if (scaleX = Math.sqrt(a * a + b * b))
    a /= scaleX, b /= scaleX;
  if (skewX = a * c2 + b * d)
    c2 -= a * skewX, d -= b * skewX;
  if (scaleY = Math.sqrt(c2 * c2 + d * d))
    c2 /= scaleY, d /= scaleY, skewX /= scaleY;
  if (a * d < b * c2)
    a = -a, b = -b, skewX = -skewX, scaleX = -scaleX;
  return {
    translateX: e,
    translateY: f,
    rotate: Math.atan2(b, a) * degrees,
    skewX: Math.atan(skewX) * degrees,
    scaleX,
    scaleY
  };
}
var svgNode;
function parseCss(value) {
  const m = new (typeof DOMMatrix === "function" ? DOMMatrix : WebKitCSSMatrix)(value + "");
  return m.isIdentity ? identity : decompose(m.a, m.b, m.c, m.d, m.e, m.f);
}
function parseSvg(value) {
  if (value == null)
    return identity;
  if (!svgNode)
    svgNode = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svgNode.setAttribute("transform", value);
  if (!(value = svgNode.transform.baseVal.consolidate()))
    return identity;
  value = value.matrix;
  return decompose(value.a, value.b, value.c, value.d, value.e, value.f);
}
function interpolateTransform(parse, pxComma, pxParen, degParen) {
  function pop(s) {
    return s.length ? s.pop() + " " : "";
  }
  function translate(xa, ya, xb, yb, s, q) {
    if (xa !== xb || ya !== yb) {
      var i = s.push("translate(", null, pxComma, null, pxParen);
      q.push({i: i - 4, x: interpolateNumber(xa, xb)}, {i: i - 2, x: interpolateNumber(ya, yb)});
    } else if (xb || yb) {
      s.push("translate(" + xb + pxComma + yb + pxParen);
    }
  }
  function rotate(a, b, s, q) {
    if (a !== b) {
      if (a - b > 180)
        b += 360;
      else if (b - a > 180)
        a += 360;
      q.push({i: s.push(pop(s) + "rotate(", null, degParen) - 2, x: interpolateNumber(a, b)});
    } else if (b) {
      s.push(pop(s) + "rotate(" + b + degParen);
    }
  }
  function skewX(a, b, s, q) {
    if (a !== b) {
      q.push({i: s.push(pop(s) + "skewX(", null, degParen) - 2, x: interpolateNumber(a, b)});
    } else if (b) {
      s.push(pop(s) + "skewX(" + b + degParen);
    }
  }
  function scale(xa, ya, xb, yb, s, q) {
    if (xa !== xb || ya !== yb) {
      var i = s.push(pop(s) + "scale(", null, ",", null, ")");
      q.push({i: i - 4, x: interpolateNumber(xa, xb)}, {i: i - 2, x: interpolateNumber(ya, yb)});
    } else if (xb !== 1 || yb !== 1) {
      s.push(pop(s) + "scale(" + xb + "," + yb + ")");
    }
  }
  return function(a, b) {
    var s = [], q = [];
    a = parse(a), b = parse(b);
    translate(a.translateX, a.translateY, b.translateX, b.translateY, s, q);
    rotate(a.rotate, b.rotate, s, q);
    skewX(a.skewX, b.skewX, s, q);
    scale(a.scaleX, a.scaleY, b.scaleX, b.scaleY, s, q);
    a = b = null;
    return function(t) {
      var i = -1, n = q.length, o;
      while (++i < n)
        s[(o = q[i]).i] = o.x(t);
      return s.join("");
    };
  };
}
var interpolateTransformCss = interpolateTransform(parseCss, "px, ", "px)", "deg)");
var interpolateTransformSvg = interpolateTransform(parseSvg, ", ", ")", ")");
var epsilon2 = 1e-12;
function cosh(x) {
  return ((x = Math.exp(x)) + 1 / x) / 2;
}
function sinh(x) {
  return ((x = Math.exp(x)) - 1 / x) / 2;
}
function tanh(x) {
  return ((x = Math.exp(2 * x)) - 1) / (x + 1);
}
var interpolateZoom = function zoomRho(rho, rho2, rho4) {
  function zoom2(p0, p1) {
    var ux0 = p0[0], uy0 = p0[1], w0 = p0[2], ux1 = p1[0], uy1 = p1[1], w1 = p1[2], dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy, i, S;
    if (d2 < epsilon2) {
      S = Math.log(w1 / w0) / rho;
      i = function(t) {
        return [
          ux0 + t * dx,
          uy0 + t * dy,
          w0 * Math.exp(rho * t * S)
        ];
      };
    } else {
      var d1 = Math.sqrt(d2), b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1), b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1), r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
      S = (r1 - r0) / rho;
      i = function(t) {
        var s = t * S, coshr0 = cosh(r0), u = w0 / (rho2 * d1) * (coshr0 * tanh(rho * s + r0) - sinh(r0));
        return [
          ux0 + u * dx,
          uy0 + u * dy,
          w0 * coshr0 / cosh(rho * s + r0)
        ];
      };
    }
    i.duration = S * 1e3 * rho / Math.SQRT2;
    return i;
  }
  zoom2.rho = function(_) {
    var _1 = Math.max(1e-3, +_), _2 = _1 * _1, _4 = _2 * _2;
    return zoomRho(_1, _2, _4);
  };
  return zoom2;
}(Math.SQRT2, 2, 4);
var emptyOn = dispatch("start", "end", "cancel", "interrupt");
var emptyTween = [];
var CREATED = 0;
var SCHEDULED = 1;
var STARTING = 2;
var STARTED = 3;
var RUNNING = 4;
var ENDING = 5;
var ENDED = 6;
function schedule(node, name, id2, index, group, timing) {
  var schedules = node.__transition;
  if (!schedules)
    node.__transition = {};
  else if (id2 in schedules)
    return;
  create(node, id2, {
    name,
    index,
    group,
    on: emptyOn,
    tween: emptyTween,
    time: timing.time,
    delay: timing.delay,
    duration: timing.duration,
    ease: timing.ease,
    timer: null,
    state: CREATED
  });
}
function init(node, id2) {
  var schedule2 = get2(node, id2);
  if (schedule2.state > CREATED)
    throw new Error("too late; already scheduled");
  return schedule2;
}
function set2(node, id2) {
  var schedule2 = get2(node, id2);
  if (schedule2.state > STARTED)
    throw new Error("too late; already running");
  return schedule2;
}
function get2(node, id2) {
  var schedule2 = node.__transition;
  if (!schedule2 || !(schedule2 = schedule2[id2]))
    throw new Error("transition not found");
  return schedule2;
}
function create(node, id2, self2) {
  var schedules = node.__transition, tween;
  schedules[id2] = self2;
  self2.timer = timer(schedule2, 0, self2.time);
  function schedule2(elapsed) {
    self2.state = SCHEDULED;
    self2.timer.restart(start2, self2.delay, self2.time);
    if (self2.delay <= elapsed)
      start2(elapsed - self2.delay);
  }
  function start2(elapsed) {
    var i, j, n, o;
    if (self2.state !== SCHEDULED)
      return stop();
    for (i in schedules) {
      o = schedules[i];
      if (o.name !== self2.name)
        continue;
      if (o.state === STARTED)
        return timeout2(start2);
      if (o.state === RUNNING) {
        o.state = ENDED;
        o.timer.stop();
        o.on.call("interrupt", node, node.__data__, o.index, o.group);
        delete schedules[i];
      } else if (+i < id2) {
        o.state = ENDED;
        o.timer.stop();
        o.on.call("cancel", node, node.__data__, o.index, o.group);
        delete schedules[i];
      }
    }
    timeout2(function() {
      if (self2.state === STARTED) {
        self2.state = RUNNING;
        self2.timer.restart(tick, self2.delay, self2.time);
        tick(elapsed);
      }
    });
    self2.state = STARTING;
    self2.on.call("start", node, node.__data__, self2.index, self2.group);
    if (self2.state !== STARTING)
      return;
    self2.state = STARTED;
    tween = new Array(n = self2.tween.length);
    for (i = 0, j = -1; i < n; ++i) {
      if (o = self2.tween[i].value.call(node, node.__data__, self2.index, self2.group)) {
        tween[++j] = o;
      }
    }
    tween.length = j + 1;
  }
  function tick(elapsed) {
    var t = elapsed < self2.duration ? self2.ease.call(null, elapsed / self2.duration) : (self2.timer.restart(stop), self2.state = ENDING, 1), i = -1, n = tween.length;
    while (++i < n) {
      tween[i].call(node, t);
    }
    if (self2.state === ENDING) {
      self2.on.call("end", node, node.__data__, self2.index, self2.group);
      stop();
    }
  }
  function stop() {
    self2.state = ENDED;
    self2.timer.stop();
    delete schedules[id2];
    for (var i in schedules)
      return;
    delete node.__transition;
  }
}
function interrupt(node, name) {
  var schedules = node.__transition, schedule2, active, empty2 = true, i;
  if (!schedules)
    return;
  name = name == null ? null : name + "";
  for (i in schedules) {
    if ((schedule2 = schedules[i]).name !== name) {
      empty2 = false;
      continue;
    }
    active = schedule2.state > STARTING && schedule2.state < ENDING;
    schedule2.state = ENDED;
    schedule2.timer.stop();
    schedule2.on.call(active ? "interrupt" : "cancel", node, node.__data__, schedule2.index, schedule2.group);
    delete schedules[i];
  }
  if (empty2)
    delete node.__transition;
}
function selection_interrupt(name) {
  return this.each(function() {
    interrupt(this, name);
  });
}
function tweenRemove(id2, name) {
  var tween0, tween1;
  return function() {
    var schedule2 = set2(this, id2), tween = schedule2.tween;
    if (tween !== tween0) {
      tween1 = tween0 = tween;
      for (var i = 0, n = tween1.length; i < n; ++i) {
        if (tween1[i].name === name) {
          tween1 = tween1.slice();
          tween1.splice(i, 1);
          break;
        }
      }
    }
    schedule2.tween = tween1;
  };
}
function tweenFunction(id2, name, value) {
  var tween0, tween1;
  if (typeof value !== "function")
    throw new Error();
  return function() {
    var schedule2 = set2(this, id2), tween = schedule2.tween;
    if (tween !== tween0) {
      tween1 = (tween0 = tween).slice();
      for (var t = {name, value}, i = 0, n = tween1.length; i < n; ++i) {
        if (tween1[i].name === name) {
          tween1[i] = t;
          break;
        }
      }
      if (i === n)
        tween1.push(t);
    }
    schedule2.tween = tween1;
  };
}
function transition_tween(name, value) {
  var id2 = this._id;
  name += "";
  if (arguments.length < 2) {
    var tween = get2(this.node(), id2).tween;
    for (var i = 0, n = tween.length, t; i < n; ++i) {
      if ((t = tween[i]).name === name) {
        return t.value;
      }
    }
    return null;
  }
  return this.each((value == null ? tweenRemove : tweenFunction)(id2, name, value));
}
function tweenValue(transition, name, value) {
  var id2 = transition._id;
  transition.each(function() {
    var schedule2 = set2(this, id2);
    (schedule2.value || (schedule2.value = {}))[name] = value.apply(this, arguments);
  });
  return function(node) {
    return get2(node, id2).value[name];
  };
}
function interpolate(a, b) {
  var c2;
  return (typeof b === "number" ? interpolateNumber : b instanceof color ? interpolateRgb : (c2 = color(b)) ? (b = c2, interpolateRgb) : interpolateString)(a, b);
}
function attrRemove2(name) {
  return function() {
    this.removeAttribute(name);
  };
}
function attrRemoveNS2(fullname) {
  return function() {
    this.removeAttributeNS(fullname.space, fullname.local);
  };
}
function attrConstant2(name, interpolate3, value1) {
  var string00, string1 = value1 + "", interpolate0;
  return function() {
    var string0 = this.getAttribute(name);
    return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate3(string00 = string0, value1);
  };
}
function attrConstantNS2(fullname, interpolate3, value1) {
  var string00, string1 = value1 + "", interpolate0;
  return function() {
    var string0 = this.getAttributeNS(fullname.space, fullname.local);
    return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate3(string00 = string0, value1);
  };
}
function attrFunction2(name, interpolate3, value) {
  var string00, string10, interpolate0;
  return function() {
    var string0, value1 = value(this), string1;
    if (value1 == null)
      return void this.removeAttribute(name);
    string0 = this.getAttribute(name);
    string1 = value1 + "";
    return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate3(string00 = string0, value1));
  };
}
function attrFunctionNS2(fullname, interpolate3, value) {
  var string00, string10, interpolate0;
  return function() {
    var string0, value1 = value(this), string1;
    if (value1 == null)
      return void this.removeAttributeNS(fullname.space, fullname.local);
    string0 = this.getAttributeNS(fullname.space, fullname.local);
    string1 = value1 + "";
    return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate3(string00 = string0, value1));
  };
}
function transition_attr(name, value) {
  var fullname = namespace(name), i = fullname === "transform" ? interpolateTransformSvg : interpolate;
  return this.attrTween(name, typeof value === "function" ? (fullname.local ? attrFunctionNS2 : attrFunction2)(fullname, i, tweenValue(this, "attr." + name, value)) : value == null ? (fullname.local ? attrRemoveNS2 : attrRemove2)(fullname) : (fullname.local ? attrConstantNS2 : attrConstant2)(fullname, i, value));
}
function attrInterpolate(name, i) {
  return function(t) {
    this.setAttribute(name, i.call(this, t));
  };
}
function attrInterpolateNS(fullname, i) {
  return function(t) {
    this.setAttributeNS(fullname.space, fullname.local, i.call(this, t));
  };
}
function attrTweenNS(fullname, value) {
  var t0, i0;
  function tween() {
    var i = value.apply(this, arguments);
    if (i !== i0)
      t0 = (i0 = i) && attrInterpolateNS(fullname, i);
    return t0;
  }
  tween._value = value;
  return tween;
}
function attrTween(name, value) {
  var t0, i0;
  function tween() {
    var i = value.apply(this, arguments);
    if (i !== i0)
      t0 = (i0 = i) && attrInterpolate(name, i);
    return t0;
  }
  tween._value = value;
  return tween;
}
function transition_attrTween(name, value) {
  var key = "attr." + name;
  if (arguments.length < 2)
    return (key = this.tween(key)) && key._value;
  if (value == null)
    return this.tween(key, null);
  if (typeof value !== "function")
    throw new Error();
  var fullname = namespace(name);
  return this.tween(key, (fullname.local ? attrTweenNS : attrTween)(fullname, value));
}
function delayFunction(id2, value) {
  return function() {
    init(this, id2).delay = +value.apply(this, arguments);
  };
}
function delayConstant(id2, value) {
  return value = +value, function() {
    init(this, id2).delay = value;
  };
}
function transition_delay(value) {
  var id2 = this._id;
  return arguments.length ? this.each((typeof value === "function" ? delayFunction : delayConstant)(id2, value)) : get2(this.node(), id2).delay;
}
function durationFunction(id2, value) {
  return function() {
    set2(this, id2).duration = +value.apply(this, arguments);
  };
}
function durationConstant(id2, value) {
  return value = +value, function() {
    set2(this, id2).duration = value;
  };
}
function transition_duration(value) {
  var id2 = this._id;
  return arguments.length ? this.each((typeof value === "function" ? durationFunction : durationConstant)(id2, value)) : get2(this.node(), id2).duration;
}
function easeConstant(id2, value) {
  if (typeof value !== "function")
    throw new Error();
  return function() {
    set2(this, id2).ease = value;
  };
}
function transition_ease(value) {
  var id2 = this._id;
  return arguments.length ? this.each(easeConstant(id2, value)) : get2(this.node(), id2).ease;
}
function easeVarying(id2, value) {
  return function() {
    var v = value.apply(this, arguments);
    if (typeof v !== "function")
      throw new Error();
    set2(this, id2).ease = v;
  };
}
function transition_easeVarying(value) {
  if (typeof value !== "function")
    throw new Error();
  return this.each(easeVarying(this._id, value));
}
function transition_filter(match) {
  if (typeof match !== "function")
    match = matcher(match);
  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i) {
      if ((node = group[i]) && match.call(node, node.__data__, i, group)) {
        subgroup.push(node);
      }
    }
  }
  return new Transition(subgroups, this._parents, this._name, this._id);
}
function transition_merge(transition) {
  if (transition._id !== this._id)
    throw new Error();
  for (var groups0 = this._groups, groups1 = transition._groups, m0 = groups0.length, m1 = groups1.length, m = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m; ++j) {
    for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge2 = merges[j] = new Array(n), node, i = 0; i < n; ++i) {
      if (node = group0[i] || group1[i]) {
        merge2[i] = node;
      }
    }
  }
  for (; j < m0; ++j) {
    merges[j] = groups0[j];
  }
  return new Transition(merges, this._parents, this._name, this._id);
}
function start(name) {
  return (name + "").trim().split(/^|\s+/).every(function(t) {
    var i = t.indexOf(".");
    if (i >= 0)
      t = t.slice(0, i);
    return !t || t === "start";
  });
}
function onFunction(id2, name, listener) {
  var on0, on1, sit = start(name) ? init : set2;
  return function() {
    var schedule2 = sit(this, id2), on = schedule2.on;
    if (on !== on0)
      (on1 = (on0 = on).copy()).on(name, listener);
    schedule2.on = on1;
  };
}
function transition_on(name, listener) {
  var id2 = this._id;
  return arguments.length < 2 ? get2(this.node(), id2).on.on(name) : this.each(onFunction(id2, name, listener));
}
function removeFunction(id2) {
  return function() {
    var parent = this.parentNode;
    for (var i in this.__transition)
      if (+i !== id2)
        return;
    if (parent)
      parent.removeChild(this);
  };
}
function transition_remove() {
  return this.on("end.remove", removeFunction(this._id));
}
function transition_select(select2) {
  var name = this._name, id2 = this._id;
  if (typeof select2 !== "function")
    select2 = selector(select2);
  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i) {
      if ((node = group[i]) && (subnode = select2.call(node, node.__data__, i, group))) {
        if ("__data__" in node)
          subnode.__data__ = node.__data__;
        subgroup[i] = subnode;
        schedule(subgroup[i], name, id2, i, subgroup, get2(node, id2));
      }
    }
  }
  return new Transition(subgroups, this._parents, name, id2);
}
function transition_selectAll(select2) {
  var name = this._name, id2 = this._id;
  if (typeof select2 !== "function")
    select2 = selectorAll(select2);
  for (var groups = this._groups, m = groups.length, subgroups = [], parents = [], j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
      if (node = group[i]) {
        for (var children2 = select2.call(node, node.__data__, i, group), child, inherit2 = get2(node, id2), k = 0, l = children2.length; k < l; ++k) {
          if (child = children2[k]) {
            schedule(child, name, id2, k, children2, inherit2);
          }
        }
        subgroups.push(children2);
        parents.push(node);
      }
    }
  }
  return new Transition(subgroups, parents, name, id2);
}
var Selection2 = selection.prototype.constructor;
function transition_selection() {
  return new Selection2(this._groups, this._parents);
}
function styleNull(name, interpolate3) {
  var string00, string10, interpolate0;
  return function() {
    var string0 = styleValue(this, name), string1 = (this.style.removeProperty(name), styleValue(this, name));
    return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : interpolate0 = interpolate3(string00 = string0, string10 = string1);
  };
}
function styleRemove2(name) {
  return function() {
    this.style.removeProperty(name);
  };
}
function styleConstant2(name, interpolate3, value1) {
  var string00, string1 = value1 + "", interpolate0;
  return function() {
    var string0 = styleValue(this, name);
    return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate3(string00 = string0, value1);
  };
}
function styleFunction2(name, interpolate3, value) {
  var string00, string10, interpolate0;
  return function() {
    var string0 = styleValue(this, name), value1 = value(this), string1 = value1 + "";
    if (value1 == null)
      string1 = value1 = (this.style.removeProperty(name), styleValue(this, name));
    return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate3(string00 = string0, value1));
  };
}
function styleMaybeRemove(id2, name) {
  var on0, on1, listener0, key = "style." + name, event = "end." + key, remove2;
  return function() {
    var schedule2 = set2(this, id2), on = schedule2.on, listener = schedule2.value[key] == null ? remove2 || (remove2 = styleRemove2(name)) : void 0;
    if (on !== on0 || listener0 !== listener)
      (on1 = (on0 = on).copy()).on(event, listener0 = listener);
    schedule2.on = on1;
  };
}
function transition_style(name, value, priority) {
  var i = (name += "") === "transform" ? interpolateTransformCss : interpolate;
  return value == null ? this.styleTween(name, styleNull(name, i)).on("end.style." + name, styleRemove2(name)) : typeof value === "function" ? this.styleTween(name, styleFunction2(name, i, tweenValue(this, "style." + name, value))).each(styleMaybeRemove(this._id, name)) : this.styleTween(name, styleConstant2(name, i, value), priority).on("end.style." + name, null);
}
function styleInterpolate(name, i, priority) {
  return function(t) {
    this.style.setProperty(name, i.call(this, t), priority);
  };
}
function styleTween(name, value, priority) {
  var t, i0;
  function tween() {
    var i = value.apply(this, arguments);
    if (i !== i0)
      t = (i0 = i) && styleInterpolate(name, i, priority);
    return t;
  }
  tween._value = value;
  return tween;
}
function transition_styleTween(name, value, priority) {
  var key = "style." + (name += "");
  if (arguments.length < 2)
    return (key = this.tween(key)) && key._value;
  if (value == null)
    return this.tween(key, null);
  if (typeof value !== "function")
    throw new Error();
  return this.tween(key, styleTween(name, value, priority == null ? "" : priority));
}
function textConstant2(value) {
  return function() {
    this.textContent = value;
  };
}
function textFunction2(value) {
  return function() {
    var value1 = value(this);
    this.textContent = value1 == null ? "" : value1;
  };
}
function transition_text(value) {
  return this.tween("text", typeof value === "function" ? textFunction2(tweenValue(this, "text", value)) : textConstant2(value == null ? "" : value + ""));
}
function textInterpolate(i) {
  return function(t) {
    this.textContent = i.call(this, t);
  };
}
function textTween(value) {
  var t0, i0;
  function tween() {
    var i = value.apply(this, arguments);
    if (i !== i0)
      t0 = (i0 = i) && textInterpolate(i);
    return t0;
  }
  tween._value = value;
  return tween;
}
function transition_textTween(value) {
  var key = "text";
  if (arguments.length < 1)
    return (key = this.tween(key)) && key._value;
  if (value == null)
    return this.tween(key, null);
  if (typeof value !== "function")
    throw new Error();
  return this.tween(key, textTween(value));
}
function transition_transition() {
  var name = this._name, id0 = this._id, id1 = newId();
  for (var groups = this._groups, m = groups.length, j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
      if (node = group[i]) {
        var inherit2 = get2(node, id0);
        schedule(node, name, id1, i, group, {
          time: inherit2.time + inherit2.delay + inherit2.duration,
          delay: 0,
          duration: inherit2.duration,
          ease: inherit2.ease
        });
      }
    }
  }
  return new Transition(groups, this._parents, name, id1);
}
function transition_end() {
  var on0, on1, that = this, id2 = that._id, size = that.size();
  return new Promise(function(resolve, reject) {
    var cancel = {value: reject}, end = {value: function() {
      if (--size === 0)
        resolve();
    }};
    that.each(function() {
      var schedule2 = set2(this, id2), on = schedule2.on;
      if (on !== on0) {
        on1 = (on0 = on).copy();
        on1._.cancel.push(cancel);
        on1._.interrupt.push(cancel);
        on1._.end.push(end);
      }
      schedule2.on = on1;
    });
    if (size === 0)
      resolve();
  });
}
var id = 0;
function Transition(groups, parents, name, id2) {
  this._groups = groups;
  this._parents = parents;
  this._name = name;
  this._id = id2;
}
function newId() {
  return ++id;
}
var selection_prototype = selection.prototype;
Transition.prototype = {
  constructor: Transition,
  select: transition_select,
  selectAll: transition_selectAll,
  selectChild: selection_prototype.selectChild,
  selectChildren: selection_prototype.selectChildren,
  filter: transition_filter,
  merge: transition_merge,
  selection: transition_selection,
  transition: transition_transition,
  call: selection_prototype.call,
  nodes: selection_prototype.nodes,
  node: selection_prototype.node,
  size: selection_prototype.size,
  empty: selection_prototype.empty,
  each: selection_prototype.each,
  on: transition_on,
  attr: transition_attr,
  attrTween: transition_attrTween,
  style: transition_style,
  styleTween: transition_styleTween,
  text: transition_text,
  textTween: transition_textTween,
  remove: transition_remove,
  tween: transition_tween,
  delay: transition_delay,
  duration: transition_duration,
  ease: transition_ease,
  easeVarying: transition_easeVarying,
  end: transition_end,
  [Symbol.iterator]: selection_prototype[Symbol.iterator]
};
function cubicInOut(t) {
  return ((t *= 2) <= 1 ? t * t * t : (t -= 2) * t * t + 2) / 2;
}
var defaultTiming = {
  time: null,
  delay: 0,
  duration: 250,
  ease: cubicInOut
};
function inherit(node, id2) {
  var timing;
  while (!(timing = node.__transition) || !(timing = timing[id2])) {
    if (!(node = node.parentNode)) {
      throw new Error(`transition ${id2} not found`);
    }
  }
  return timing;
}
function selection_transition(name) {
  var id2, timing;
  if (name instanceof Transition) {
    id2 = name._id, name = name._name;
  } else {
    id2 = newId(), (timing = defaultTiming).time = now(), name = name == null ? null : name + "";
  }
  for (var groups = this._groups, m = groups.length, j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
      if (node = group[i]) {
        schedule(node, name, id2, i, group, timing || inherit(node, id2));
      }
    }
  }
  return new Transition(groups, this._parents, name, id2);
}
selection.prototype.interrupt = selection_interrupt;
selection.prototype.transition = selection_transition;
var constant3 = (x) => () => x;
function ZoomEvent(type, {
  sourceEvent: sourceEvent2,
  target,
  transform: transform2,
  dispatch: dispatch2
}) {
  Object.defineProperties(this, {
    type: {value: type, enumerable: true, configurable: true},
    sourceEvent: {value: sourceEvent2, enumerable: true, configurable: true},
    target: {value: target, enumerable: true, configurable: true},
    transform: {value: transform2, enumerable: true, configurable: true},
    _: {value: dispatch2}
  });
}
function Transform(k, x, y) {
  this.k = k;
  this.x = x;
  this.y = y;
}
Transform.prototype = {
  constructor: Transform,
  scale: function(k) {
    return k === 1 ? this : new Transform(this.k * k, this.x, this.y);
  },
  translate: function(x, y) {
    return x === 0 & y === 0 ? this : new Transform(this.k, this.x + this.k * x, this.y + this.k * y);
  },
  apply: function(point) {
    return [point[0] * this.k + this.x, point[1] * this.k + this.y];
  },
  applyX: function(x) {
    return x * this.k + this.x;
  },
  applyY: function(y) {
    return y * this.k + this.y;
  },
  invert: function(location) {
    return [(location[0] - this.x) / this.k, (location[1] - this.y) / this.k];
  },
  invertX: function(x) {
    return (x - this.x) / this.k;
  },
  invertY: function(y) {
    return (y - this.y) / this.k;
  },
  rescaleX: function(x) {
    return x.copy().domain(x.range().map(this.invertX, this).map(x.invert, x));
  },
  rescaleY: function(y) {
    return y.copy().domain(y.range().map(this.invertY, this).map(y.invert, y));
  },
  toString: function() {
    return "translate(" + this.x + "," + this.y + ") scale(" + this.k + ")";
  }
};
var identity$1 = new Transform(1, 0, 0);
transform.prototype = Transform.prototype;
function transform(node) {
  while (!node.__zoom)
    if (!(node = node.parentNode))
      return identity$1;
  return node.__zoom;
}
function nopropagation(event) {
  event.stopImmediatePropagation();
}
function noevent2(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}
function defaultFilter(event) {
  return (!event.ctrlKey || event.type === "wheel") && !event.button;
}
function defaultExtent() {
  var e = this;
  if (e instanceof SVGElement) {
    e = e.ownerSVGElement || e;
    if (e.hasAttribute("viewBox")) {
      e = e.viewBox.baseVal;
      return [[e.x, e.y], [e.x + e.width, e.y + e.height]];
    }
    return [[0, 0], [e.width.baseVal.value, e.height.baseVal.value]];
  }
  return [[0, 0], [e.clientWidth, e.clientHeight]];
}
function defaultTransform() {
  return this.__zoom || identity$1;
}
function defaultWheelDelta(event) {
  return -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 2e-3) * (event.ctrlKey ? 10 : 1);
}
function defaultTouchable() {
  return navigator.maxTouchPoints || "ontouchstart" in this;
}
function defaultConstrain(transform2, extent, translateExtent) {
  var dx0 = transform2.invertX(extent[0][0]) - translateExtent[0][0], dx1 = transform2.invertX(extent[1][0]) - translateExtent[1][0], dy0 = transform2.invertY(extent[0][1]) - translateExtent[0][1], dy1 = transform2.invertY(extent[1][1]) - translateExtent[1][1];
  return transform2.translate(dx1 > dx0 ? (dx0 + dx1) / 2 : Math.min(0, dx0) || Math.max(0, dx1), dy1 > dy0 ? (dy0 + dy1) / 2 : Math.min(0, dy0) || Math.max(0, dy1));
}
function zoom() {
  var filter2 = defaultFilter, extent = defaultExtent, constrain = defaultConstrain, wheelDelta = defaultWheelDelta, touchable = defaultTouchable, scaleExtent = [0, Infinity], translateExtent = [[-Infinity, -Infinity], [Infinity, Infinity]], duration = 250, interpolate3 = interpolateZoom, listeners = dispatch("start", "zoom", "end"), touchstarting, touchfirst, touchending, touchDelay = 500, wheelDelay = 150, clickDistance2 = 0, tapDistance = 10;
  function zoom2(selection2) {
    selection2.property("__zoom", defaultTransform).on("wheel.zoom", wheeled, {passive: false}).on("mousedown.zoom", mousedowned).on("dblclick.zoom", dblclicked).filter(touchable).on("touchstart.zoom", touchstarted).on("touchmove.zoom", touchmoved).on("touchend.zoom touchcancel.zoom", touchended).style("-webkit-tap-highlight-color", "rgba(0,0,0,0)");
  }
  zoom2.transform = function(collection, transform2, point, event) {
    var selection2 = collection.selection ? collection.selection() : collection;
    selection2.property("__zoom", defaultTransform);
    if (collection !== selection2) {
      schedule2(collection, transform2, point, event);
    } else {
      selection2.interrupt().each(function() {
        gesture(this, arguments).event(event).start().zoom(null, typeof transform2 === "function" ? transform2.apply(this, arguments) : transform2).end();
      });
    }
  };
  zoom2.scaleBy = function(selection2, k, p, event) {
    zoom2.scaleTo(selection2, function() {
      var k0 = this.__zoom.k, k1 = typeof k === "function" ? k.apply(this, arguments) : k;
      return k0 * k1;
    }, p, event);
  };
  zoom2.scaleTo = function(selection2, k, p, event) {
    zoom2.transform(selection2, function() {
      var e = extent.apply(this, arguments), t0 = this.__zoom, p0 = p == null ? centroid(e) : typeof p === "function" ? p.apply(this, arguments) : p, p1 = t0.invert(p0), k1 = typeof k === "function" ? k.apply(this, arguments) : k;
      return constrain(translate(scale(t0, k1), p0, p1), e, translateExtent);
    }, p, event);
  };
  zoom2.translateBy = function(selection2, x, y, event) {
    zoom2.transform(selection2, function() {
      return constrain(this.__zoom.translate(typeof x === "function" ? x.apply(this, arguments) : x, typeof y === "function" ? y.apply(this, arguments) : y), extent.apply(this, arguments), translateExtent);
    }, null, event);
  };
  zoom2.translateTo = function(selection2, x, y, p, event) {
    zoom2.transform(selection2, function() {
      var e = extent.apply(this, arguments), t = this.__zoom, p0 = p == null ? centroid(e) : typeof p === "function" ? p.apply(this, arguments) : p;
      return constrain(identity$1.translate(p0[0], p0[1]).scale(t.k).translate(typeof x === "function" ? -x.apply(this, arguments) : -x, typeof y === "function" ? -y.apply(this, arguments) : -y), e, translateExtent);
    }, p, event);
  };
  function scale(transform2, k) {
    k = Math.max(scaleExtent[0], Math.min(scaleExtent[1], k));
    return k === transform2.k ? transform2 : new Transform(k, transform2.x, transform2.y);
  }
  function translate(transform2, p0, p1) {
    var x = p0[0] - p1[0] * transform2.k, y = p0[1] - p1[1] * transform2.k;
    return x === transform2.x && y === transform2.y ? transform2 : new Transform(transform2.k, x, y);
  }
  function centroid(extent2) {
    return [(+extent2[0][0] + +extent2[1][0]) / 2, (+extent2[0][1] + +extent2[1][1]) / 2];
  }
  function schedule2(transition, transform2, point, event) {
    transition.on("start.zoom", function() {
      gesture(this, arguments).event(event).start();
    }).on("interrupt.zoom end.zoom", function() {
      gesture(this, arguments).event(event).end();
    }).tween("zoom", function() {
      var that = this, args = arguments, g = gesture(that, args).event(event), e = extent.apply(that, args), p = point == null ? centroid(e) : typeof point === "function" ? point.apply(that, args) : point, w = Math.max(e[1][0] - e[0][0], e[1][1] - e[0][1]), a = that.__zoom, b = typeof transform2 === "function" ? transform2.apply(that, args) : transform2, i = interpolate3(a.invert(p).concat(w / a.k), b.invert(p).concat(w / b.k));
      return function(t) {
        if (t === 1)
          t = b;
        else {
          var l = i(t), k = w / l[2];
          t = new Transform(k, p[0] - l[0] * k, p[1] - l[1] * k);
        }
        g.zoom(null, t);
      };
    });
  }
  function gesture(that, args, clean) {
    return !clean && that.__zooming || new Gesture(that, args);
  }
  function Gesture(that, args) {
    this.that = that;
    this.args = args;
    this.active = 0;
    this.sourceEvent = null;
    this.extent = extent.apply(that, args);
    this.taps = 0;
  }
  Gesture.prototype = {
    event: function(event) {
      if (event)
        this.sourceEvent = event;
      return this;
    },
    start: function() {
      if (++this.active === 1) {
        this.that.__zooming = this;
        this.emit("start");
      }
      return this;
    },
    zoom: function(key, transform2) {
      if (this.mouse && key !== "mouse")
        this.mouse[1] = transform2.invert(this.mouse[0]);
      if (this.touch0 && key !== "touch")
        this.touch0[1] = transform2.invert(this.touch0[0]);
      if (this.touch1 && key !== "touch")
        this.touch1[1] = transform2.invert(this.touch1[0]);
      this.that.__zoom = transform2;
      this.emit("zoom");
      return this;
    },
    end: function() {
      if (--this.active === 0) {
        delete this.that.__zooming;
        this.emit("end");
      }
      return this;
    },
    emit: function(type) {
      var d = select(this.that).datum();
      listeners.call(type, this.that, new ZoomEvent(type, {
        sourceEvent: this.sourceEvent,
        target: zoom2,
        type,
        transform: this.that.__zoom,
        dispatch: listeners
      }), d);
    }
  };
  function wheeled(event, ...args) {
    if (!filter2.apply(this, arguments))
      return;
    var g = gesture(this, args).event(event), t = this.__zoom, k = Math.max(scaleExtent[0], Math.min(scaleExtent[1], t.k * Math.pow(2, wheelDelta.apply(this, arguments)))), p = pointer(event);
    if (g.wheel) {
      if (g.mouse[0][0] !== p[0] || g.mouse[0][1] !== p[1]) {
        g.mouse[1] = t.invert(g.mouse[0] = p);
      }
      clearTimeout(g.wheel);
    } else if (t.k === k)
      return;
    else {
      g.mouse = [p, t.invert(p)];
      interrupt(this);
      g.start();
    }
    noevent2(event);
    g.wheel = setTimeout(wheelidled, wheelDelay);
    g.zoom("mouse", constrain(translate(scale(t, k), g.mouse[0], g.mouse[1]), g.extent, translateExtent));
    function wheelidled() {
      g.wheel = null;
      g.end();
    }
  }
  function mousedowned(event, ...args) {
    if (touchending || !filter2.apply(this, arguments))
      return;
    var currentTarget = event.currentTarget, g = gesture(this, args, true).event(event), v = select(event.view).on("mousemove.zoom", mousemoved, true).on("mouseup.zoom", mouseupped, true), p = pointer(event, currentTarget), x0 = event.clientX, y0 = event.clientY;
    dragDisable(event.view);
    nopropagation(event);
    g.mouse = [p, this.__zoom.invert(p)];
    interrupt(this);
    g.start();
    function mousemoved(event2) {
      noevent2(event2);
      if (!g.moved) {
        var dx = event2.clientX - x0, dy = event2.clientY - y0;
        g.moved = dx * dx + dy * dy > clickDistance2;
      }
      g.event(event2).zoom("mouse", constrain(translate(g.that.__zoom, g.mouse[0] = pointer(event2, currentTarget), g.mouse[1]), g.extent, translateExtent));
    }
    function mouseupped(event2) {
      v.on("mousemove.zoom mouseup.zoom", null);
      yesdrag(event2.view, g.moved);
      noevent2(event2);
      g.event(event2).end();
    }
  }
  function dblclicked(event, ...args) {
    if (!filter2.apply(this, arguments))
      return;
    var t0 = this.__zoom, p0 = pointer(event.changedTouches ? event.changedTouches[0] : event, this), p1 = t0.invert(p0), k1 = t0.k * (event.shiftKey ? 0.5 : 2), t1 = constrain(translate(scale(t0, k1), p0, p1), extent.apply(this, args), translateExtent);
    noevent2(event);
    if (duration > 0)
      select(this).transition().duration(duration).call(schedule2, t1, p0, event);
    else
      select(this).call(zoom2.transform, t1, p0, event);
  }
  function touchstarted(event, ...args) {
    if (!filter2.apply(this, arguments))
      return;
    var touches = event.touches, n = touches.length, g = gesture(this, args, event.changedTouches.length === n).event(event), started, i, t, p;
    nopropagation(event);
    for (i = 0; i < n; ++i) {
      t = touches[i], p = pointer(t, this);
      p = [p, this.__zoom.invert(p), t.identifier];
      if (!g.touch0)
        g.touch0 = p, started = true, g.taps = 1 + !!touchstarting;
      else if (!g.touch1 && g.touch0[2] !== p[2])
        g.touch1 = p, g.taps = 0;
    }
    if (touchstarting)
      touchstarting = clearTimeout(touchstarting);
    if (started) {
      if (g.taps < 2)
        touchfirst = p[0], touchstarting = setTimeout(function() {
          touchstarting = null;
        }, touchDelay);
      interrupt(this);
      g.start();
    }
  }
  function touchmoved(event, ...args) {
    if (!this.__zooming)
      return;
    var g = gesture(this, args).event(event), touches = event.changedTouches, n = touches.length, i, t, p, l;
    noevent2(event);
    for (i = 0; i < n; ++i) {
      t = touches[i], p = pointer(t, this);
      if (g.touch0 && g.touch0[2] === t.identifier)
        g.touch0[0] = p;
      else if (g.touch1 && g.touch1[2] === t.identifier)
        g.touch1[0] = p;
    }
    t = g.that.__zoom;
    if (g.touch1) {
      var p0 = g.touch0[0], l0 = g.touch0[1], p1 = g.touch1[0], l1 = g.touch1[1], dp = (dp = p1[0] - p0[0]) * dp + (dp = p1[1] - p0[1]) * dp, dl = (dl = l1[0] - l0[0]) * dl + (dl = l1[1] - l0[1]) * dl;
      t = scale(t, Math.sqrt(dp / dl));
      p = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      l = [(l0[0] + l1[0]) / 2, (l0[1] + l1[1]) / 2];
    } else if (g.touch0)
      p = g.touch0[0], l = g.touch0[1];
    else
      return;
    g.zoom("touch", constrain(translate(t, p, l), g.extent, translateExtent));
  }
  function touchended(event, ...args) {
    if (!this.__zooming)
      return;
    var g = gesture(this, args).event(event), touches = event.changedTouches, n = touches.length, i, t;
    nopropagation(event);
    if (touchending)
      clearTimeout(touchending);
    touchending = setTimeout(function() {
      touchending = null;
    }, touchDelay);
    for (i = 0; i < n; ++i) {
      t = touches[i];
      if (g.touch0 && g.touch0[2] === t.identifier)
        delete g.touch0;
      else if (g.touch1 && g.touch1[2] === t.identifier)
        delete g.touch1;
    }
    if (g.touch1 && !g.touch0)
      g.touch0 = g.touch1, delete g.touch1;
    if (g.touch0)
      g.touch0[1] = this.__zoom.invert(g.touch0[0]);
    else {
      g.end();
      if (g.taps === 2) {
        t = pointer(t, this);
        if (Math.hypot(touchfirst[0] - t[0], touchfirst[1] - t[1]) < tapDistance) {
          var p = select(this).on("dblclick.zoom");
          if (p)
            p.apply(this, arguments);
        }
      }
    }
  }
  zoom2.wheelDelta = function(_) {
    return arguments.length ? (wheelDelta = typeof _ === "function" ? _ : constant3(+_), zoom2) : wheelDelta;
  };
  zoom2.filter = function(_) {
    return arguments.length ? (filter2 = typeof _ === "function" ? _ : constant3(!!_), zoom2) : filter2;
  };
  zoom2.touchable = function(_) {
    return arguments.length ? (touchable = typeof _ === "function" ? _ : constant3(!!_), zoom2) : touchable;
  };
  zoom2.extent = function(_) {
    return arguments.length ? (extent = typeof _ === "function" ? _ : constant3([[+_[0][0], +_[0][1]], [+_[1][0], +_[1][1]]]), zoom2) : extent;
  };
  zoom2.scaleExtent = function(_) {
    return arguments.length ? (scaleExtent[0] = +_[0], scaleExtent[1] = +_[1], zoom2) : [scaleExtent[0], scaleExtent[1]];
  };
  zoom2.translateExtent = function(_) {
    return arguments.length ? (translateExtent[0][0] = +_[0][0], translateExtent[1][0] = +_[1][0], translateExtent[0][1] = +_[0][1], translateExtent[1][1] = +_[1][1], zoom2) : [[translateExtent[0][0], translateExtent[0][1]], [translateExtent[1][0], translateExtent[1][1]]];
  };
  zoom2.constrain = function(_) {
    return arguments.length ? (constrain = _, zoom2) : constrain;
  };
  zoom2.duration = function(_) {
    return arguments.length ? (duration = +_, zoom2) : duration;
  };
  zoom2.interpolate = function(_) {
    return arguments.length ? (interpolate3 = _, zoom2) : interpolate3;
  };
  zoom2.on = function() {
    var value = listeners.on.apply(listeners, arguments);
    return value === listeners ? zoom2 : value;
  };
  zoom2.clickDistance = function(_) {
    return arguments.length ? (clickDistance2 = (_ = +_) * _, zoom2) : Math.sqrt(clickDistance2);
  };
  zoom2.tapDistance = function(_) {
    return arguments.length ? (tapDistance = +_, zoom2) : tapDistance;
  };
  return zoom2;
}

// build/_snowpack/pkg/d3-drag.js
function DragEvent(type, {
  sourceEvent: sourceEvent2,
  subject,
  target,
  identifier,
  active,
  x,
  y,
  dx,
  dy,
  dispatch: dispatch2
}) {
  Object.defineProperties(this, {
    type: {value: type, enumerable: true, configurable: true},
    sourceEvent: {value: sourceEvent2, enumerable: true, configurable: true},
    subject: {value: subject, enumerable: true, configurable: true},
    target: {value: target, enumerable: true, configurable: true},
    identifier: {value: identifier, enumerable: true, configurable: true},
    active: {value: active, enumerable: true, configurable: true},
    x: {value: x, enumerable: true, configurable: true},
    y: {value: y, enumerable: true, configurable: true},
    dx: {value: dx, enumerable: true, configurable: true},
    dy: {value: dy, enumerable: true, configurable: true},
    _: {value: dispatch2}
  });
}
DragEvent.prototype.on = function() {
  var value = this._.on.apply(this._, arguments);
  return value === this._ ? this : value;
};

// build/_snowpack/pkg/common/index-06822a64.js
var ngraph_events = function eventify(subject) {
  validateSubject(subject);
  var eventsStorage = createEventsStorage(subject);
  subject.on = eventsStorage.on;
  subject.off = eventsStorage.off;
  subject.fire = eventsStorage.fire;
  return subject;
};
function createEventsStorage(subject) {
  var registeredEvents = Object.create(null);
  return {
    on: function(eventName, callback, ctx) {
      if (typeof callback !== "function") {
        throw new Error("callback is expected to be a function");
      }
      var handlers = registeredEvents[eventName];
      if (!handlers) {
        handlers = registeredEvents[eventName] = [];
      }
      handlers.push({callback, ctx});
      return subject;
    },
    off: function(eventName, callback) {
      var wantToRemoveAll = typeof eventName === "undefined";
      if (wantToRemoveAll) {
        registeredEvents = Object.create(null);
        return subject;
      }
      if (registeredEvents[eventName]) {
        var deleteAllCallbacksForEvent = typeof callback !== "function";
        if (deleteAllCallbacksForEvent) {
          delete registeredEvents[eventName];
        } else {
          var callbacks = registeredEvents[eventName];
          for (var i = 0; i < callbacks.length; ++i) {
            if (callbacks[i].callback === callback) {
              callbacks.splice(i, 1);
            }
          }
        }
      }
      return subject;
    },
    fire: function(eventName) {
      var callbacks = registeredEvents[eventName];
      if (!callbacks) {
        return subject;
      }
      var fireArguments;
      if (arguments.length > 1) {
        fireArguments = Array.prototype.splice.call(arguments, 1);
      }
      for (var i = 0; i < callbacks.length; ++i) {
        var callbackInfo = callbacks[i];
        callbackInfo.callback.apply(callbackInfo.ctx, fireArguments);
      }
      return subject;
    }
  };
}
function validateSubject(subject) {
  if (!subject) {
    throw new Error("Eventify cannot use falsy object as events subject");
  }
  var reservedWords = ["on", "fire", "off"];
  for (var i = 0; i < reservedWords.length; ++i) {
    if (subject.hasOwnProperty(reservedWords[i])) {
      throw new Error("Subject cannot be eventified, since it already has property '" + reservedWords[i] + "'");
    }
  }
}

// build/_snowpack/pkg/common/_commonjsHelpers-edfea8af.js
function createCommonjsModule(fn, basedir, module) {
  return module = {
    path: basedir,
    exports: {},
    require: function(path, base) {
      return commonjsRequire(path, base === void 0 || base === null ? module.path : base);
    }
  }, fn(module, module.exports), module.exports;
}
function commonjsRequire() {
  throw new Error("Dynamic requires are not currently supported by @rollup/plugin-commonjs");
}

// build/_snowpack/pkg/ngraph.forcelayout.js
var getVariableName = function getVariableName2(index) {
  if (index === 0)
    return "x";
  if (index === 1)
    return "y";
  if (index === 2)
    return "z";
  return "c" + (index + 1);
};
var createPatternBuilder = function createPatternBuilder2(dimension) {
  return pattern;
  function pattern(template, config) {
    let indent = config && config.indent || 0;
    let join = config && config.join !== void 0 ? config.join : "\n";
    let indentString = Array(indent + 1).join(" ");
    let buffer = [];
    for (let i = 0; i < dimension; ++i) {
      let variableName = getVariableName(i);
      let prefix = i === 0 ? "" : indentString;
      buffer.push(prefix + template.replace(/{var}/g, variableName));
    }
    return buffer.join(join);
  }
};
var generateCreateBody = generateCreateBodyFunction;
var generateCreateBodyFunctionBody_1 = generateCreateBodyFunctionBody;
var getVectorCode_1 = getVectorCode;
var getBodyCode_1 = getBodyCode;
function generateCreateBodyFunction(dimension, debugSetters) {
  let code = generateCreateBodyFunctionBody(dimension, debugSetters);
  let {Body} = new Function(code)();
  return Body;
}
function generateCreateBodyFunctionBody(dimension, debugSetters) {
  let code = `
${getVectorCode(dimension, debugSetters)}
${getBodyCode(dimension)}
return {Body: Body, Vector: Vector};
`;
  return code;
}
function getBodyCode(dimension) {
  let pattern = createPatternBuilder(dimension);
  let variableList = pattern("{var}", {join: ", "});
  return `
function Body(${variableList}) {
  this.isPinned = false;
  this.pos = new Vector(${variableList});
  this.force = new Vector();
  this.velocity = new Vector();
  this.mass = 1;

  this.springCount = 0;
  this.springLength = 0;
}

Body.prototype.reset = function() {
  this.force.reset();
  this.springCount = 0;
  this.springLength = 0;
}

Body.prototype.setPosition = function (${variableList}) {
  ${pattern("this.pos.{var} = {var} || 0;", {indent: 2})}
};`;
}
function getVectorCode(dimension, debugSetters) {
  let pattern = createPatternBuilder(dimension);
  let setters = "";
  if (debugSetters) {
    setters = `${pattern("\n   var v{var};\nObject.defineProperty(this, '{var}', {\n  set: function(v) { \n    if (!Number.isFinite(v)) throw new Error('Cannot set non-numbers to {var}');\n    v{var} = v; \n  },\n  get: function() { return v{var}; }\n});")}`;
  }
  let variableList = pattern("{var}", {join: ", "});
  return `function Vector(${variableList}) {
  ${setters}
    if (typeof arguments[0] === 'object') {
      // could be another vector
      let v = arguments[0];
      ${pattern('if (!Number.isFinite(v.{var})) throw new Error("Expected value is not a finite number at Vector constructor ({var})");', {indent: 4})}
      ${pattern("this.{var} = v.{var};", {indent: 4})}
    } else {
      ${pattern('this.{var} = typeof {var} === "number" ? {var} : 0;', {indent: 4})}
    }
  }
  
  Vector.prototype.reset = function () {
    ${pattern("this.{var} = ", {join: ""})}0;
  };`;
}
generateCreateBody.generateCreateBodyFunctionBody = generateCreateBodyFunctionBody_1;
generateCreateBody.getVectorCode = getVectorCode_1;
generateCreateBody.getBodyCode = getBodyCode_1;
var generateQuadTree = generateQuadTreeFunction;
var generateQuadTreeFunctionBody_1 = generateQuadTreeFunctionBody;
var getInsertStackCode_1 = getInsertStackCode;
var getQuadNodeCode_1 = getQuadNodeCode;
var isSamePosition_1 = isSamePosition;
var getChildBodyCode_1 = getChildBodyCode;
var setChildBodyCode_1 = setChildBodyCode;
function generateQuadTreeFunction(dimension) {
  let code = generateQuadTreeFunctionBody(dimension);
  return new Function(code)();
}
function generateQuadTreeFunctionBody(dimension) {
  let pattern = createPatternBuilder(dimension);
  let quadCount = Math.pow(2, dimension);
  let code = `
${getInsertStackCode()}
${getQuadNodeCode(dimension)}
${isSamePosition(dimension)}
${getChildBodyCode(dimension)}
${setChildBodyCode(dimension)}

function createQuadTree(options, random) {
  options = options || {};
  options.gravity = typeof options.gravity === 'number' ? options.gravity : -1;
  options.theta = typeof options.theta === 'number' ? options.theta : 0.8;

  var gravity = options.gravity;
  var updateQueue = [];
  var insertStack = new InsertStack();
  var theta = options.theta;

  var nodesCache = [];
  var currentInCache = 0;
  var root = newNode();

  return {
    insertBodies: insertBodies,

    /**
     * Gets root node if it is present
     */
    getRoot: function() {
      return root;
    },

    updateBodyForce: update,

    options: function(newOptions) {
      if (newOptions) {
        if (typeof newOptions.gravity === 'number') {
          gravity = newOptions.gravity;
        }
        if (typeof newOptions.theta === 'number') {
          theta = newOptions.theta;
        }

        return this;
      }

      return {
        gravity: gravity,
        theta: theta
      };
    }
  };

  function newNode() {
    // To avoid pressure on GC we reuse nodes.
    var node = nodesCache[currentInCache];
    if (node) {
${assignQuads("      node.")}
      node.body = null;
      node.mass = ${pattern("node.mass_{var} = ", {join: ""})}0;
      ${pattern("node.min_{var} = node.max_{var} = ", {join: ""})}0;
    } else {
      node = new QuadNode();
      nodesCache[currentInCache] = node;
    }

    ++currentInCache;
    return node;
  }

  function update(sourceBody) {
    var queue = updateQueue;
    var v;
    ${pattern("var d{var};", {indent: 4})}
    var r; 
    ${pattern("var f{var} = 0;", {indent: 4})}
    var queueLength = 1;
    var shiftIdx = 0;
    var pushIdx = 1;

    queue[0] = root;

    while (queueLength) {
      var node = queue[shiftIdx];
      var body = node.body;

      queueLength -= 1;
      shiftIdx += 1;
      var differentBody = (body !== sourceBody);
      if (body && differentBody) {
        // If the current node is a leaf node (and it is not source body),
        // calculate the force exerted by the current node on body, and add this
        // amount to body's net force.
        ${pattern("d{var} = body.pos.{var} - sourceBody.pos.{var};", {indent: 8})}
        r = Math.sqrt(${pattern("d{var} * d{var}", {join: " + "})});

        if (r === 0) {
          // Poor man's protection against zero distance.
          ${pattern("d{var} = (random.nextDouble() - 0.5) / 50;", {indent: 10})}
          r = Math.sqrt(${pattern("d{var} * d{var}", {join: " + "})});
        }

        // This is standard gravitation force calculation but we divide
        // by r^3 to save two operations when normalizing force vector.
        v = gravity * body.mass * sourceBody.mass / (r * r * r);
        ${pattern("f{var} += v * d{var};", {indent: 8})}
      } else if (differentBody) {
        // Otherwise, calculate the ratio s / r,  where s is the width of the region
        // represented by the internal node, and r is the distance between the body
        // and the node's center-of-mass
        ${pattern("d{var} = node.mass_{var} / node.mass - sourceBody.pos.{var};", {indent: 8})}
        r = Math.sqrt(${pattern("d{var} * d{var}", {join: " + "})});

        if (r === 0) {
          // Sorry about code duplication. I don't want to create many functions
          // right away. Just want to see performance first.
          ${pattern("d{var} = (random.nextDouble() - 0.5) / 50;", {indent: 10})}
          r = Math.sqrt(${pattern("d{var} * d{var}", {join: " + "})});
        }
        // If s / r < θ, treat this internal node as a single body, and calculate the
        // force it exerts on sourceBody, and add this amount to sourceBody's net force.
        if ((node.max_${getVariableName(0)} - node.min_${getVariableName(0)}) / r < theta) {
          // in the if statement above we consider node's width only
          // because the region was made into square during tree creation.
          // Thus there is no difference between using width or height.
          v = gravity * node.mass * sourceBody.mass / (r * r * r);
          ${pattern("f{var} += v * d{var};", {indent: 10})}
        } else {
          // Otherwise, run the procedure recursively on each of the current node's children.

          // I intentionally unfolded this loop, to save several CPU cycles.
${runRecursiveOnChildren()}
        }
      }
    }

    ${pattern("sourceBody.force.{var} += f{var};", {indent: 4})}
  }

  function insertBodies(bodies) {
    ${pattern("var {var}min = Number.MAX_VALUE;", {indent: 4})}
    ${pattern("var {var}max = Number.MIN_VALUE;", {indent: 4})}
    var i = bodies.length;

    // To reduce quad tree depth we are looking for exact bounding box of all particles.
    while (i--) {
      var pos = bodies[i].pos;
      ${pattern("if (pos.{var} < {var}min) {var}min = pos.{var};", {indent: 6})}
      ${pattern("if (pos.{var} > {var}max) {var}max = pos.{var};", {indent: 6})}
    }

    // Makes the bounds square.
    var maxSideLength = -Infinity;
    ${pattern("if ({var}max - {var}min > maxSideLength) maxSideLength = {var}max - {var}min ;", {indent: 4})}

    currentInCache = 0;
    root = newNode();
    ${pattern("root.min_{var} = {var}min;", {indent: 4})}
    ${pattern("root.max_{var} = {var}min + maxSideLength;", {indent: 4})}

    i = bodies.length - 1;
    if (i >= 0) {
      root.body = bodies[i];
    }
    while (i--) {
      insert(bodies[i], root);
    }
  }

  function insert(newBody) {
    insertStack.reset();
    insertStack.push(root, newBody);

    while (!insertStack.isEmpty()) {
      var stackItem = insertStack.pop();
      var node = stackItem.node;
      var body = stackItem.body;

      if (!node.body) {
        // This is internal node. Update the total mass of the node and center-of-mass.
        ${pattern("var {var} = body.pos.{var};", {indent: 8})}
        node.mass += body.mass;
        ${pattern("node.mass_{var} += body.mass * {var};", {indent: 8})}

        // Recursively insert the body in the appropriate quadrant.
        // But first find the appropriate quadrant.
        var quadIdx = 0; // Assume we are in the 0's quad.
        ${pattern("var min_{var} = node.min_{var};", {indent: 8})}
        ${pattern("var max_{var} = (min_{var} + node.max_{var}) / 2;", {indent: 8})}

${assignInsertionQuadIndex(8)}

        var child = getChild(node, quadIdx);

        if (!child) {
          // The node is internal but this quadrant is not taken. Add
          // subnode to it.
          child = newNode();
          ${pattern("child.min_{var} = min_{var};", {indent: 10})}
          ${pattern("child.max_{var} = max_{var};", {indent: 10})}
          child.body = body;

          setChild(node, quadIdx, child);
        } else {
          // continue searching in this quadrant.
          insertStack.push(child, body);
        }
      } else {
        // We are trying to add to the leaf node.
        // We have to convert current leaf into internal node
        // and continue adding two nodes.
        var oldBody = node.body;
        node.body = null; // internal nodes do not cary bodies

        if (isSamePosition(oldBody.pos, body.pos)) {
          // Prevent infinite subdivision by bumping one node
          // anywhere in this quadrant
          var retriesCount = 3;
          do {
            var offset = random.nextDouble();
            ${pattern("var d{var} = (node.max_{var} - node.min_{var}) * offset;", {indent: 12})}

            ${pattern("oldBody.pos.{var} = node.min_{var} + d{var};", {indent: 12})}
            retriesCount -= 1;
            // Make sure we don't bump it out of the box. If we do, next iteration should fix it
          } while (retriesCount > 0 && isSamePosition(oldBody.pos, body.pos));

          if (retriesCount === 0 && isSamePosition(oldBody.pos, body.pos)) {
            // This is very bad, we ran out of precision.
            // if we do not return from the method we'll get into
            // infinite loop here. So we sacrifice correctness of layout, and keep the app running
            // Next layout iteration should get larger bounding box in the first step and fix this
            return;
          }
        }
        // Next iteration should subdivide node further.
        insertStack.push(node, oldBody);
        insertStack.push(node, body);
      }
    }
  }
}
return createQuadTree;

`;
  return code;
  function assignInsertionQuadIndex(indentCount) {
    let insertionCode = [];
    let indent = Array(indentCount + 1).join(" ");
    for (let i = 0; i < dimension; ++i) {
      insertionCode.push(indent + `if (${getVariableName(i)} > max_${getVariableName(i)}) {`);
      insertionCode.push(indent + `  quadIdx = quadIdx + ${Math.pow(2, i)};`);
      insertionCode.push(indent + `  min_${getVariableName(i)} = max_${getVariableName(i)};`);
      insertionCode.push(indent + `  max_${getVariableName(i)} = node.max_${getVariableName(i)};`);
      insertionCode.push(indent + `}`);
    }
    return insertionCode.join("\n");
  }
  function runRecursiveOnChildren() {
    let indent = Array(11).join(" ");
    let recursiveCode = [];
    for (let i = 0; i < quadCount; ++i) {
      recursiveCode.push(indent + `if (node.quad${i}) {`);
      recursiveCode.push(indent + `  queue[pushIdx] = node.quad${i};`);
      recursiveCode.push(indent + `  queueLength += 1;`);
      recursiveCode.push(indent + `  pushIdx += 1;`);
      recursiveCode.push(indent + `}`);
    }
    return recursiveCode.join("\n");
  }
  function assignQuads(indent) {
    let quads = [];
    for (let i = 0; i < quadCount; ++i) {
      quads.push(`${indent}quad${i} = null;`);
    }
    return quads.join("\n");
  }
}
function isSamePosition(dimension) {
  let pattern = createPatternBuilder(dimension);
  return `
  function isSamePosition(point1, point2) {
    ${pattern("var d{var} = Math.abs(point1.{var} - point2.{var});", {indent: 2})}
  
    return ${pattern("d{var} < 1e-8", {join: " && "})};
  }  
`;
}
function setChildBodyCode(dimension) {
  var quadCount = Math.pow(2, dimension);
  return `
function setChild(node, idx, child) {
  ${setChildBody()}
}`;
  function setChildBody() {
    let childBody = [];
    for (let i = 0; i < quadCount; ++i) {
      let prefix = i === 0 ? "  " : "  else ";
      childBody.push(`${prefix}if (idx === ${i}) node.quad${i} = child;`);
    }
    return childBody.join("\n");
  }
}
function getChildBodyCode(dimension) {
  return `function getChild(node, idx) {
${getChildBody()}
  return null;
}`;
  function getChildBody() {
    let childBody = [];
    let quadCount = Math.pow(2, dimension);
    for (let i = 0; i < quadCount; ++i) {
      childBody.push(`  if (idx === ${i}) return node.quad${i};`);
    }
    return childBody.join("\n");
  }
}
function getQuadNodeCode(dimension) {
  let pattern = createPatternBuilder(dimension);
  let quadCount = Math.pow(2, dimension);
  var quadNodeCode = `
function QuadNode() {
  // body stored inside this node. In quad tree only leaf nodes (by construction)
  // contain bodies:
  this.body = null;

  // Child nodes are stored in quads. Each quad is presented by number:
  // 0 | 1
  // -----
  // 2 | 3
${assignQuads("  this.")}

  // Total mass of current node
  this.mass = 0;

  // Center of mass coordinates
  ${pattern("this.mass_{var} = 0;", {indent: 2})}

  // bounding box coordinates
  ${pattern("this.min_{var} = 0;", {indent: 2})}
  ${pattern("this.max_{var} = 0;", {indent: 2})}
}
`;
  return quadNodeCode;
  function assignQuads(indent) {
    let quads = [];
    for (let i = 0; i < quadCount; ++i) {
      quads.push(`${indent}quad${i} = null;`);
    }
    return quads.join("\n");
  }
}
function getInsertStackCode() {
  return `
/**
 * Our implementation of QuadTree is non-recursive to avoid GC hit
 * This data structure represent stack of elements
 * which we are trying to insert into quad tree.
 */
function InsertStack () {
    this.stack = [];
    this.popIdx = 0;
}

InsertStack.prototype = {
    isEmpty: function() {
        return this.popIdx === 0;
    },
    push: function (node, body) {
        var item = this.stack[this.popIdx];
        if (!item) {
            // we are trying to avoid memory pressure: create new element
            // only when absolutely necessary
            this.stack[this.popIdx] = new InsertStackElement(node, body);
        } else {
            item.node = node;
            item.body = body;
        }
        ++this.popIdx;
    },
    pop: function () {
        if (this.popIdx > 0) {
            return this.stack[--this.popIdx];
        }
    },
    reset: function () {
        this.popIdx = 0;
    }
};

function InsertStackElement(node, body) {
    this.node = node; // QuadTree node
    this.body = body; // physical body which needs to be inserted to node
}
`;
}
generateQuadTree.generateQuadTreeFunctionBody = generateQuadTreeFunctionBody_1;
generateQuadTree.getInsertStackCode = getInsertStackCode_1;
generateQuadTree.getQuadNodeCode = getQuadNodeCode_1;
generateQuadTree.isSamePosition = isSamePosition_1;
generateQuadTree.getChildBodyCode = getChildBodyCode_1;
generateQuadTree.setChildBodyCode = setChildBodyCode_1;
var generateBounds = generateBoundsFunction;
var generateFunctionBody = generateBoundsFunctionBody;
function generateBoundsFunction(dimension) {
  let code = generateBoundsFunctionBody(dimension);
  return new Function("bodies", "settings", "random", code);
}
function generateBoundsFunctionBody(dimension) {
  let pattern = createPatternBuilder(dimension);
  let code = `
  var boundingBox = {
    ${pattern("min_{var}: 0, max_{var}: 0,", {indent: 4})}
  };

  return {
    box: boundingBox,

    update: updateBoundingBox,

    reset: resetBoundingBox,

    getBestNewPosition: function (neighbors) {
      var ${pattern("base_{var} = 0", {join: ", "})};

      if (neighbors.length) {
        for (var i = 0; i < neighbors.length; ++i) {
          let neighborPos = neighbors[i].pos;
          ${pattern("base_{var} += neighborPos.{var};", {indent: 10})}
        }

        ${pattern("base_{var} /= neighbors.length;", {indent: 8})}
      } else {
        ${pattern("base_{var} = (boundingBox.min_{var} + boundingBox.max_{var}) / 2;", {indent: 8})}
      }

      var springLength = settings.springLength;
      return {
        ${pattern("{var}: base_{var} + (random.nextDouble() - 0.5) * springLength,", {indent: 8})}
      };
    }
  };

  function updateBoundingBox() {
    var i = bodies.length;
    if (i === 0) return; // No bodies - no borders.

    ${pattern("var max_{var} = -Infinity;", {indent: 4})}
    ${pattern("var min_{var} = Infinity;", {indent: 4})}

    while(i--) {
      // this is O(n), it could be done faster with quadtree, if we check the root node bounds
      var bodyPos = bodies[i].pos;
      ${pattern("if (bodyPos.{var} < min_{var}) min_{var} = bodyPos.{var};", {indent: 6})}
      ${pattern("if (bodyPos.{var} > max_{var}) max_{var} = bodyPos.{var};", {indent: 6})}
    }

    ${pattern("boundingBox.min_{var} = min_{var};", {indent: 4})}
    ${pattern("boundingBox.max_{var} = max_{var};", {indent: 4})}
  }

  function resetBoundingBox() {
    ${pattern("boundingBox.min_{var} = boundingBox.max_{var} = 0;", {indent: 4})}
  }
`;
  return code;
}
generateBounds.generateFunctionBody = generateFunctionBody;
var generateCreateDragForce = generateCreateDragForceFunction;
var generateCreateDragForceFunctionBody_1 = generateCreateDragForceFunctionBody;
function generateCreateDragForceFunction(dimension) {
  let code = generateCreateDragForceFunctionBody(dimension);
  return new Function("options", code);
}
function generateCreateDragForceFunctionBody(dimension) {
  let pattern = createPatternBuilder(dimension);
  let code = `
  if (!Number.isFinite(options.dragCoefficient)) throw new Error('dragCoefficient is not a finite number');

  return {
    update: function(body) {
      ${pattern("body.force.{var} -= options.dragCoefficient * body.velocity.{var};", {indent: 6})}
    }
  };
`;
  return code;
}
generateCreateDragForce.generateCreateDragForceFunctionBody = generateCreateDragForceFunctionBody_1;
var generateCreateSpringForce = generateCreateSpringForceFunction;
var generateCreateSpringForceFunctionBody_1 = generateCreateSpringForceFunctionBody;
function generateCreateSpringForceFunction(dimension) {
  let code = generateCreateSpringForceFunctionBody(dimension);
  return new Function("options", "random", code);
}
function generateCreateSpringForceFunctionBody(dimension) {
  let pattern = createPatternBuilder(dimension);
  let code = `
  if (!Number.isFinite(options.springCoefficient)) throw new Error('Spring coefficient is not a number');
  if (!Number.isFinite(options.springLength)) throw new Error('Spring length is not a number');

  return {
    /**
     * Updates forces acting on a spring
     */
    update: function (spring) {
      var body1 = spring.from;
      var body2 = spring.to;
      var length = spring.length < 0 ? options.springLength : spring.length;
      ${pattern("var d{var} = body2.pos.{var} - body1.pos.{var};", {indent: 6})}
      var r = Math.sqrt(${pattern("d{var} * d{var}", {join: " + "})});

      if (r === 0) {
        ${pattern("d{var} = (random.nextDouble() - 0.5) / 50;", {indent: 8})}
        r = Math.sqrt(${pattern("d{var} * d{var}", {join: " + "})});
      }

      var d = r - length;
      var coefficient = ((spring.coefficient > 0) ? spring.coefficient : options.springCoefficient) * d / r;

      ${pattern("body1.force.{var} += coefficient * d{var}", {indent: 6})};
      body1.springCount += 1;
      body1.springLength += r;

      ${pattern("body2.force.{var} -= coefficient * d{var}", {indent: 6})};
      body2.springCount += 1;
      body2.springLength += r;
    }
  };
`;
  return code;
}
generateCreateSpringForce.generateCreateSpringForceFunctionBody = generateCreateSpringForceFunctionBody_1;
var generateIntegrator = generateIntegratorFunction;
var generateIntegratorFunctionBody_1 = generateIntegratorFunctionBody;
function generateIntegratorFunction(dimension) {
  let code = generateIntegratorFunctionBody(dimension);
  return new Function("bodies", "timeStep", "adaptiveTimeStepWeight", code);
}
function generateIntegratorFunctionBody(dimension) {
  let pattern = createPatternBuilder(dimension);
  let code = `
  var length = bodies.length;
  if (length === 0) return 0;

  ${pattern("var d{var} = 0, t{var} = 0;", {indent: 2})}

  for (var i = 0; i < length; ++i) {
    var body = bodies[i];
    if (body.isPinned) continue;

    if (adaptiveTimeStepWeight && body.springCount) {
      timeStep = (adaptiveTimeStepWeight * body.springLength/body.springCount);
    }

    var coeff = timeStep / body.mass;

    ${pattern("body.velocity.{var} += coeff * body.force.{var};", {indent: 4})}
    ${pattern("var v{var} = body.velocity.{var};", {indent: 4})}
    var v = Math.sqrt(${pattern("v{var} * v{var}", {join: " + "})});

    if (v > 1) {
      // We normalize it so that we move within timeStep range. 
      // for the case when v <= 1 - we let velocity to fade out.
      ${pattern("body.velocity.{var} = v{var} / v;", {indent: 6})}
    }

    ${pattern("d{var} = timeStep * body.velocity.{var};", {indent: 4})}

    ${pattern("body.pos.{var} += d{var};", {indent: 4})}

    ${pattern("t{var} += Math.abs(d{var});", {indent: 4})}
  }

  return (${pattern("t{var} * t{var}", {join: " + "})})/length;
`;
  return code;
}
generateIntegrator.generateIntegratorFunctionBody = generateIntegratorFunctionBody_1;
var spring = Spring;
function Spring(fromBody, toBody, length2, springCoefficient) {
  this.from = fromBody;
  this.to = toBody;
  this.length = length2;
  this.coefficient = springCoefficient;
}
var ngraph_merge = merge;
function merge(target, options) {
  var key;
  if (!target) {
    target = {};
  }
  if (options) {
    for (key in options) {
      if (options.hasOwnProperty(key)) {
        var targetHasIt = target.hasOwnProperty(key), optionsValueType = typeof options[key], shouldReplace = !targetHasIt || typeof target[key] !== optionsValueType;
        if (shouldReplace) {
          target[key] = options[key];
        } else if (optionsValueType === "object") {
          target[key] = merge(target[key], options[key]);
        }
      }
    }
  }
  return target;
}
var ngraph_random = createCommonjsModule(function(module) {
  module.exports = random2;
  module.exports.random = random2, module.exports.randomIterator = randomIterator;
  function random2(inputSeed) {
    var seed = typeof inputSeed === "number" ? inputSeed : +new Date();
    return new Generator(seed);
  }
  function Generator(seed) {
    this.seed = seed;
  }
  Generator.prototype.next = next;
  Generator.prototype.nextDouble = nextDouble;
  Generator.prototype.uniform = nextDouble;
  Generator.prototype.gaussian = gaussian;
  function gaussian() {
    var r, x, y;
    do {
      x = this.nextDouble() * 2 - 1;
      y = this.nextDouble() * 2 - 1;
      r = x * x + y * y;
    } while (r >= 1 || r === 0);
    return x * Math.sqrt(-2 * Math.log(r) / r);
  }
  Generator.prototype.levy = levy;
  function levy() {
    var beta = 3 / 2;
    var sigma = Math.pow(gamma2(1 + beta) * Math.sin(Math.PI * beta / 2) / (gamma2((1 + beta) / 2) * beta * Math.pow(2, (beta - 1) / 2)), 1 / beta);
    return this.gaussian() * sigma / Math.pow(Math.abs(this.gaussian()), 1 / beta);
  }
  function gamma2(z) {
    return Math.sqrt(2 * Math.PI / z) * Math.pow(1 / Math.E * (z + 1 / (12 * z - 1 / (10 * z))), z);
  }
  function nextDouble() {
    var seed = this.seed;
    seed = seed + 2127912214 + (seed << 12) & 4294967295;
    seed = (seed ^ 3345072700 ^ seed >>> 19) & 4294967295;
    seed = seed + 374761393 + (seed << 5) & 4294967295;
    seed = (seed + 3550635116 ^ seed << 9) & 4294967295;
    seed = seed + 4251993797 + (seed << 3) & 4294967295;
    seed = (seed ^ 3042594569 ^ seed >>> 16) & 4294967295;
    this.seed = seed;
    return (seed & 268435455) / 268435456;
  }
  function next(maxValue) {
    return Math.floor(this.nextDouble() * maxValue);
  }
  function randomIterator(array2, customRandom) {
    var localRandom = customRandom || random2();
    if (typeof localRandom.next !== "function") {
      throw new Error("customRandom does not match expected API: next() function is missing");
    }
    return {
      forEach: forEach2,
      shuffle
    };
    function shuffle() {
      var i, j, t;
      for (i = array2.length - 1; i > 0; --i) {
        j = localRandom.next(i + 1);
        t = array2[j];
        array2[j] = array2[i];
        array2[i] = t;
      }
      return array2;
    }
    function forEach2(callback) {
      var i, j, t;
      for (i = array2.length - 1; i > 0; --i) {
        j = localRandom.next(i + 1);
        t = array2[j];
        array2[j] = array2[i];
        array2[i] = t;
        callback(t);
      }
      if (array2.length) {
        callback(array2[0]);
      }
    }
  }
});
var createPhysicsSimulator_1 = createPhysicsSimulator;
var dimensionalCache = {};
function createPhysicsSimulator(settings) {
  var Spring2 = spring;
  var merge2 = ngraph_merge;
  var eventify2 = ngraph_events;
  if (settings) {
    if (settings.springCoeff !== void 0)
      throw new Error("springCoeff was renamed to springCoefficient");
    if (settings.dragCoeff !== void 0)
      throw new Error("dragCoeff was renamed to dragCoefficient");
  }
  settings = merge2(settings, {
    springLength: 10,
    springCoefficient: 0.8,
    gravity: -12,
    theta: 0.8,
    dragCoefficient: 0.9,
    timeStep: 0.5,
    adaptiveTimeStepWeight: 0,
    dimensions: 2,
    debug: false
  });
  var factory = dimensionalCache[settings.dimensions];
  if (!factory) {
    var dimensions = settings.dimensions;
    factory = {
      Body: generateCreateBody(dimensions, settings.debug),
      createQuadTree: generateQuadTree(dimensions),
      createBounds: generateBounds(dimensions),
      createDragForce: generateCreateDragForce(dimensions),
      createSpringForce: generateCreateSpringForce(dimensions),
      integrate: generateIntegrator(dimensions)
    };
    dimensionalCache[dimensions] = factory;
  }
  var Body = factory.Body;
  var createQuadTree = factory.createQuadTree;
  var createBounds = factory.createBounds;
  var createDragForce = factory.createDragForce;
  var createSpringForce = factory.createSpringForce;
  var integrate = factory.integrate;
  var createBody = (pos) => new Body(pos);
  var random2 = ngraph_random.random(42);
  var bodies = [];
  var springs = [];
  var quadTree = createQuadTree(settings, random2);
  var bounds = createBounds(bodies, settings, random2);
  var springForce = createSpringForce(settings, random2);
  var dragForce = createDragForce(settings);
  var totalMovement = 0;
  var forces = [];
  var forceMap = new Map();
  var iterationNumber = 0;
  addForce("nbody", nbodyForce);
  addForce("spring", updateSpringForce);
  var publicApi = {
    bodies,
    quadTree,
    springs,
    settings,
    addForce,
    removeForce,
    getForces,
    step: function() {
      for (var i = 0; i < forces.length; ++i) {
        forces[i](iterationNumber);
      }
      var movement = integrate(bodies, settings.timeStep, settings.adaptiveTimeStepWeight);
      iterationNumber += 1;
      return movement;
    },
    addBody: function(body) {
      if (!body) {
        throw new Error("Body is required");
      }
      bodies.push(body);
      return body;
    },
    addBodyAt: function(pos) {
      if (!pos) {
        throw new Error("Body position is required");
      }
      var body = createBody(pos);
      bodies.push(body);
      return body;
    },
    removeBody: function(body) {
      if (!body) {
        return;
      }
      var idx = bodies.indexOf(body);
      if (idx < 0) {
        return;
      }
      bodies.splice(idx, 1);
      if (bodies.length === 0) {
        bounds.reset();
      }
      return true;
    },
    addSpring: function(body1, body2, springLength, springCoefficient) {
      if (!body1 || !body2) {
        throw new Error("Cannot add null spring to force simulator");
      }
      if (typeof springLength !== "number") {
        springLength = -1;
      }
      var spring2 = new Spring2(body1, body2, springLength, springCoefficient >= 0 ? springCoefficient : -1);
      springs.push(spring2);
      return spring2;
    },
    getTotalMovement: function() {
      return totalMovement;
    },
    removeSpring: function(spring2) {
      if (!spring2) {
        return;
      }
      var idx = springs.indexOf(spring2);
      if (idx > -1) {
        springs.splice(idx, 1);
        return true;
      }
    },
    getBestNewBodyPosition: function(neighbors) {
      return bounds.getBestNewPosition(neighbors);
    },
    getBBox: getBoundingBox,
    getBoundingBox,
    invalidateBBox: function() {
      console.warn("invalidateBBox() is deprecated, bounds always recomputed on `getBBox()` call");
    },
    gravity: function(value) {
      if (value !== void 0) {
        settings.gravity = value;
        quadTree.options({gravity: value});
        return this;
      } else {
        return settings.gravity;
      }
    },
    theta: function(value) {
      if (value !== void 0) {
        settings.theta = value;
        quadTree.options({theta: value});
        return this;
      } else {
        return settings.theta;
      }
    },
    random: random2
  };
  expose(settings, publicApi);
  eventify2(publicApi);
  return publicApi;
  function getBoundingBox() {
    bounds.update();
    return bounds.box;
  }
  function addForce(forceName, forceFunction) {
    if (forceMap.has(forceName))
      throw new Error("Force " + forceName + " is already added");
    forceMap.set(forceName, forceFunction);
    forces.push(forceFunction);
  }
  function removeForce(forceName) {
    var forceIndex = forces.indexOf(forceMap.get(forceName));
    if (forceIndex < 0)
      return;
    forces.splice(forceIndex, 1);
    forceMap.delete(forceName);
  }
  function getForces() {
    return forceMap;
  }
  function nbodyForce() {
    if (bodies.length === 0)
      return;
    quadTree.insertBodies(bodies);
    var i = bodies.length;
    while (i--) {
      var body = bodies[i];
      if (!body.isPinned) {
        body.reset();
        quadTree.updateBodyForce(body);
        dragForce.update(body);
      }
    }
  }
  function updateSpringForce() {
    var i = springs.length;
    while (i--) {
      springForce.update(springs[i]);
    }
  }
}
function expose(settings, target) {
  for (var key in settings) {
    augment(settings, target, key);
  }
}
function augment(source, target, key) {
  if (!source.hasOwnProperty(key))
    return;
  if (typeof target[key] === "function") {
    return;
  }
  var sourceIsNumber = Number.isFinite(source[key]);
  if (sourceIsNumber) {
    target[key] = function(value) {
      if (value !== void 0) {
        if (!Number.isFinite(value))
          throw new Error("Value of " + key + " should be a valid number.");
        source[key] = value;
        return target;
      }
      return source[key];
    };
  } else {
    target[key] = function(value) {
      if (value !== void 0) {
        source[key] = value;
        return target;
      }
      return source[key];
    };
  }
}
var ngraph_forcelayout = createLayout;
var simulator = createPhysicsSimulator_1;
function createLayout(graph, physicsSettings) {
  if (!graph) {
    throw new Error("Graph structure cannot be undefined");
  }
  var createSimulator = physicsSettings && physicsSettings.createSimulator || createPhysicsSimulator_1;
  var physicsSimulator = createSimulator(physicsSettings);
  if (Array.isArray(physicsSettings))
    throw new Error("Physics settings is expected to be an object");
  var nodeMass = graph.version > 19 ? defaultSetNodeMass : defaultArrayNodeMass;
  if (physicsSettings && typeof physicsSettings.nodeMass === "function") {
    nodeMass = physicsSettings.nodeMass;
  }
  var nodeBodies = new Map();
  var springs = {};
  var bodiesCount = 0;
  var springTransform = physicsSimulator.settings.springTransform || noop2;
  initPhysics();
  listenToEvents();
  var wasStable = false;
  var api = {
    step: function() {
      if (bodiesCount === 0) {
        updateStableStatus(true);
        return true;
      }
      var lastMove = physicsSimulator.step();
      api.lastMove = lastMove;
      api.fire("step");
      var ratio = lastMove / bodiesCount;
      var isStableNow = ratio <= 0.01;
      updateStableStatus(isStableNow);
      return isStableNow;
    },
    getNodePosition: function(nodeId) {
      return getInitializedBody(nodeId).pos;
    },
    setNodePosition: function(nodeId) {
      var body = getInitializedBody(nodeId);
      body.setPosition.apply(body, Array.prototype.slice.call(arguments, 1));
    },
    getLinkPosition: function(linkId) {
      var spring2 = springs[linkId];
      if (spring2) {
        return {
          from: spring2.from.pos,
          to: spring2.to.pos
        };
      }
    },
    getGraphRect: function() {
      return physicsSimulator.getBBox();
    },
    forEachBody,
    pinNode: function(node, isPinned) {
      var body = getInitializedBody(node.id);
      body.isPinned = !!isPinned;
    },
    isNodePinned: function(node) {
      return getInitializedBody(node.id).isPinned;
    },
    dispose: function() {
      graph.off("changed", onGraphChanged);
      api.fire("disposed");
    },
    getBody,
    getSpring,
    getForceVectorLength,
    simulator: physicsSimulator,
    graph,
    lastMove: 0
  };
  ngraph_events(api);
  return api;
  function updateStableStatus(isStableNow) {
    if (wasStable !== isStableNow) {
      wasStable = isStableNow;
      onStableChanged(isStableNow);
    }
  }
  function forEachBody(cb) {
    nodeBodies.forEach(cb);
  }
  function getForceVectorLength() {
    var fx = 0, fy = 0;
    forEachBody(function(body) {
      fx += Math.abs(body.force.x);
      fy += Math.abs(body.force.y);
    });
    return Math.sqrt(fx * fx + fy * fy);
  }
  function getSpring(fromId, toId) {
    var linkId;
    if (toId === void 0) {
      if (typeof fromId !== "object") {
        linkId = fromId;
      } else {
        linkId = fromId.id;
      }
    } else {
      var link2 = graph.hasLink(fromId, toId);
      if (!link2)
        return;
      linkId = link2.id;
    }
    return springs[linkId];
  }
  function getBody(nodeId) {
    return nodeBodies.get(nodeId);
  }
  function listenToEvents() {
    graph.on("changed", onGraphChanged);
  }
  function onStableChanged(isStable) {
    api.fire("stable", isStable);
  }
  function onGraphChanged(changes) {
    for (var i = 0; i < changes.length; ++i) {
      var change = changes[i];
      if (change.changeType === "add") {
        if (change.node) {
          initBody(change.node.id);
        }
        if (change.link) {
          initLink(change.link);
        }
      } else if (change.changeType === "remove") {
        if (change.node) {
          releaseNode(change.node);
        }
        if (change.link) {
          releaseLink(change.link);
        }
      }
    }
    bodiesCount = graph.getNodesCount();
  }
  function initPhysics() {
    bodiesCount = 0;
    graph.forEachNode(function(node) {
      initBody(node.id);
      bodiesCount += 1;
    });
    graph.forEachLink(initLink);
  }
  function initBody(nodeId) {
    var body = nodeBodies.get(nodeId);
    if (!body) {
      var node = graph.getNode(nodeId);
      if (!node) {
        throw new Error("initBody() was called with unknown node id");
      }
      var pos = node.position;
      if (!pos) {
        var neighbors = getNeighborBodies(node);
        pos = physicsSimulator.getBestNewBodyPosition(neighbors);
      }
      body = physicsSimulator.addBodyAt(pos);
      body.id = nodeId;
      nodeBodies.set(nodeId, body);
      updateBodyMass(nodeId);
      if (isNodeOriginallyPinned(node)) {
        body.isPinned = true;
      }
    }
  }
  function releaseNode(node) {
    var nodeId = node.id;
    var body = nodeBodies.get(nodeId);
    if (body) {
      nodeBodies.delete(nodeId);
      physicsSimulator.removeBody(body);
    }
  }
  function initLink(link2) {
    updateBodyMass(link2.fromId);
    updateBodyMass(link2.toId);
    var fromBody = nodeBodies.get(link2.fromId), toBody = nodeBodies.get(link2.toId), spring2 = physicsSimulator.addSpring(fromBody, toBody, link2.length);
    springTransform(link2, spring2);
    springs[link2.id] = spring2;
  }
  function releaseLink(link2) {
    var spring2 = springs[link2.id];
    if (spring2) {
      var from = graph.getNode(link2.fromId), to = graph.getNode(link2.toId);
      if (from)
        updateBodyMass(from.id);
      if (to)
        updateBodyMass(to.id);
      delete springs[link2.id];
      physicsSimulator.removeSpring(spring2);
    }
  }
  function getNeighborBodies(node) {
    var neighbors = [];
    if (!node.links) {
      return neighbors;
    }
    var maxNeighbors = Math.min(node.links.length, 2);
    for (var i = 0; i < maxNeighbors; ++i) {
      var link2 = node.links[i];
      var otherBody = link2.fromId !== node.id ? nodeBodies.get(link2.fromId) : nodeBodies.get(link2.toId);
      if (otherBody && otherBody.pos) {
        neighbors.push(otherBody);
      }
    }
    return neighbors;
  }
  function updateBodyMass(nodeId) {
    var body = nodeBodies.get(nodeId);
    body.mass = nodeMass(nodeId);
    if (Number.isNaN(body.mass)) {
      throw new Error("Node mass should be a number");
    }
  }
  function isNodeOriginallyPinned(node) {
    return node && (node.isPinned || node.data && node.data.isPinned);
  }
  function getInitializedBody(nodeId) {
    var body = nodeBodies.get(nodeId);
    if (!body) {
      initBody(nodeId);
      body = nodeBodies.get(nodeId);
    }
    return body;
  }
  function defaultArrayNodeMass(nodeId) {
    var links = graph.getLinks(nodeId);
    if (!links)
      return 1;
    return 1 + links.length / 3;
  }
  function defaultSetNodeMass(nodeId) {
    var links = graph.getLinks(nodeId);
    if (!links)
      return 1;
    return 1 + links.size / 3;
  }
}
function noop2() {
}
ngraph_forcelayout.simulator = simulator;

// build/_snowpack/pkg/d3-force-3d.js
function tree_add(d) {
  var x = +this._x.call(null, d);
  return add(this.cover(x), x, d);
}
function add(tree, x, d) {
  if (isNaN(x))
    return tree;
  var parent, node = tree._root, leaf = {data: d}, x0 = tree._x0, x1 = tree._x1, xm, xp, right, i, j;
  if (!node)
    return tree._root = leaf, tree;
  while (node.length) {
    if (right = x >= (xm = (x0 + x1) / 2))
      x0 = xm;
    else
      x1 = xm;
    if (parent = node, !(node = node[i = +right]))
      return parent[i] = leaf, tree;
  }
  xp = +tree._x.call(null, node.data);
  if (x === xp)
    return leaf.next = node, parent ? parent[i] = leaf : tree._root = leaf, tree;
  do {
    parent = parent ? parent[i] = new Array(2) : tree._root = new Array(2);
    if (right = x >= (xm = (x0 + x1) / 2))
      x0 = xm;
    else
      x1 = xm;
  } while ((i = +right) === (j = +(xp >= xm)));
  return parent[j] = node, parent[i] = leaf, tree;
}
function addAll(data) {
  var i, n = data.length, x, xz = new Array(n), x0 = Infinity, x1 = -Infinity;
  for (i = 0; i < n; ++i) {
    if (isNaN(x = +this._x.call(null, data[i])))
      continue;
    xz[i] = x;
    if (x < x0)
      x0 = x;
    if (x > x1)
      x1 = x;
  }
  if (x0 > x1)
    return this;
  this.cover(x0).cover(x1);
  for (i = 0; i < n; ++i) {
    add(this, xz[i], data[i]);
  }
  return this;
}
function tree_cover(x) {
  if (isNaN(x = +x))
    return this;
  var x0 = this._x0, x1 = this._x1;
  if (isNaN(x0)) {
    x1 = (x0 = Math.floor(x)) + 1;
  } else {
    var z = x1 - x0 || 1, node = this._root, parent, i;
    while (x0 > x || x >= x1) {
      i = +(x < x0);
      parent = new Array(2), parent[i] = node, node = parent, z *= 2;
      switch (i) {
        case 0:
          x1 = x0 + z;
          break;
        case 1:
          x0 = x1 - z;
          break;
      }
    }
    if (this._root && this._root.length)
      this._root = node;
  }
  this._x0 = x0;
  this._x1 = x1;
  return this;
}
function tree_data() {
  var data = [];
  this.visit(function(node) {
    if (!node.length)
      do
        data.push(node.data);
      while (node = node.next);
  });
  return data;
}
function tree_extent(_) {
  return arguments.length ? this.cover(+_[0][0]).cover(+_[1][0]) : isNaN(this._x0) ? void 0 : [[this._x0], [this._x1]];
}
function Half(node, x0, x1) {
  this.node = node;
  this.x0 = x0;
  this.x1 = x1;
}
function tree_find(x, radius) {
  var data, x0 = this._x0, x1, x2, x3 = this._x1, halves = [], node = this._root, q, i;
  if (node)
    halves.push(new Half(node, x0, x3));
  if (radius == null)
    radius = Infinity;
  else {
    x0 = x - radius;
    x3 = x + radius;
  }
  while (q = halves.pop()) {
    if (!(node = q.node) || (x1 = q.x0) > x3 || (x2 = q.x1) < x0)
      continue;
    if (node.length) {
      var xm = (x1 + x2) / 2;
      halves.push(new Half(node[1], xm, x2), new Half(node[0], x1, xm));
      if (i = +(x >= xm)) {
        q = halves[halves.length - 1];
        halves[halves.length - 1] = halves[halves.length - 1 - i];
        halves[halves.length - 1 - i] = q;
      }
    } else {
      var d = Math.abs(x - +this._x.call(null, node.data));
      if (d < radius) {
        radius = d;
        x0 = x - d;
        x3 = x + d;
        data = node.data;
      }
    }
  }
  return data;
}
function tree_remove(d) {
  if (isNaN(x = +this._x.call(null, d)))
    return this;
  var parent, node = this._root, retainer, previous, next, x0 = this._x0, x1 = this._x1, x, xm, right, i, j;
  if (!node)
    return this;
  if (node.length)
    while (true) {
      if (right = x >= (xm = (x0 + x1) / 2))
        x0 = xm;
      else
        x1 = xm;
      if (!(parent = node, node = node[i = +right]))
        return this;
      if (!node.length)
        break;
      if (parent[i + 1 & 1])
        retainer = parent, j = i;
    }
  while (node.data !== d)
    if (!(previous = node, node = node.next))
      return this;
  if (next = node.next)
    delete node.next;
  if (previous)
    return next ? previous.next = next : delete previous.next, this;
  if (!parent)
    return this._root = next, this;
  next ? parent[i] = next : delete parent[i];
  if ((node = parent[0] || parent[1]) && node === (parent[1] || parent[0]) && !node.length) {
    if (retainer)
      retainer[j] = node;
    else
      this._root = node;
  }
  return this;
}
function removeAll(data) {
  for (var i = 0, n = data.length; i < n; ++i)
    this.remove(data[i]);
  return this;
}
function tree_root() {
  return this._root;
}
function tree_size() {
  var size = 0;
  this.visit(function(node) {
    if (!node.length)
      do
        ++size;
      while (node = node.next);
  });
  return size;
}
function tree_visit(callback) {
  var halves = [], q, node = this._root, child, x0, x1;
  if (node)
    halves.push(new Half(node, this._x0, this._x1));
  while (q = halves.pop()) {
    if (!callback(node = q.node, x0 = q.x0, x1 = q.x1) && node.length) {
      var xm = (x0 + x1) / 2;
      if (child = node[1])
        halves.push(new Half(child, xm, x1));
      if (child = node[0])
        halves.push(new Half(child, x0, xm));
    }
  }
  return this;
}
function tree_visitAfter(callback) {
  var halves = [], next = [], q;
  if (this._root)
    halves.push(new Half(this._root, this._x0, this._x1));
  while (q = halves.pop()) {
    var node = q.node;
    if (node.length) {
      var child, x0 = q.x0, x1 = q.x1, xm = (x0 + x1) / 2;
      if (child = node[0])
        halves.push(new Half(child, x0, xm));
      if (child = node[1])
        halves.push(new Half(child, xm, x1));
    }
    next.push(q);
  }
  while (q = next.pop()) {
    callback(q.node, q.x0, q.x1);
  }
  return this;
}
function defaultX(d) {
  return d[0];
}
function tree_x(_) {
  return arguments.length ? (this._x = _, this) : this._x;
}
function binarytree(nodes, x) {
  var tree = new Binarytree(x == null ? defaultX : x, NaN, NaN);
  return nodes == null ? tree : tree.addAll(nodes);
}
function Binarytree(x, x0, x1) {
  this._x = x;
  this._x0 = x0;
  this._x1 = x1;
  this._root = void 0;
}
function leaf_copy(leaf) {
  var copy2 = {data: leaf.data}, next = copy2;
  while (leaf = leaf.next)
    next = next.next = {data: leaf.data};
  return copy2;
}
var treeProto = binarytree.prototype = Binarytree.prototype;
treeProto.copy = function() {
  var copy2 = new Binarytree(this._x, this._x0, this._x1), node = this._root, nodes, child;
  if (!node)
    return copy2;
  if (!node.length)
    return copy2._root = leaf_copy(node), copy2;
  nodes = [{source: node, target: copy2._root = new Array(2)}];
  while (node = nodes.pop()) {
    for (var i = 0; i < 2; ++i) {
      if (child = node.source[i]) {
        if (child.length)
          nodes.push({source: child, target: node.target[i] = new Array(2)});
        else
          node.target[i] = leaf_copy(child);
      }
    }
  }
  return copy2;
};
treeProto.add = tree_add;
treeProto.addAll = addAll;
treeProto.cover = tree_cover;
treeProto.data = tree_data;
treeProto.extent = tree_extent;
treeProto.find = tree_find;
treeProto.remove = tree_remove;
treeProto.removeAll = removeAll;
treeProto.root = tree_root;
treeProto.size = tree_size;
treeProto.visit = tree_visit;
treeProto.visitAfter = tree_visitAfter;
treeProto.x = tree_x;
function tree_add$1(d) {
  const x = +this._x.call(null, d), y = +this._y.call(null, d);
  return add$1(this.cover(x, y), x, y, d);
}
function add$1(tree, x, y, d) {
  if (isNaN(x) || isNaN(y))
    return tree;
  var parent, node = tree._root, leaf = {data: d}, x0 = tree._x0, y0 = tree._y0, x1 = tree._x1, y1 = tree._y1, xm, ym, xp, yp, right, bottom, i, j;
  if (!node)
    return tree._root = leaf, tree;
  while (node.length) {
    if (right = x >= (xm = (x0 + x1) / 2))
      x0 = xm;
    else
      x1 = xm;
    if (bottom = y >= (ym = (y0 + y1) / 2))
      y0 = ym;
    else
      y1 = ym;
    if (parent = node, !(node = node[i = bottom << 1 | right]))
      return parent[i] = leaf, tree;
  }
  xp = +tree._x.call(null, node.data);
  yp = +tree._y.call(null, node.data);
  if (x === xp && y === yp)
    return leaf.next = node, parent ? parent[i] = leaf : tree._root = leaf, tree;
  do {
    parent = parent ? parent[i] = new Array(4) : tree._root = new Array(4);
    if (right = x >= (xm = (x0 + x1) / 2))
      x0 = xm;
    else
      x1 = xm;
    if (bottom = y >= (ym = (y0 + y1) / 2))
      y0 = ym;
    else
      y1 = ym;
  } while ((i = bottom << 1 | right) === (j = (yp >= ym) << 1 | xp >= xm));
  return parent[j] = node, parent[i] = leaf, tree;
}
function addAll$1(data) {
  var d, i, n = data.length, x, y, xz = new Array(n), yz = new Array(n), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (i = 0; i < n; ++i) {
    if (isNaN(x = +this._x.call(null, d = data[i])) || isNaN(y = +this._y.call(null, d)))
      continue;
    xz[i] = x;
    yz[i] = y;
    if (x < x0)
      x0 = x;
    if (x > x1)
      x1 = x;
    if (y < y0)
      y0 = y;
    if (y > y1)
      y1 = y;
  }
  if (x0 > x1 || y0 > y1)
    return this;
  this.cover(x0, y0).cover(x1, y1);
  for (i = 0; i < n; ++i) {
    add$1(this, xz[i], yz[i], data[i]);
  }
  return this;
}
function tree_cover$1(x, y) {
  if (isNaN(x = +x) || isNaN(y = +y))
    return this;
  var x0 = this._x0, y0 = this._y0, x1 = this._x1, y1 = this._y1;
  if (isNaN(x0)) {
    x1 = (x0 = Math.floor(x)) + 1;
    y1 = (y0 = Math.floor(y)) + 1;
  } else {
    var z = x1 - x0 || 1, node = this._root, parent, i;
    while (x0 > x || x >= x1 || y0 > y || y >= y1) {
      i = (y < y0) << 1 | x < x0;
      parent = new Array(4), parent[i] = node, node = parent, z *= 2;
      switch (i) {
        case 0:
          x1 = x0 + z, y1 = y0 + z;
          break;
        case 1:
          x0 = x1 - z, y1 = y0 + z;
          break;
        case 2:
          x1 = x0 + z, y0 = y1 - z;
          break;
        case 3:
          x0 = x1 - z, y0 = y1 - z;
          break;
      }
    }
    if (this._root && this._root.length)
      this._root = node;
  }
  this._x0 = x0;
  this._y0 = y0;
  this._x1 = x1;
  this._y1 = y1;
  return this;
}
function tree_data$1() {
  var data = [];
  this.visit(function(node) {
    if (!node.length)
      do
        data.push(node.data);
      while (node = node.next);
  });
  return data;
}
function tree_extent$1(_) {
  return arguments.length ? this.cover(+_[0][0], +_[0][1]).cover(+_[1][0], +_[1][1]) : isNaN(this._x0) ? void 0 : [[this._x0, this._y0], [this._x1, this._y1]];
}
function Quad(node, x0, y0, x1, y1) {
  this.node = node;
  this.x0 = x0;
  this.y0 = y0;
  this.x1 = x1;
  this.y1 = y1;
}
function tree_find$1(x, y, radius) {
  var data, x0 = this._x0, y0 = this._y0, x1, y1, x2, y2, x3 = this._x1, y3 = this._y1, quads = [], node = this._root, q, i;
  if (node)
    quads.push(new Quad(node, x0, y0, x3, y3));
  if (radius == null)
    radius = Infinity;
  else {
    x0 = x - radius, y0 = y - radius;
    x3 = x + radius, y3 = y + radius;
    radius *= radius;
  }
  while (q = quads.pop()) {
    if (!(node = q.node) || (x1 = q.x0) > x3 || (y1 = q.y0) > y3 || (x2 = q.x1) < x0 || (y2 = q.y1) < y0)
      continue;
    if (node.length) {
      var xm = (x1 + x2) / 2, ym = (y1 + y2) / 2;
      quads.push(new Quad(node[3], xm, ym, x2, y2), new Quad(node[2], x1, ym, xm, y2), new Quad(node[1], xm, y1, x2, ym), new Quad(node[0], x1, y1, xm, ym));
      if (i = (y >= ym) << 1 | x >= xm) {
        q = quads[quads.length - 1];
        quads[quads.length - 1] = quads[quads.length - 1 - i];
        quads[quads.length - 1 - i] = q;
      }
    } else {
      var dx = x - +this._x.call(null, node.data), dy = y - +this._y.call(null, node.data), d2 = dx * dx + dy * dy;
      if (d2 < radius) {
        var d = Math.sqrt(radius = d2);
        x0 = x - d, y0 = y - d;
        x3 = x + d, y3 = y + d;
        data = node.data;
      }
    }
  }
  return data;
}
function tree_remove$1(d) {
  if (isNaN(x = +this._x.call(null, d)) || isNaN(y = +this._y.call(null, d)))
    return this;
  var parent, node = this._root, retainer, previous, next, x0 = this._x0, y0 = this._y0, x1 = this._x1, y1 = this._y1, x, y, xm, ym, right, bottom, i, j;
  if (!node)
    return this;
  if (node.length)
    while (true) {
      if (right = x >= (xm = (x0 + x1) / 2))
        x0 = xm;
      else
        x1 = xm;
      if (bottom = y >= (ym = (y0 + y1) / 2))
        y0 = ym;
      else
        y1 = ym;
      if (!(parent = node, node = node[i = bottom << 1 | right]))
        return this;
      if (!node.length)
        break;
      if (parent[i + 1 & 3] || parent[i + 2 & 3] || parent[i + 3 & 3])
        retainer = parent, j = i;
    }
  while (node.data !== d)
    if (!(previous = node, node = node.next))
      return this;
  if (next = node.next)
    delete node.next;
  if (previous)
    return next ? previous.next = next : delete previous.next, this;
  if (!parent)
    return this._root = next, this;
  next ? parent[i] = next : delete parent[i];
  if ((node = parent[0] || parent[1] || parent[2] || parent[3]) && node === (parent[3] || parent[2] || parent[1] || parent[0]) && !node.length) {
    if (retainer)
      retainer[j] = node;
    else
      this._root = node;
  }
  return this;
}
function removeAll$1(data) {
  for (var i = 0, n = data.length; i < n; ++i)
    this.remove(data[i]);
  return this;
}
function tree_root$1() {
  return this._root;
}
function tree_size$1() {
  var size = 0;
  this.visit(function(node) {
    if (!node.length)
      do
        ++size;
      while (node = node.next);
  });
  return size;
}
function tree_visit$1(callback) {
  var quads = [], q, node = this._root, child, x0, y0, x1, y1;
  if (node)
    quads.push(new Quad(node, this._x0, this._y0, this._x1, this._y1));
  while (q = quads.pop()) {
    if (!callback(node = q.node, x0 = q.x0, y0 = q.y0, x1 = q.x1, y1 = q.y1) && node.length) {
      var xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
      if (child = node[3])
        quads.push(new Quad(child, xm, ym, x1, y1));
      if (child = node[2])
        quads.push(new Quad(child, x0, ym, xm, y1));
      if (child = node[1])
        quads.push(new Quad(child, xm, y0, x1, ym));
      if (child = node[0])
        quads.push(new Quad(child, x0, y0, xm, ym));
    }
  }
  return this;
}
function tree_visitAfter$1(callback) {
  var quads = [], next = [], q;
  if (this._root)
    quads.push(new Quad(this._root, this._x0, this._y0, this._x1, this._y1));
  while (q = quads.pop()) {
    var node = q.node;
    if (node.length) {
      var child, x0 = q.x0, y0 = q.y0, x1 = q.x1, y1 = q.y1, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
      if (child = node[0])
        quads.push(new Quad(child, x0, y0, xm, ym));
      if (child = node[1])
        quads.push(new Quad(child, xm, y0, x1, ym));
      if (child = node[2])
        quads.push(new Quad(child, x0, ym, xm, y1));
      if (child = node[3])
        quads.push(new Quad(child, xm, ym, x1, y1));
    }
    next.push(q);
  }
  while (q = next.pop()) {
    callback(q.node, q.x0, q.y0, q.x1, q.y1);
  }
  return this;
}
function defaultX$1(d) {
  return d[0];
}
function tree_x$1(_) {
  return arguments.length ? (this._x = _, this) : this._x;
}
function defaultY(d) {
  return d[1];
}
function tree_y(_) {
  return arguments.length ? (this._y = _, this) : this._y;
}
function quadtree(nodes, x, y) {
  var tree = new Quadtree(x == null ? defaultX$1 : x, y == null ? defaultY : y, NaN, NaN, NaN, NaN);
  return nodes == null ? tree : tree.addAll(nodes);
}
function Quadtree(x, y, x0, y0, x1, y1) {
  this._x = x;
  this._y = y;
  this._x0 = x0;
  this._y0 = y0;
  this._x1 = x1;
  this._y1 = y1;
  this._root = void 0;
}
function leaf_copy$1(leaf) {
  var copy2 = {data: leaf.data}, next = copy2;
  while (leaf = leaf.next)
    next = next.next = {data: leaf.data};
  return copy2;
}
var treeProto$1 = quadtree.prototype = Quadtree.prototype;
treeProto$1.copy = function() {
  var copy2 = new Quadtree(this._x, this._y, this._x0, this._y0, this._x1, this._y1), node = this._root, nodes, child;
  if (!node)
    return copy2;
  if (!node.length)
    return copy2._root = leaf_copy$1(node), copy2;
  nodes = [{source: node, target: copy2._root = new Array(4)}];
  while (node = nodes.pop()) {
    for (var i = 0; i < 4; ++i) {
      if (child = node.source[i]) {
        if (child.length)
          nodes.push({source: child, target: node.target[i] = new Array(4)});
        else
          node.target[i] = leaf_copy$1(child);
      }
    }
  }
  return copy2;
};
treeProto$1.add = tree_add$1;
treeProto$1.addAll = addAll$1;
treeProto$1.cover = tree_cover$1;
treeProto$1.data = tree_data$1;
treeProto$1.extent = tree_extent$1;
treeProto$1.find = tree_find$1;
treeProto$1.remove = tree_remove$1;
treeProto$1.removeAll = removeAll$1;
treeProto$1.root = tree_root$1;
treeProto$1.size = tree_size$1;
treeProto$1.visit = tree_visit$1;
treeProto$1.visitAfter = tree_visitAfter$1;
treeProto$1.x = tree_x$1;
treeProto$1.y = tree_y;
function tree_add$2(d) {
  var x = +this._x.call(null, d), y = +this._y.call(null, d), z = +this._z.call(null, d);
  return add$22(this.cover(x, y, z), x, y, z, d);
}
function add$22(tree, x, y, z, d) {
  if (isNaN(x) || isNaN(y) || isNaN(z))
    return tree;
  var parent, node = tree._root, leaf = {data: d}, x0 = tree._x0, y0 = tree._y0, z0 = tree._z0, x1 = tree._x1, y1 = tree._y1, z1 = tree._z1, xm, ym, zm, xp, yp, zp, right, bottom, deep, i, j;
  if (!node)
    return tree._root = leaf, tree;
  while (node.length) {
    if (right = x >= (xm = (x0 + x1) / 2))
      x0 = xm;
    else
      x1 = xm;
    if (bottom = y >= (ym = (y0 + y1) / 2))
      y0 = ym;
    else
      y1 = ym;
    if (deep = z >= (zm = (z0 + z1) / 2))
      z0 = zm;
    else
      z1 = zm;
    if (parent = node, !(node = node[i = deep << 2 | bottom << 1 | right]))
      return parent[i] = leaf, tree;
  }
  xp = +tree._x.call(null, node.data);
  yp = +tree._y.call(null, node.data);
  zp = +tree._z.call(null, node.data);
  if (x === xp && y === yp && z === zp)
    return leaf.next = node, parent ? parent[i] = leaf : tree._root = leaf, tree;
  do {
    parent = parent ? parent[i] = new Array(8) : tree._root = new Array(8);
    if (right = x >= (xm = (x0 + x1) / 2))
      x0 = xm;
    else
      x1 = xm;
    if (bottom = y >= (ym = (y0 + y1) / 2))
      y0 = ym;
    else
      y1 = ym;
    if (deep = z >= (zm = (z0 + z1) / 2))
      z0 = zm;
    else
      z1 = zm;
  } while ((i = deep << 2 | bottom << 1 | right) === (j = (zp >= zm) << 2 | (yp >= ym) << 1 | xp >= xm));
  return parent[j] = node, parent[i] = leaf, tree;
}
function addAll$2(data) {
  var d, i, n = data.length, x, y, z, xz = new Array(n), yz = new Array(n), zz = new Array(n), x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (i = 0; i < n; ++i) {
    if (isNaN(x = +this._x.call(null, d = data[i])) || isNaN(y = +this._y.call(null, d)) || isNaN(z = +this._z.call(null, d)))
      continue;
    xz[i] = x;
    yz[i] = y;
    zz[i] = z;
    if (x < x0)
      x0 = x;
    if (x > x1)
      x1 = x;
    if (y < y0)
      y0 = y;
    if (y > y1)
      y1 = y;
    if (z < z0)
      z0 = z;
    if (z > z1)
      z1 = z;
  }
  if (x0 > x1 || y0 > y1 || z0 > z1)
    return this;
  this.cover(x0, y0, z0).cover(x1, y1, z1);
  for (i = 0; i < n; ++i) {
    add$22(this, xz[i], yz[i], zz[i], data[i]);
  }
  return this;
}
function tree_cover$2(x, y, z) {
  if (isNaN(x = +x) || isNaN(y = +y) || isNaN(z = +z))
    return this;
  var x0 = this._x0, y0 = this._y0, z0 = this._z0, x1 = this._x1, y1 = this._y1, z1 = this._z1;
  if (isNaN(x0)) {
    x1 = (x0 = Math.floor(x)) + 1;
    y1 = (y0 = Math.floor(y)) + 1;
    z1 = (z0 = Math.floor(z)) + 1;
  } else {
    var t = x1 - x0 || 1, node = this._root, parent, i;
    while (x0 > x || x >= x1 || y0 > y || y >= y1 || z0 > z || z >= z1) {
      i = (z < z0) << 2 | (y < y0) << 1 | x < x0;
      parent = new Array(8), parent[i] = node, node = parent, t *= 2;
      switch (i) {
        case 0:
          x1 = x0 + t, y1 = y0 + t, z1 = z0 + t;
          break;
        case 1:
          x0 = x1 - t, y1 = y0 + t, z1 = z0 + t;
          break;
        case 2:
          x1 = x0 + t, y0 = y1 - t, z1 = z0 + t;
          break;
        case 3:
          x0 = x1 - t, y0 = y1 - t, z1 = z0 + t;
          break;
        case 4:
          x1 = x0 + t, y1 = y0 + t, z0 = z1 - t;
          break;
        case 5:
          x0 = x1 - t, y1 = y0 + t, z0 = z1 - t;
          break;
        case 6:
          x1 = x0 + t, y0 = y1 - t, z0 = z1 - t;
          break;
        case 7:
          x0 = x1 - t, y0 = y1 - t, z0 = z1 - t;
          break;
      }
    }
    if (this._root && this._root.length)
      this._root = node;
  }
  this._x0 = x0;
  this._y0 = y0;
  this._z0 = z0;
  this._x1 = x1;
  this._y1 = y1;
  this._z1 = z1;
  return this;
}
function tree_data$2() {
  var data = [];
  this.visit(function(node) {
    if (!node.length)
      do
        data.push(node.data);
      while (node = node.next);
  });
  return data;
}
function tree_extent$2(_) {
  return arguments.length ? this.cover(+_[0][0], +_[0][1], +_[0][2]).cover(+_[1][0], +_[1][1], +_[1][2]) : isNaN(this._x0) ? void 0 : [[this._x0, this._y0, this._z0], [this._x1, this._y1, this._z1]];
}
function Octant(node, x0, y0, z0, x1, y1, z1) {
  this.node = node;
  this.x0 = x0;
  this.y0 = y0;
  this.z0 = z0;
  this.x1 = x1;
  this.y1 = y1;
  this.z1 = z1;
}
function tree_find$2(x, y, z, radius) {
  var data, x0 = this._x0, y0 = this._y0, z0 = this._z0, x1, y1, z1, x2, y2, z2, x3 = this._x1, y3 = this._y1, z3 = this._z1, octs = [], node = this._root, q, i;
  if (node)
    octs.push(new Octant(node, x0, y0, z0, x3, y3, z3));
  if (radius == null)
    radius = Infinity;
  else {
    x0 = x - radius, y0 = y - radius, z0 = z - radius;
    x3 = x + radius, y3 = y + radius, z3 = z + radius;
    radius *= radius;
  }
  while (q = octs.pop()) {
    if (!(node = q.node) || (x1 = q.x0) > x3 || (y1 = q.y0) > y3 || (z1 = q.z0) > z3 || (x2 = q.x1) < x0 || (y2 = q.y1) < y0 || (z2 = q.z1) < z0)
      continue;
    if (node.length) {
      var xm = (x1 + x2) / 2, ym = (y1 + y2) / 2, zm = (z1 + z2) / 2;
      octs.push(new Octant(node[7], xm, ym, zm, x2, y2, z2), new Octant(node[6], x1, ym, zm, xm, y2, z2), new Octant(node[5], xm, y1, zm, x2, ym, z2), new Octant(node[4], x1, y1, zm, xm, ym, z2), new Octant(node[3], xm, ym, z1, x2, y2, zm), new Octant(node[2], x1, ym, z1, xm, y2, zm), new Octant(node[1], xm, y1, z1, x2, ym, zm), new Octant(node[0], x1, y1, z1, xm, ym, zm));
      if (i = (z >= zm) << 2 | (y >= ym) << 1 | x >= xm) {
        q = octs[octs.length - 1];
        octs[octs.length - 1] = octs[octs.length - 1 - i];
        octs[octs.length - 1 - i] = q;
      }
    } else {
      var dx = x - +this._x.call(null, node.data), dy = y - +this._y.call(null, node.data), dz = z - +this._z.call(null, node.data), d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < radius) {
        var d = Math.sqrt(radius = d2);
        x0 = x - d, y0 = y - d, z0 = z - d;
        x3 = x + d, y3 = y + d, z3 = z + d;
        data = node.data;
      }
    }
  }
  return data;
}
function tree_remove$2(d) {
  if (isNaN(x = +this._x.call(null, d)) || isNaN(y = +this._y.call(null, d)) || isNaN(z = +this._z.call(null, d)))
    return this;
  var parent, node = this._root, retainer, previous, next, x0 = this._x0, y0 = this._y0, z0 = this._z0, x1 = this._x1, y1 = this._y1, z1 = this._z1, x, y, z, xm, ym, zm, right, bottom, deep, i, j;
  if (!node)
    return this;
  if (node.length)
    while (true) {
      if (right = x >= (xm = (x0 + x1) / 2))
        x0 = xm;
      else
        x1 = xm;
      if (bottom = y >= (ym = (y0 + y1) / 2))
        y0 = ym;
      else
        y1 = ym;
      if (deep = z >= (zm = (z0 + z1) / 2))
        z0 = zm;
      else
        z1 = zm;
      if (!(parent = node, node = node[i = deep << 2 | bottom << 1 | right]))
        return this;
      if (!node.length)
        break;
      if (parent[i + 1 & 7] || parent[i + 2 & 7] || parent[i + 3 & 7] || parent[i + 4 & 7] || parent[i + 5 & 7] || parent[i + 6 & 7] || parent[i + 7 & 7])
        retainer = parent, j = i;
    }
  while (node.data !== d)
    if (!(previous = node, node = node.next))
      return this;
  if (next = node.next)
    delete node.next;
  if (previous)
    return next ? previous.next = next : delete previous.next, this;
  if (!parent)
    return this._root = next, this;
  next ? parent[i] = next : delete parent[i];
  if ((node = parent[0] || parent[1] || parent[2] || parent[3] || parent[4] || parent[5] || parent[6] || parent[7]) && node === (parent[7] || parent[6] || parent[5] || parent[4] || parent[3] || parent[2] || parent[1] || parent[0]) && !node.length) {
    if (retainer)
      retainer[j] = node;
    else
      this._root = node;
  }
  return this;
}
function removeAll$2(data) {
  for (var i = 0, n = data.length; i < n; ++i)
    this.remove(data[i]);
  return this;
}
function tree_root$2() {
  return this._root;
}
function tree_size$2() {
  var size = 0;
  this.visit(function(node) {
    if (!node.length)
      do
        ++size;
      while (node = node.next);
  });
  return size;
}
function tree_visit$2(callback) {
  var octs = [], q, node = this._root, child, x0, y0, z0, x1, y1, z1;
  if (node)
    octs.push(new Octant(node, this._x0, this._y0, this._z0, this._x1, this._y1, this._z1));
  while (q = octs.pop()) {
    if (!callback(node = q.node, x0 = q.x0, y0 = q.y0, z0 = q.z0, x1 = q.x1, y1 = q.y1, z1 = q.z1) && node.length) {
      var xm = (x0 + x1) / 2, ym = (y0 + y1) / 2, zm = (z0 + z1) / 2;
      if (child = node[7])
        octs.push(new Octant(child, xm, ym, zm, x1, y1, z1));
      if (child = node[6])
        octs.push(new Octant(child, x0, ym, zm, xm, y1, z1));
      if (child = node[5])
        octs.push(new Octant(child, xm, y0, zm, x1, ym, z1));
      if (child = node[4])
        octs.push(new Octant(child, x0, y0, zm, xm, ym, z1));
      if (child = node[3])
        octs.push(new Octant(child, xm, ym, z0, x1, y1, zm));
      if (child = node[2])
        octs.push(new Octant(child, x0, ym, z0, xm, y1, zm));
      if (child = node[1])
        octs.push(new Octant(child, xm, y0, z0, x1, ym, zm));
      if (child = node[0])
        octs.push(new Octant(child, x0, y0, z0, xm, ym, zm));
    }
  }
  return this;
}
function tree_visitAfter$2(callback) {
  var octs = [], next = [], q;
  if (this._root)
    octs.push(new Octant(this._root, this._x0, this._y0, this._z0, this._x1, this._y1, this._z1));
  while (q = octs.pop()) {
    var node = q.node;
    if (node.length) {
      var child, x0 = q.x0, y0 = q.y0, z0 = q.z0, x1 = q.x1, y1 = q.y1, z1 = q.z1, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2, zm = (z0 + z1) / 2;
      if (child = node[0])
        octs.push(new Octant(child, x0, y0, z0, xm, ym, zm));
      if (child = node[1])
        octs.push(new Octant(child, xm, y0, z0, x1, ym, zm));
      if (child = node[2])
        octs.push(new Octant(child, x0, ym, z0, xm, y1, zm));
      if (child = node[3])
        octs.push(new Octant(child, xm, ym, z0, x1, y1, zm));
      if (child = node[4])
        octs.push(new Octant(child, x0, y0, zm, xm, ym, z1));
      if (child = node[5])
        octs.push(new Octant(child, xm, y0, zm, x1, ym, z1));
      if (child = node[6])
        octs.push(new Octant(child, x0, ym, zm, xm, y1, z1));
      if (child = node[7])
        octs.push(new Octant(child, xm, ym, zm, x1, y1, z1));
    }
    next.push(q);
  }
  while (q = next.pop()) {
    callback(q.node, q.x0, q.y0, q.z0, q.x1, q.y1, q.z1);
  }
  return this;
}
function defaultX$2(d) {
  return d[0];
}
function tree_x$2(_) {
  return arguments.length ? (this._x = _, this) : this._x;
}
function defaultY$1(d) {
  return d[1];
}
function tree_y$1(_) {
  return arguments.length ? (this._y = _, this) : this._y;
}
function defaultZ(d) {
  return d[2];
}
function tree_z(_) {
  return arguments.length ? (this._z = _, this) : this._z;
}
function octree(nodes, x, y, z) {
  var tree = new Octree(x == null ? defaultX$2 : x, y == null ? defaultY$1 : y, z == null ? defaultZ : z, NaN, NaN, NaN, NaN, NaN, NaN);
  return nodes == null ? tree : tree.addAll(nodes);
}
function Octree(x, y, z, x0, y0, z0, x1, y1, z1) {
  this._x = x;
  this._y = y;
  this._z = z;
  this._x0 = x0;
  this._y0 = y0;
  this._z0 = z0;
  this._x1 = x1;
  this._y1 = y1;
  this._z1 = z1;
  this._root = void 0;
}
function leaf_copy$2(leaf) {
  var copy2 = {data: leaf.data}, next = copy2;
  while (leaf = leaf.next)
    next = next.next = {data: leaf.data};
  return copy2;
}
var treeProto$2 = octree.prototype = Octree.prototype;
treeProto$2.copy = function() {
  var copy2 = new Octree(this._x, this._y, this._z, this._x0, this._y0, this._z0, this._x1, this._y1, this._z1), node = this._root, nodes, child;
  if (!node)
    return copy2;
  if (!node.length)
    return copy2._root = leaf_copy$2(node), copy2;
  nodes = [{source: node, target: copy2._root = new Array(8)}];
  while (node = nodes.pop()) {
    for (var i = 0; i < 8; ++i) {
      if (child = node.source[i]) {
        if (child.length)
          nodes.push({source: child, target: node.target[i] = new Array(8)});
        else
          node.target[i] = leaf_copy$2(child);
      }
    }
  }
  return copy2;
};
treeProto$2.add = tree_add$2;
treeProto$2.addAll = addAll$2;
treeProto$2.cover = tree_cover$2;
treeProto$2.data = tree_data$2;
treeProto$2.extent = tree_extent$2;
treeProto$2.find = tree_find$2;
treeProto$2.remove = tree_remove$2;
treeProto$2.removeAll = removeAll$2;
treeProto$2.root = tree_root$2;
treeProto$2.size = tree_size$2;
treeProto$2.visit = tree_visit$2;
treeProto$2.visitAfter = tree_visitAfter$2;
treeProto$2.x = tree_x$2;
treeProto$2.y = tree_y$1;
treeProto$2.z = tree_z;
var initialAngleRoll = Math.PI * (3 - Math.sqrt(5));
var initialAngleYaw = Math.PI * 20 / (9 + Math.sqrt(221));

// build/_snowpack/pkg/pica.js
var pica = createCommonjsModule(function(module, exports) {
  /*!
  
  pica
  https://github.com/nodeca/pica
  
  */
  (function(f) {
    {
      module.exports = f();
    }
  })(function() {
    return function() {
      function r(e, n, t) {
        function o(i2, f) {
          if (!n[i2]) {
            if (!e[i2]) {
              var c2 = typeof commonjsRequire == "function" && commonjsRequire;
              if (!f && c2)
                return c2(i2, true);
              if (u)
                return u(i2, true);
              var a = new Error("Cannot find module '" + i2 + "'");
              throw a.code = "MODULE_NOT_FOUND", a;
            }
            var p = n[i2] = {exports: {}};
            e[i2][0].call(p.exports, function(r2) {
              var n2 = e[i2][1][r2];
              return o(n2 || r2);
            }, p, p.exports, r, e, n, t);
          }
          return n[i2].exports;
        }
        for (var u = typeof commonjsRequire == "function" && commonjsRequire, i = 0; i < t.length; i++)
          o(t[i]);
        return o;
      }
      return r;
    }()({1: [function(_dereq_, module2, exports2) {
      var inherits = _dereq_("inherits");
      var Multimath = _dereq_("multimath");
      var mm_unsharp_mask = _dereq_("./mm_unsharp_mask");
      var mm_resize = _dereq_("./mm_resize");
      function MathLib(requested_features) {
        var __requested_features = requested_features || [];
        var features = {
          js: __requested_features.indexOf("js") >= 0,
          wasm: __requested_features.indexOf("wasm") >= 0
        };
        Multimath.call(this, features);
        this.features = {
          js: features.js,
          wasm: features.wasm && this.has_wasm()
        };
        this.use(mm_unsharp_mask);
        this.use(mm_resize);
      }
      inherits(MathLib, Multimath);
      MathLib.prototype.resizeAndUnsharp = function resizeAndUnsharp(options, cache) {
        var result = this.resize(options, cache);
        if (options.unsharpAmount) {
          this.unsharp_mask(result, options.toWidth, options.toHeight, options.unsharpAmount, options.unsharpRadius, options.unsharpThreshold);
        }
        return result;
      };
      module2.exports = MathLib;
    }, {"./mm_resize": 4, "./mm_unsharp_mask": 9, inherits: 19, multimath: 20}], 2: [function(_dereq_, module2, exports2) {
      function clampTo8(i) {
        return i < 0 ? 0 : i > 255 ? 255 : i;
      }
      function convolveHorizontally(src, dest, srcW, srcH, destW, filters) {
        var r, g, b, a;
        var filterPtr, filterShift, filterSize;
        var srcPtr, srcY, destX, filterVal;
        var srcOffset = 0, destOffset = 0;
        for (srcY = 0; srcY < srcH; srcY++) {
          filterPtr = 0;
          for (destX = 0; destX < destW; destX++) {
            filterShift = filters[filterPtr++];
            filterSize = filters[filterPtr++];
            srcPtr = srcOffset + filterShift * 4 | 0;
            r = g = b = a = 0;
            for (; filterSize > 0; filterSize--) {
              filterVal = filters[filterPtr++];
              a = a + filterVal * src[srcPtr + 3] | 0;
              b = b + filterVal * src[srcPtr + 2] | 0;
              g = g + filterVal * src[srcPtr + 1] | 0;
              r = r + filterVal * src[srcPtr] | 0;
              srcPtr = srcPtr + 4 | 0;
            }
            dest[destOffset + 3] = clampTo8(a + (1 << 13) >> 14);
            dest[destOffset + 2] = clampTo8(b + (1 << 13) >> 14);
            dest[destOffset + 1] = clampTo8(g + (1 << 13) >> 14);
            dest[destOffset] = clampTo8(r + (1 << 13) >> 14);
            destOffset = destOffset + srcH * 4 | 0;
          }
          destOffset = (srcY + 1) * 4 | 0;
          srcOffset = (srcY + 1) * srcW * 4 | 0;
        }
      }
      function convolveVertically(src, dest, srcW, srcH, destW, filters) {
        var r, g, b, a;
        var filterPtr, filterShift, filterSize;
        var srcPtr, srcY, destX, filterVal;
        var srcOffset = 0, destOffset = 0;
        for (srcY = 0; srcY < srcH; srcY++) {
          filterPtr = 0;
          for (destX = 0; destX < destW; destX++) {
            filterShift = filters[filterPtr++];
            filterSize = filters[filterPtr++];
            srcPtr = srcOffset + filterShift * 4 | 0;
            r = g = b = a = 0;
            for (; filterSize > 0; filterSize--) {
              filterVal = filters[filterPtr++];
              a = a + filterVal * src[srcPtr + 3] | 0;
              b = b + filterVal * src[srcPtr + 2] | 0;
              g = g + filterVal * src[srcPtr + 1] | 0;
              r = r + filterVal * src[srcPtr] | 0;
              srcPtr = srcPtr + 4 | 0;
            }
            dest[destOffset + 3] = clampTo8(a + (1 << 13) >> 14);
            dest[destOffset + 2] = clampTo8(b + (1 << 13) >> 14);
            dest[destOffset + 1] = clampTo8(g + (1 << 13) >> 14);
            dest[destOffset] = clampTo8(r + (1 << 13) >> 14);
            destOffset = destOffset + srcH * 4 | 0;
          }
          destOffset = (srcY + 1) * 4 | 0;
          srcOffset = (srcY + 1) * srcW * 4 | 0;
        }
      }
      module2.exports = {
        convolveHorizontally,
        convolveVertically
      };
    }, {}], 3: [function(_dereq_, module2, exports2) {
      module2.exports = "AGFzbQEAAAAADAZkeWxpbmsAAAAAAAEXA2AAAGAGf39/f39/AGAHf39/f39/fwACDwEDZW52Bm1lbW9yeQIAAAMEAwABAgYGAX8AQQALB1cFEV9fd2FzbV9jYWxsX2N0b3JzAAAIY29udm9sdmUAAQpjb252b2x2ZUhWAAIMX19kc29faGFuZGxlAwAYX193YXNtX2FwcGx5X2RhdGFfcmVsb2NzAAAK7AMDAwABC8YDAQ9/AkAgA0UNACAERQ0AA0AgDCENQQAhE0EAIQcDQCAHQQJqIQYCfyAHQQF0IAVqIgcuAQIiFEUEQEGAwAAhCEGAwAAhCUGAwAAhCkGAwAAhCyAGDAELIBIgBy4BAGohCEEAIQsgFCEHQQAhDiAGIQlBACEPQQAhEANAIAUgCUEBdGouAQAiESAAIAhBAnRqKAIAIgpBGHZsIBBqIRAgCkH/AXEgEWwgC2ohCyAKQRB2Qf8BcSARbCAPaiEPIApBCHZB/wFxIBFsIA5qIQ4gCEEBaiEIIAlBAWohCSAHQQFrIgcNAAsgC0GAQGshCCAOQYBAayEJIA9BgEBrIQogEEGAQGshCyAGIBRqCyEHIAEgDUECdGogCUEOdSIGQf8BIAZB/wFIGyIGQQAgBkEAShtBCHRBgP4DcSAKQQ51IgZB/wEgBkH/AUgbIgZBACAGQQBKG0EQdEGAgPwHcSALQQ51IgZB/wEgBkH/AUgbIgZBACAGQQBKG0EYdHJyIAhBDnUiBkH/ASAGQf8BSBsiBkEAIAZBAEobcjYCACADIA1qIQ0gE0EBaiITIARHDQALIAxBAWoiDCACbCESIAMgDEcNAAsLCx4AQQAgAiADIAQgBSAAEAEgAkEAIAQgBSAGIAEQAQs=";
    }, {}], 4: [function(_dereq_, module2, exports2) {
      module2.exports = {
        name: "resize",
        fn: _dereq_("./resize"),
        wasm_fn: _dereq_("./resize_wasm"),
        wasm_src: _dereq_("./convolve_wasm_base64")
      };
    }, {"./convolve_wasm_base64": 3, "./resize": 5, "./resize_wasm": 8}], 5: [function(_dereq_, module2, exports2) {
      var createFilters = _dereq_("./resize_filter_gen");
      var convolveHorizontally = _dereq_("./convolve").convolveHorizontally;
      var convolveVertically = _dereq_("./convolve").convolveVertically;
      function resetAlpha(dst, width, height) {
        var ptr = 3, len2 = width * height * 4 | 0;
        while (ptr < len2) {
          dst[ptr] = 255;
          ptr = ptr + 4 | 0;
        }
      }
      module2.exports = function resize(options) {
        var src = options.src;
        var srcW = options.width;
        var srcH = options.height;
        var destW = options.toWidth;
        var destH = options.toHeight;
        var scaleX = options.scaleX || options.toWidth / options.width;
        var scaleY = options.scaleY || options.toHeight / options.height;
        var offsetX = options.offsetX || 0;
        var offsetY = options.offsetY || 0;
        var dest = options.dest || new Uint8Array(destW * destH * 4);
        var quality = typeof options.quality === "undefined" ? 3 : options.quality;
        var alpha = options.alpha || false;
        var filtersX = createFilters(quality, srcW, destW, scaleX, offsetX), filtersY = createFilters(quality, srcH, destH, scaleY, offsetY);
        var tmp = new Uint8Array(destW * srcH * 4);
        convolveHorizontally(src, tmp, srcW, srcH, destW, filtersX);
        convolveVertically(tmp, dest, srcH, destW, destH, filtersY);
        if (!alpha)
          resetAlpha(dest, destW, destH);
        return dest;
      };
    }, {"./convolve": 2, "./resize_filter_gen": 6}], 6: [function(_dereq_, module2, exports2) {
      var FILTER_INFO = _dereq_("./resize_filter_info");
      var FIXED_FRAC_BITS = 14;
      function toFixedPoint(num) {
        return Math.round(num * ((1 << FIXED_FRAC_BITS) - 1));
      }
      module2.exports = function resizeFilterGen(quality, srcSize, destSize, scale, offset) {
        var filterFunction = FILTER_INFO[quality].filter;
        var scaleInverted = 1 / scale;
        var scaleClamped = Math.min(1, scale);
        var srcWindow = FILTER_INFO[quality].win / scaleClamped;
        var destPixel, srcPixel, srcFirst, srcLast, filterElementSize, floatFilter, fxpFilter, total, pxl, idx, floatVal, filterTotal, filterVal;
        var leftNotEmpty, rightNotEmpty, filterShift, filterSize;
        var maxFilterElementSize = Math.floor((srcWindow + 1) * 2);
        var packedFilter = new Int16Array((maxFilterElementSize + 2) * destSize);
        var packedFilterPtr = 0;
        var slowCopy = !packedFilter.subarray || !packedFilter.set;
        for (destPixel = 0; destPixel < destSize; destPixel++) {
          srcPixel = (destPixel + 0.5) * scaleInverted + offset;
          srcFirst = Math.max(0, Math.floor(srcPixel - srcWindow));
          srcLast = Math.min(srcSize - 1, Math.ceil(srcPixel + srcWindow));
          filterElementSize = srcLast - srcFirst + 1;
          floatFilter = new Float32Array(filterElementSize);
          fxpFilter = new Int16Array(filterElementSize);
          total = 0;
          for (pxl = srcFirst, idx = 0; pxl <= srcLast; pxl++, idx++) {
            floatVal = filterFunction((pxl + 0.5 - srcPixel) * scaleClamped);
            total += floatVal;
            floatFilter[idx] = floatVal;
          }
          filterTotal = 0;
          for (idx = 0; idx < floatFilter.length; idx++) {
            filterVal = floatFilter[idx] / total;
            filterTotal += filterVal;
            fxpFilter[idx] = toFixedPoint(filterVal);
          }
          fxpFilter[destSize >> 1] += toFixedPoint(1 - filterTotal);
          leftNotEmpty = 0;
          while (leftNotEmpty < fxpFilter.length && fxpFilter[leftNotEmpty] === 0) {
            leftNotEmpty++;
          }
          if (leftNotEmpty < fxpFilter.length) {
            rightNotEmpty = fxpFilter.length - 1;
            while (rightNotEmpty > 0 && fxpFilter[rightNotEmpty] === 0) {
              rightNotEmpty--;
            }
            filterShift = srcFirst + leftNotEmpty;
            filterSize = rightNotEmpty - leftNotEmpty + 1;
            packedFilter[packedFilterPtr++] = filterShift;
            packedFilter[packedFilterPtr++] = filterSize;
            if (!slowCopy) {
              packedFilter.set(fxpFilter.subarray(leftNotEmpty, rightNotEmpty + 1), packedFilterPtr);
              packedFilterPtr += filterSize;
            } else {
              for (idx = leftNotEmpty; idx <= rightNotEmpty; idx++) {
                packedFilter[packedFilterPtr++] = fxpFilter[idx];
              }
            }
          } else {
            packedFilter[packedFilterPtr++] = 0;
            packedFilter[packedFilterPtr++] = 0;
          }
        }
        return packedFilter;
      };
    }, {"./resize_filter_info": 7}], 7: [function(_dereq_, module2, exports2) {
      module2.exports = [{
        win: 0.5,
        filter: function filter2(x) {
          return x >= -0.5 && x < 0.5 ? 1 : 0;
        }
      }, {
        win: 1,
        filter: function filter2(x) {
          if (x <= -1 || x >= 1) {
            return 0;
          }
          if (x > -11920929e-14 && x < 11920929e-14) {
            return 1;
          }
          var xpi = x * Math.PI;
          return Math.sin(xpi) / xpi * (0.54 + 0.46 * Math.cos(xpi / 1));
        }
      }, {
        win: 2,
        filter: function filter2(x) {
          if (x <= -2 || x >= 2) {
            return 0;
          }
          if (x > -11920929e-14 && x < 11920929e-14) {
            return 1;
          }
          var xpi = x * Math.PI;
          return Math.sin(xpi) / xpi * Math.sin(xpi / 2) / (xpi / 2);
        }
      }, {
        win: 3,
        filter: function filter2(x) {
          if (x <= -3 || x >= 3) {
            return 0;
          }
          if (x > -11920929e-14 && x < 11920929e-14) {
            return 1;
          }
          var xpi = x * Math.PI;
          return Math.sin(xpi) / xpi * Math.sin(xpi / 3) / (xpi / 3);
        }
      }];
    }, {}], 8: [function(_dereq_, module2, exports2) {
      var createFilters = _dereq_("./resize_filter_gen");
      function resetAlpha(dst, width, height) {
        var ptr = 3, len2 = width * height * 4 | 0;
        while (ptr < len2) {
          dst[ptr] = 255;
          ptr = ptr + 4 | 0;
        }
      }
      function asUint8Array(src) {
        return new Uint8Array(src.buffer, 0, src.byteLength);
      }
      var IS_LE = true;
      try {
        IS_LE = new Uint32Array(new Uint8Array([1, 0, 0, 0]).buffer)[0] === 1;
      } catch (__) {
      }
      function copyInt16asLE(src, target, target_offset) {
        if (IS_LE) {
          target.set(asUint8Array(src), target_offset);
          return;
        }
        for (var ptr = target_offset, i = 0; i < src.length; i++) {
          var data = src[i];
          target[ptr++] = data & 255;
          target[ptr++] = data >> 8 & 255;
        }
      }
      module2.exports = function resize_wasm(options) {
        var src = options.src;
        var srcW = options.width;
        var srcH = options.height;
        var destW = options.toWidth;
        var destH = options.toHeight;
        var scaleX = options.scaleX || options.toWidth / options.width;
        var scaleY = options.scaleY || options.toHeight / options.height;
        var offsetX = options.offsetX || 0;
        var offsetY = options.offsetY || 0;
        var dest = options.dest || new Uint8Array(destW * destH * 4);
        var quality = typeof options.quality === "undefined" ? 3 : options.quality;
        var alpha = options.alpha || false;
        var filtersX = createFilters(quality, srcW, destW, scaleX, offsetX), filtersY = createFilters(quality, srcH, destH, scaleY, offsetY);
        var src_offset = 0;
        var tmp_offset = this.__align(src_offset + Math.max(src.byteLength, dest.byteLength));
        var filtersX_offset = this.__align(tmp_offset + srcH * destW * 4);
        var filtersY_offset = this.__align(filtersX_offset + filtersX.byteLength);
        var alloc_bytes = filtersY_offset + filtersY.byteLength;
        var instance = this.__instance("resize", alloc_bytes);
        var mem = new Uint8Array(this.__memory.buffer);
        var mem32 = new Uint32Array(this.__memory.buffer);
        var src32 = new Uint32Array(src.buffer);
        mem32.set(src32);
        copyInt16asLE(filtersX, mem, filtersX_offset);
        copyInt16asLE(filtersY, mem, filtersY_offset);
        var fn = instance.exports.convolveHV || instance.exports._convolveHV;
        fn(filtersX_offset, filtersY_offset, tmp_offset, srcW, srcH, destW, destH);
        var dest32 = new Uint32Array(dest.buffer);
        dest32.set(new Uint32Array(this.__memory.buffer, 0, destH * destW));
        if (!alpha)
          resetAlpha(dest, destW, destH);
        return dest;
      };
    }, {"./resize_filter_gen": 6}], 9: [function(_dereq_, module2, exports2) {
      module2.exports = {
        name: "unsharp_mask",
        fn: _dereq_("./unsharp_mask"),
        wasm_fn: _dereq_("./unsharp_mask_wasm"),
        wasm_src: _dereq_("./unsharp_mask_wasm_base64")
      };
    }, {"./unsharp_mask": 10, "./unsharp_mask_wasm": 11, "./unsharp_mask_wasm_base64": 12}], 10: [function(_dereq_, module2, exports2) {
      var glur_mono16 = _dereq_("glur/mono16");
      function hsv_v16(img, width, height) {
        var size = width * height;
        var out = new Uint16Array(size);
        var r, g, b, max2;
        for (var i = 0; i < size; i++) {
          r = img[4 * i];
          g = img[4 * i + 1];
          b = img[4 * i + 2];
          max2 = r >= g && r >= b ? r : g >= b && g >= r ? g : b;
          out[i] = max2 << 8;
        }
        return out;
      }
      module2.exports = function unsharp(img, width, height, amount, radius, threshold) {
        var v1, v2, vmul;
        var diff, iTimes4;
        if (amount === 0 || radius < 0.5) {
          return;
        }
        if (radius > 2) {
          radius = 2;
        }
        var brightness = hsv_v16(img, width, height);
        var blured = new Uint16Array(brightness);
        glur_mono16(blured, width, height, radius);
        var amountFp = amount / 100 * 4096 + 0.5 | 0;
        var thresholdFp = threshold << 8;
        var size = width * height;
        for (var i = 0; i < size; i++) {
          v1 = brightness[i];
          diff = v1 - blured[i];
          if (Math.abs(diff) >= thresholdFp) {
            v2 = v1 + (amountFp * diff + 2048 >> 12);
            v2 = v2 > 65280 ? 65280 : v2;
            v2 = v2 < 0 ? 0 : v2;
            v1 = v1 !== 0 ? v1 : 1;
            vmul = (v2 << 12) / v1 | 0;
            iTimes4 = i * 4;
            img[iTimes4] = img[iTimes4] * vmul + 2048 >> 12;
            img[iTimes4 + 1] = img[iTimes4 + 1] * vmul + 2048 >> 12;
            img[iTimes4 + 2] = img[iTimes4 + 2] * vmul + 2048 >> 12;
          }
        }
      };
    }, {"glur/mono16": 18}], 11: [function(_dereq_, module2, exports2) {
      module2.exports = function unsharp(img, width, height, amount, radius, threshold) {
        if (amount === 0 || radius < 0.5) {
          return;
        }
        if (radius > 2) {
          radius = 2;
        }
        var pixels = width * height;
        var img_bytes_cnt = pixels * 4;
        var hsv_bytes_cnt = pixels * 2;
        var blur_bytes_cnt = pixels * 2;
        var blur_line_byte_cnt = Math.max(width, height) * 4;
        var blur_coeffs_byte_cnt = 8 * 4;
        var img_offset = 0;
        var hsv_offset = img_bytes_cnt;
        var blur_offset = hsv_offset + hsv_bytes_cnt;
        var blur_tmp_offset = blur_offset + blur_bytes_cnt;
        var blur_line_offset = blur_tmp_offset + blur_bytes_cnt;
        var blur_coeffs_offset = blur_line_offset + blur_line_byte_cnt;
        var instance = this.__instance("unsharp_mask", img_bytes_cnt + hsv_bytes_cnt + blur_bytes_cnt * 2 + blur_line_byte_cnt + blur_coeffs_byte_cnt, {
          exp: Math.exp
        });
        var img32 = new Uint32Array(img.buffer);
        var mem32 = new Uint32Array(this.__memory.buffer);
        mem32.set(img32);
        var fn = instance.exports.hsv_v16 || instance.exports._hsv_v16;
        fn(img_offset, hsv_offset, width, height);
        fn = instance.exports.blurMono16 || instance.exports._blurMono16;
        fn(hsv_offset, blur_offset, blur_tmp_offset, blur_line_offset, blur_coeffs_offset, width, height, radius);
        fn = instance.exports.unsharp || instance.exports._unsharp;
        fn(img_offset, img_offset, hsv_offset, blur_offset, width, height, amount, threshold);
        img32.set(new Uint32Array(this.__memory.buffer, 0, pixels));
      };
    }, {}], 12: [function(_dereq_, module2, exports2) {
      module2.exports = "AGFzbQEAAAAADAZkeWxpbmsAAAAAAAE0B2AAAGAEf39/fwBgBn9/f39/fwBgCH9/f39/f39/AGAIf39/f39/f30AYAJ9fwBgAXwBfAIZAgNlbnYDZXhwAAYDZW52Bm1lbW9yeQIAAAMHBgAFAgQBAwYGAX8AQQALB4oBCBFfX3dhc21fY2FsbF9jdG9ycwABFl9fYnVpbGRfZ2F1c3NpYW5fY29lZnMAAg5fX2dhdXNzMTZfbGluZQADCmJsdXJNb25vMTYABAdoc3ZfdjE2AAUHdW5zaGFycAAGDF9fZHNvX2hhbmRsZQMAGF9fd2FzbV9hcHBseV9kYXRhX3JlbG9jcwABCsUMBgMAAQvWAQEHfCABRNuGukOCGvs/IAC7oyICRAAAAAAAAADAohAAIgW2jDgCFCABIAKaEAAiAyADoCIGtjgCECABRAAAAAAAAPA/IAOhIgQgBKIgAyACIAKgokQAAAAAAADwP6AgBaGjIgS2OAIAIAEgBSAEmqIiB7Y4AgwgASADIAJEAAAAAAAA8D+gIASioiIItjgCCCABIAMgAkQAAAAAAADwv6AgBKKiIgK2OAIEIAEgByAIoCAFRAAAAAAAAPA/IAahoCIDo7Y4AhwgASAEIAKgIAOjtjgCGAuGBQMGfwl8An0gAyoCDCEVIAMqAgghFiADKgIUuyERIAMqAhC7IRACQCAEQQFrIghBAEgiCQRAIAIhByAAIQYMAQsgAiAALwEAuCIPIAMqAhi7oiIMIBGiIg0gDCAQoiAPIAMqAgS7IhOiIhQgAyoCALsiEiAPoqCgoCIOtjgCACACQQRqIQcgAEECaiEGIAhFDQAgCEEBIAhBAUgbIgpBf3MhCwJ/IAQgCmtBAXFFBEAgDiENIAgMAQsgAiANIA4gEKIgFCASIAAvAQK4Ig+ioKCgIg22OAIEIAJBCGohByAAQQRqIQYgDiEMIARBAmsLIQIgC0EAIARrRg0AA0AgByAMIBGiIA0gEKIgDyAToiASIAYvAQC4Ig6ioKCgIgy2OAIAIAcgDSARoiAMIBCiIA4gE6IgEiAGLwECuCIPoqCgoCINtjgCBCAHQQhqIQcgBkEEaiEGIAJBAkohACACQQJrIQIgAA0ACwsCQCAJDQAgASAFIAhsQQF0aiIAAn8gBkECay8BACICuCINIBW7IhKiIA0gFrsiE6KgIA0gAyoCHLuiIgwgEKKgIAwgEaKgIg8gB0EEayIHKgIAu6AiDkQAAAAAAADwQWMgDkQAAAAAAAAAAGZxBEAgDqsMAQtBAAs7AQAgCEUNACAGQQRrIQZBACAFa0EBdCEBA0ACfyANIBKiIAJB//8DcbgiDSAToqAgDyIOIBCioCAMIBGioCIPIAdBBGsiByoCALugIgxEAAAAAAAA8EFjIAxEAAAAAAAAAABmcQRAIAyrDAELQQALIQMgBi8BACECIAAgAWoiACADOwEAIAZBAmshBiAIQQFKIQMgDiEMIAhBAWshCCADDQALCwvRAgIBfwd8AkAgB0MAAAAAWw0AIARE24a6Q4Ia+z8gB0MAAAA/l7ujIglEAAAAAAAAAMCiEAAiDLaMOAIUIAQgCZoQACIKIAqgIg22OAIQIAREAAAAAAAA8D8gCqEiCyALoiAKIAkgCaCiRAAAAAAAAPA/oCAMoaMiC7Y4AgAgBCAMIAuaoiIOtjgCDCAEIAogCUQAAAAAAADwP6AgC6KiIg+2OAIIIAQgCiAJRAAAAAAAAPC/oCALoqIiCbY4AgQgBCAOIA+gIAxEAAAAAAAA8D8gDaGgIgqjtjgCHCAEIAsgCaAgCqO2OAIYIAYEQANAIAAgBSAIbEEBdGogAiAIQQF0aiADIAQgBSAGEAMgCEEBaiIIIAZHDQALCyAFRQ0AQQAhCANAIAIgBiAIbEEBdGogASAIQQF0aiADIAQgBiAFEAMgCEEBaiIIIAVHDQALCwtxAQN/IAIgA2wiBQRAA0AgASAAKAIAIgRBEHZB/wFxIgIgAiAEQQh2Qf8BcSIDIAMgBEH/AXEiBEkbIAIgA0sbIgYgBiAEIAIgBEsbIAMgBEsbQQh0OwEAIAFBAmohASAAQQRqIQAgBUEBayIFDQALCwuZAgIDfwF8IAQgBWwhBAJ/IAazQwAAgEWUQwAAyEKVu0QAAAAAAADgP6AiC5lEAAAAAAAA4EFjBEAgC6oMAQtBgICAgHgLIQUgBARAIAdBCHQhCUEAIQYDQCAJIAIgBkEBdCIHai8BACIBIAMgB2ovAQBrIgcgB0EfdSIIaiAIc00EQCAAIAZBAnQiCGoiCiAFIAdsQYAQakEMdSABaiIHQYD+AyAHQYD+A0gbIgdBACAHQQBKG0EMdCABQQEgARtuIgEgCi0AAGxBgBBqQQx2OgAAIAAgCEEBcmoiByABIActAABsQYAQakEMdjoAACAAIAhBAnJqIgcgASAHLQAAbEGAEGpBDHY6AAALIAZBAWoiBiAERw0ACwsL";
    }, {}], 13: [function(_dereq_, module2, exports2) {
      var GC_INTERVAL = 100;
      function Pool(create2, idle) {
        this.create = create2;
        this.available = [];
        this.acquired = {};
        this.lastId = 1;
        this.timeoutId = 0;
        this.idle = idle || 2e3;
      }
      Pool.prototype.acquire = function() {
        var _this = this;
        var resource;
        if (this.available.length !== 0) {
          resource = this.available.pop();
        } else {
          resource = this.create();
          resource.id = this.lastId++;
          resource.release = function() {
            return _this.release(resource);
          };
        }
        this.acquired[resource.id] = resource;
        return resource;
      };
      Pool.prototype.release = function(resource) {
        var _this2 = this;
        delete this.acquired[resource.id];
        resource.lastUsed = Date.now();
        this.available.push(resource);
        if (this.timeoutId === 0) {
          this.timeoutId = setTimeout(function() {
            return _this2.gc();
          }, GC_INTERVAL);
        }
      };
      Pool.prototype.gc = function() {
        var _this3 = this;
        var now2 = Date.now();
        this.available = this.available.filter(function(resource) {
          if (now2 - resource.lastUsed > _this3.idle) {
            resource.destroy();
            return false;
          }
          return true;
        });
        if (this.available.length !== 0) {
          this.timeoutId = setTimeout(function() {
            return _this3.gc();
          }, GC_INTERVAL);
        } else {
          this.timeoutId = 0;
        }
      };
      module2.exports = Pool;
    }, {}], 14: [function(_dereq_, module2, exports2) {
      var MIN_INNER_TILE_SIZE = 2;
      module2.exports = function createStages(fromWidth, fromHeight, toWidth, toHeight, srcTileSize, destTileBorder) {
        var scaleX = toWidth / fromWidth;
        var scaleY = toHeight / fromHeight;
        var minScale = (2 * destTileBorder + MIN_INNER_TILE_SIZE + 1) / srcTileSize;
        if (minScale > 0.5)
          return [[toWidth, toHeight]];
        var stageCount = Math.ceil(Math.log(Math.min(scaleX, scaleY)) / Math.log(minScale));
        if (stageCount <= 1)
          return [[toWidth, toHeight]];
        var result = [];
        for (var i = 0; i < stageCount; i++) {
          var width = Math.round(Math.pow(Math.pow(fromWidth, stageCount - i - 1) * Math.pow(toWidth, i + 1), 1 / stageCount));
          var height = Math.round(Math.pow(Math.pow(fromHeight, stageCount - i - 1) * Math.pow(toHeight, i + 1), 1 / stageCount));
          result.push([width, height]);
        }
        return result;
      };
    }, {}], 15: [function(_dereq_, module2, exports2) {
      var PIXEL_EPSILON = 1e-5;
      function pixelFloor(x) {
        var nearest = Math.round(x);
        if (Math.abs(x - nearest) < PIXEL_EPSILON) {
          return nearest;
        }
        return Math.floor(x);
      }
      function pixelCeil(x) {
        var nearest = Math.round(x);
        if (Math.abs(x - nearest) < PIXEL_EPSILON) {
          return nearest;
        }
        return Math.ceil(x);
      }
      module2.exports = function createRegions(options) {
        var scaleX = options.toWidth / options.width;
        var scaleY = options.toHeight / options.height;
        var innerTileWidth = pixelFloor(options.srcTileSize * scaleX) - 2 * options.destTileBorder;
        var innerTileHeight = pixelFloor(options.srcTileSize * scaleY) - 2 * options.destTileBorder;
        if (innerTileWidth < 1 || innerTileHeight < 1) {
          throw new Error("Internal error in pica: target tile width/height is too small.");
        }
        var x, y;
        var innerX, innerY, toTileWidth, toTileHeight;
        var tiles = [];
        var tile;
        for (innerY = 0; innerY < options.toHeight; innerY += innerTileHeight) {
          for (innerX = 0; innerX < options.toWidth; innerX += innerTileWidth) {
            x = innerX - options.destTileBorder;
            if (x < 0) {
              x = 0;
            }
            toTileWidth = innerX + innerTileWidth + options.destTileBorder - x;
            if (x + toTileWidth >= options.toWidth) {
              toTileWidth = options.toWidth - x;
            }
            y = innerY - options.destTileBorder;
            if (y < 0) {
              y = 0;
            }
            toTileHeight = innerY + innerTileHeight + options.destTileBorder - y;
            if (y + toTileHeight >= options.toHeight) {
              toTileHeight = options.toHeight - y;
            }
            tile = {
              toX: x,
              toY: y,
              toWidth: toTileWidth,
              toHeight: toTileHeight,
              toInnerX: innerX,
              toInnerY: innerY,
              toInnerWidth: innerTileWidth,
              toInnerHeight: innerTileHeight,
              offsetX: x / scaleX - pixelFloor(x / scaleX),
              offsetY: y / scaleY - pixelFloor(y / scaleY),
              scaleX,
              scaleY,
              x: pixelFloor(x / scaleX),
              y: pixelFloor(y / scaleY),
              width: pixelCeil(toTileWidth / scaleX),
              height: pixelCeil(toTileHeight / scaleY)
            };
            tiles.push(tile);
          }
        }
        return tiles;
      };
    }, {}], 16: [function(_dereq_, module2, exports2) {
      function objClass(obj) {
        return Object.prototype.toString.call(obj);
      }
      module2.exports.isCanvas = function isCanvas(element) {
        var cname = objClass(element);
        return cname === "[object HTMLCanvasElement]" || cname === "[object OffscreenCanvas]" || cname === "[object Canvas]";
      };
      module2.exports.isImage = function isImage(element) {
        return objClass(element) === "[object HTMLImageElement]";
      };
      module2.exports.isImageBitmap = function isImageBitmap(element) {
        return objClass(element) === "[object ImageBitmap]";
      };
      module2.exports.limiter = function limiter(concurrency) {
        var active = 0, queue = [];
        function roll() {
          if (active < concurrency && queue.length) {
            active++;
            queue.shift()();
          }
        }
        return function limit(fn) {
          return new Promise(function(resolve, reject) {
            queue.push(function() {
              fn().then(function(result) {
                resolve(result);
                active--;
                roll();
              }, function(err) {
                reject(err);
                active--;
                roll();
              });
            });
            roll();
          });
        };
      };
      module2.exports.cib_quality_name = function cib_quality_name(num) {
        switch (num) {
          case 0:
            return "pixelated";
          case 1:
            return "low";
          case 2:
            return "medium";
        }
        return "high";
      };
      module2.exports.cib_support = function cib_support(createCanvas) {
        return Promise.resolve().then(function() {
          if (typeof createImageBitmap === "undefined") {
            return false;
          }
          var c2 = createCanvas(100, 100);
          return createImageBitmap(c2, 0, 0, 100, 100, {
            resizeWidth: 10,
            resizeHeight: 10,
            resizeQuality: "high"
          }).then(function(bitmap) {
            var status = bitmap.width === 10;
            bitmap.close();
            c2 = null;
            return status;
          });
        })["catch"](function() {
          return false;
        });
      };
      module2.exports.worker_offscreen_canvas_support = function worker_offscreen_canvas_support() {
        return new Promise(function(resolve, reject) {
          if (typeof OffscreenCanvas === "undefined") {
            resolve(false);
            return;
          }
          function workerPayload(self2) {
            if (typeof createImageBitmap === "undefined") {
              self2.postMessage(false);
              return;
            }
            Promise.resolve().then(function() {
              var canvas = new OffscreenCanvas(10, 10);
              var ctx = canvas.getContext("2d");
              ctx.rect(0, 0, 1, 1);
              return createImageBitmap(canvas, 0, 0, 1, 1);
            }).then(function() {
              return self2.postMessage(true);
            }, function() {
              return self2.postMessage(false);
            });
          }
          var code = btoa("(".concat(workerPayload.toString(), ")(self);"));
          var w = new Worker("data:text/javascript;base64,".concat(code));
          w.onmessage = function(ev) {
            return resolve(ev.data);
          };
          w.onerror = reject;
        }).then(function(result) {
          return result;
        }, function() {
          return false;
        });
      };
      module2.exports.can_use_canvas = function can_use_canvas(createCanvas) {
        var usable = false;
        try {
          var canvas = createCanvas(2, 1);
          var ctx = canvas.getContext("2d");
          var d = ctx.createImageData(2, 1);
          d.data[0] = 12;
          d.data[1] = 23;
          d.data[2] = 34;
          d.data[3] = 255;
          d.data[4] = 45;
          d.data[5] = 56;
          d.data[6] = 67;
          d.data[7] = 255;
          ctx.putImageData(d, 0, 0);
          d = null;
          d = ctx.getImageData(0, 0, 2, 1);
          if (d.data[0] === 12 && d.data[1] === 23 && d.data[2] === 34 && d.data[3] === 255 && d.data[4] === 45 && d.data[5] === 56 && d.data[6] === 67 && d.data[7] === 255) {
            usable = true;
          }
        } catch (err) {
        }
        return usable;
      };
      module2.exports.cib_can_use_region = function cib_can_use_region() {
        return new Promise(function(resolve) {
          if (typeof createImageBitmap === "undefined") {
            resolve(false);
            return;
          }
          var image = new Image();
          image.src = "data:image/jpeg;base64,/9j/4QBiRXhpZgAATU0AKgAAAAgABQESAAMAAAABAAYAAAEaAAUAAAABAAAASgEbAAUAAAABAAAAUgEoAAMAAAABAAIAAAITAAMAAAABAAEAAAAAAAAAAABIAAAAAQAAAEgAAAAB/9sAQwAEAwMEAwMEBAMEBQQEBQYKBwYGBgYNCQoICg8NEBAPDQ8OERMYFBESFxIODxUcFRcZGRsbGxAUHR8dGh8YGhsa/9sAQwEEBQUGBQYMBwcMGhEPERoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoa/8IAEQgAAQACAwERAAIRAQMRAf/EABQAAQAAAAAAAAAAAAAAAAAAAAf/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF/P//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQH//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Qf//Z";
          image.onload = function() {
            createImageBitmap(image, 0, 0, image.width, image.height).then(function(bitmap) {
              if (bitmap.width === image.width && bitmap.height === image.height) {
                resolve(true);
              } else {
                resolve(false);
              }
            }, function() {
              return resolve(false);
            });
          };
          image.onerror = function() {
            return resolve(false);
          };
        });
      };
    }, {}], 17: [function(_dereq_, module2, exports2) {
      module2.exports = function() {
        var MathLib = _dereq_("./mathlib");
        var mathLib;
        onmessage = function onmessage2(ev) {
          var tileOpts = ev.data.opts;
          var returnBitmap = false;
          if (!tileOpts.src && tileOpts.srcBitmap) {
            var canvas = new OffscreenCanvas(tileOpts.width, tileOpts.height);
            var ctx = canvas.getContext("2d", {
              alpha: Boolean(tileOpts.alpha)
            });
            ctx.drawImage(tileOpts.srcBitmap, 0, 0);
            tileOpts.src = ctx.getImageData(0, 0, tileOpts.width, tileOpts.height).data;
            canvas.width = canvas.height = 0;
            canvas = null;
            tileOpts.srcBitmap.close();
            tileOpts.srcBitmap = null;
            returnBitmap = true;
          }
          if (!mathLib)
            mathLib = new MathLib(ev.data.features);
          var data = mathLib.resizeAndUnsharp(tileOpts);
          if (returnBitmap) {
            var toImageData = new ImageData(new Uint8ClampedArray(data), tileOpts.toWidth, tileOpts.toHeight);
            var _canvas = new OffscreenCanvas(tileOpts.toWidth, tileOpts.toHeight);
            var _ctx = _canvas.getContext("2d", {
              alpha: Boolean(tileOpts.alpha)
            });
            _ctx.putImageData(toImageData, 0, 0);
            createImageBitmap(_canvas).then(function(bitmap) {
              postMessage({
                bitmap
              }, [bitmap]);
            });
          } else {
            postMessage({
              data
            }, [data.buffer]);
          }
        };
      };
    }, {"./mathlib": 1}], 18: [function(_dereq_, module2, exports2) {
      var a0, a1, a2, a3, b1, b2, left_corner, right_corner;
      function gaussCoef(sigma) {
        if (sigma < 0.5) {
          sigma = 0.5;
        }
        var a = Math.exp(0.726 * 0.726) / sigma, g1 = Math.exp(-a), g2 = Math.exp(-2 * a), k = (1 - g1) * (1 - g1) / (1 + 2 * a * g1 - g2);
        a0 = k;
        a1 = k * (a - 1) * g1;
        a2 = k * (a + 1) * g1;
        a3 = -k * g2;
        b1 = 2 * g1;
        b2 = -g2;
        left_corner = (a0 + a1) / (1 - b1 - b2);
        right_corner = (a2 + a3) / (1 - b1 - b2);
        return new Float32Array([a0, a1, a2, a3, b1, b2, left_corner, right_corner]);
      }
      function convolveMono16(src, out, line, coeff, width, height) {
        var prev_src, curr_src, curr_out, prev_out, prev_prev_out;
        var src_index, out_index, line_index;
        var i, j;
        var coeff_a0, coeff_a1, coeff_b1, coeff_b2;
        for (i = 0; i < height; i++) {
          src_index = i * width;
          out_index = i;
          line_index = 0;
          prev_src = src[src_index];
          prev_prev_out = prev_src * coeff[6];
          prev_out = prev_prev_out;
          coeff_a0 = coeff[0];
          coeff_a1 = coeff[1];
          coeff_b1 = coeff[4];
          coeff_b2 = coeff[5];
          for (j = 0; j < width; j++) {
            curr_src = src[src_index];
            curr_out = curr_src * coeff_a0 + prev_src * coeff_a1 + prev_out * coeff_b1 + prev_prev_out * coeff_b2;
            prev_prev_out = prev_out;
            prev_out = curr_out;
            prev_src = curr_src;
            line[line_index] = prev_out;
            line_index++;
            src_index++;
          }
          src_index--;
          line_index--;
          out_index += height * (width - 1);
          prev_src = src[src_index];
          prev_prev_out = prev_src * coeff[7];
          prev_out = prev_prev_out;
          curr_src = prev_src;
          coeff_a0 = coeff[2];
          coeff_a1 = coeff[3];
          for (j = width - 1; j >= 0; j--) {
            curr_out = curr_src * coeff_a0 + prev_src * coeff_a1 + prev_out * coeff_b1 + prev_prev_out * coeff_b2;
            prev_prev_out = prev_out;
            prev_out = curr_out;
            prev_src = curr_src;
            curr_src = src[src_index];
            out[out_index] = line[line_index] + prev_out;
            src_index--;
            line_index--;
            out_index -= height;
          }
        }
      }
      function blurMono16(src, width, height, radius) {
        if (!radius) {
          return;
        }
        var out = new Uint16Array(src.length), tmp_line = new Float32Array(Math.max(width, height));
        var coeff = gaussCoef(radius);
        convolveMono16(src, out, tmp_line, coeff, width, height);
        convolveMono16(out, src, tmp_line, coeff, height, width);
      }
      module2.exports = blurMono16;
    }, {}], 19: [function(_dereq_, module2, exports2) {
      if (typeof Object.create === "function") {
        module2.exports = function inherits(ctor, superCtor) {
          if (superCtor) {
            ctor.super_ = superCtor;
            ctor.prototype = Object.create(superCtor.prototype, {
              constructor: {
                value: ctor,
                enumerable: false,
                writable: true,
                configurable: true
              }
            });
          }
        };
      } else {
        module2.exports = function inherits(ctor, superCtor) {
          if (superCtor) {
            ctor.super_ = superCtor;
            var TempCtor = function() {
            };
            TempCtor.prototype = superCtor.prototype;
            ctor.prototype = new TempCtor();
            ctor.prototype.constructor = ctor;
          }
        };
      }
    }, {}], 20: [function(_dereq_, module2, exports2) {
      var assign = _dereq_("object-assign");
      var base64decode = _dereq_("./lib/base64decode");
      var hasWebAssembly = _dereq_("./lib/wa_detect");
      var DEFAULT_OPTIONS = {
        js: true,
        wasm: true
      };
      function MultiMath(options) {
        if (!(this instanceof MultiMath))
          return new MultiMath(options);
        var opts = assign({}, DEFAULT_OPTIONS, options || {});
        this.options = opts;
        this.__cache = {};
        this.__init_promise = null;
        this.__modules = opts.modules || {};
        this.__memory = null;
        this.__wasm = {};
        this.__isLE = new Uint32Array(new Uint8Array([1, 0, 0, 0]).buffer)[0] === 1;
        if (!this.options.js && !this.options.wasm) {
          throw new Error('mathlib: at least "js" or "wasm" should be enabled');
        }
      }
      MultiMath.prototype.has_wasm = hasWebAssembly;
      MultiMath.prototype.use = function(module3) {
        this.__modules[module3.name] = module3;
        if (this.options.wasm && this.has_wasm() && module3.wasm_fn) {
          this[module3.name] = module3.wasm_fn;
        } else {
          this[module3.name] = module3.fn;
        }
        return this;
      };
      MultiMath.prototype.init = function() {
        if (this.__init_promise)
          return this.__init_promise;
        if (!this.options.js && this.options.wasm && !this.has_wasm()) {
          return Promise.reject(new Error(`mathlib: only "wasm" was enabled, but it's not supported`));
        }
        var self2 = this;
        this.__init_promise = Promise.all(Object.keys(self2.__modules).map(function(name) {
          var module3 = self2.__modules[name];
          if (!self2.options.wasm || !self2.has_wasm() || !module3.wasm_fn)
            return null;
          if (self2.__wasm[name])
            return null;
          return WebAssembly.compile(self2.__base64decode(module3.wasm_src)).then(function(m) {
            self2.__wasm[name] = m;
          });
        })).then(function() {
          return self2;
        });
        return this.__init_promise;
      };
      MultiMath.prototype.__base64decode = base64decode;
      MultiMath.prototype.__reallocate = function mem_grow_to(bytes) {
        if (!this.__memory) {
          this.__memory = new WebAssembly.Memory({
            initial: Math.ceil(bytes / (64 * 1024))
          });
          return this.__memory;
        }
        var mem_size = this.__memory.buffer.byteLength;
        if (mem_size < bytes) {
          this.__memory.grow(Math.ceil((bytes - mem_size) / (64 * 1024)));
        }
        return this.__memory;
      };
      MultiMath.prototype.__instance = function instance(name, memsize, env_extra) {
        if (memsize)
          this.__reallocate(memsize);
        if (!this.__wasm[name]) {
          var module3 = this.__modules[name];
          this.__wasm[name] = new WebAssembly.Module(this.__base64decode(module3.wasm_src));
        }
        if (!this.__cache[name]) {
          var env_base = {
            memoryBase: 0,
            memory: this.__memory,
            tableBase: 0,
            table: new WebAssembly.Table({initial: 0, element: "anyfunc"})
          };
          this.__cache[name] = new WebAssembly.Instance(this.__wasm[name], {
            env: assign(env_base, env_extra || {})
          });
        }
        return this.__cache[name];
      };
      MultiMath.prototype.__align = function align(number, base) {
        base = base || 8;
        var reminder = number % base;
        return number + (reminder ? base - reminder : 0);
      };
      module2.exports = MultiMath;
    }, {"./lib/base64decode": 21, "./lib/wa_detect": 22, "object-assign": 23}], 21: [function(_dereq_, module2, exports2) {
      var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      module2.exports = function base64decode(str) {
        var input = str.replace(/[\r\n=]/g, ""), max2 = input.length;
        var out = new Uint8Array(max2 * 3 >> 2);
        var bits = 0;
        var ptr = 0;
        for (var idx = 0; idx < max2; idx++) {
          if (idx % 4 === 0 && idx) {
            out[ptr++] = bits >> 16 & 255;
            out[ptr++] = bits >> 8 & 255;
            out[ptr++] = bits & 255;
          }
          bits = bits << 6 | BASE64_MAP.indexOf(input.charAt(idx));
        }
        var tailbits = max2 % 4 * 6;
        if (tailbits === 0) {
          out[ptr++] = bits >> 16 & 255;
          out[ptr++] = bits >> 8 & 255;
          out[ptr++] = bits & 255;
        } else if (tailbits === 18) {
          out[ptr++] = bits >> 10 & 255;
          out[ptr++] = bits >> 2 & 255;
        } else if (tailbits === 12) {
          out[ptr++] = bits >> 4 & 255;
        }
        return out;
      };
    }, {}], 22: [function(_dereq_, module2, exports2) {
      var wa;
      module2.exports = function hasWebAssembly() {
        if (typeof wa !== "undefined")
          return wa;
        wa = false;
        if (typeof WebAssembly === "undefined")
          return wa;
        try {
          var bin = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 6, 1, 96, 1, 127, 1, 127, 3, 2, 1, 0, 5, 3, 1, 0, 1, 7, 8, 1, 4, 116, 101, 115, 116, 0, 0, 10, 16, 1, 14, 0, 32, 0, 65, 1, 54, 2, 0, 32, 0, 40, 2, 0, 11]);
          var module3 = new WebAssembly.Module(bin);
          var instance = new WebAssembly.Instance(module3, {});
          if (instance.exports.test(4) !== 0)
            wa = true;
          return wa;
        } catch (__) {
        }
        return wa;
      };
    }, {}], 23: [function(_dereq_, module2, exports2) {
      var getOwnPropertySymbols = Object.getOwnPropertySymbols;
      var hasOwnProperty = Object.prototype.hasOwnProperty;
      var propIsEnumerable = Object.prototype.propertyIsEnumerable;
      function toObject(val) {
        if (val === null || val === void 0) {
          throw new TypeError("Object.assign cannot be called with null or undefined");
        }
        return Object(val);
      }
      function shouldUseNative() {
        try {
          if (!Object.assign) {
            return false;
          }
          var test1 = new String("abc");
          test1[5] = "de";
          if (Object.getOwnPropertyNames(test1)[0] === "5") {
            return false;
          }
          var test2 = {};
          for (var i = 0; i < 10; i++) {
            test2["_" + String.fromCharCode(i)] = i;
          }
          var order2 = Object.getOwnPropertyNames(test2).map(function(n) {
            return test2[n];
          });
          if (order2.join("") !== "0123456789") {
            return false;
          }
          var test3 = {};
          "abcdefghijklmnopqrst".split("").forEach(function(letter) {
            test3[letter] = letter;
          });
          if (Object.keys(Object.assign({}, test3)).join("") !== "abcdefghijklmnopqrst") {
            return false;
          }
          return true;
        } catch (err) {
          return false;
        }
      }
      module2.exports = shouldUseNative() ? Object.assign : function(target, source) {
        var from;
        var to = toObject(target);
        var symbols;
        for (var s = 1; s < arguments.length; s++) {
          from = Object(arguments[s]);
          for (var key in from) {
            if (hasOwnProperty.call(from, key)) {
              to[key] = from[key];
            }
          }
          if (getOwnPropertySymbols) {
            symbols = getOwnPropertySymbols(from);
            for (var i = 0; i < symbols.length; i++) {
              if (propIsEnumerable.call(from, symbols[i])) {
                to[symbols[i]] = from[symbols[i]];
              }
            }
          }
        }
        return to;
      };
    }, {}], 24: [function(_dereq_, module2, exports2) {
      var bundleFn = arguments[3];
      var sources = arguments[4];
      var cache = arguments[5];
      var stringify = JSON.stringify;
      module2.exports = function(fn, options) {
        var wkey;
        var cacheKeys = Object.keys(cache);
        for (var i = 0, l = cacheKeys.length; i < l; i++) {
          var key = cacheKeys[i];
          var exp = cache[key].exports;
          if (exp === fn || exp && exp.default === fn) {
            wkey = key;
            break;
          }
        }
        if (!wkey) {
          wkey = Math.floor(Math.pow(16, 8) * Math.random()).toString(16);
          var wcache = {};
          for (var i = 0, l = cacheKeys.length; i < l; i++) {
            var key = cacheKeys[i];
            wcache[key] = key;
          }
          sources[wkey] = [
            "function(require,module,exports){" + fn + "(self); }",
            wcache
          ];
        }
        var skey = Math.floor(Math.pow(16, 8) * Math.random()).toString(16);
        var scache = {};
        scache[wkey] = wkey;
        sources[skey] = [
          "function(require,module,exports){var f = require(" + stringify(wkey) + ");(f.default ? f.default : f)(self);}",
          scache
        ];
        var workerSources = {};
        resolveSources(skey);
        function resolveSources(key2) {
          workerSources[key2] = true;
          for (var depPath in sources[key2][1]) {
            var depKey = sources[key2][1][depPath];
            if (!workerSources[depKey]) {
              resolveSources(depKey);
            }
          }
        }
        var src = "(" + bundleFn + ")({" + Object.keys(workerSources).map(function(key2) {
          return stringify(key2) + ":[" + sources[key2][0] + "," + stringify(sources[key2][1]) + "]";
        }).join(",") + "},{},[" + stringify(skey) + "])";
        var URL2 = window.URL || window.webkitURL || window.mozURL || window.msURL;
        var blob = new Blob([src], {type: "text/javascript"});
        if (options && options.bare) {
          return blob;
        }
        var workerUrl = URL2.createObjectURL(blob);
        var worker = new Worker(workerUrl);
        worker.objectURL = workerUrl;
        return worker;
      };
    }, {}], "/index.js": [function(_dereq_, module2, exports2) {
      function _slicedToArray(arr, i) {
        return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest();
      }
      function _nonIterableRest() {
        throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
      }
      function _unsupportedIterableToArray(o, minLen) {
        if (!o)
          return;
        if (typeof o === "string")
          return _arrayLikeToArray(o, minLen);
        var n = Object.prototype.toString.call(o).slice(8, -1);
        if (n === "Object" && o.constructor)
          n = o.constructor.name;
        if (n === "Map" || n === "Set")
          return Array.from(o);
        if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n))
          return _arrayLikeToArray(o, minLen);
      }
      function _arrayLikeToArray(arr, len2) {
        if (len2 == null || len2 > arr.length)
          len2 = arr.length;
        for (var i = 0, arr2 = new Array(len2); i < len2; i++) {
          arr2[i] = arr[i];
        }
        return arr2;
      }
      function _iterableToArrayLimit(arr, i) {
        var _i = arr == null ? null : typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"];
        if (_i == null)
          return;
        var _arr = [];
        var _n = true;
        var _d = false;
        var _s, _e;
        try {
          for (_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true) {
            _arr.push(_s.value);
            if (i && _arr.length === i)
              break;
          }
        } catch (err) {
          _d = true;
          _e = err;
        } finally {
          try {
            if (!_n && _i["return"] != null)
              _i["return"]();
          } finally {
            if (_d)
              throw _e;
          }
        }
        return _arr;
      }
      function _arrayWithHoles(arr) {
        if (Array.isArray(arr))
          return arr;
      }
      var assign = _dereq_("object-assign");
      var webworkify = _dereq_("webworkify");
      var MathLib = _dereq_("./lib/mathlib");
      var Pool = _dereq_("./lib/pool");
      var utils = _dereq_("./lib/utils");
      var worker = _dereq_("./lib/worker");
      var createStages = _dereq_("./lib/stepper");
      var createRegions = _dereq_("./lib/tiler");
      var singletones = {};
      var NEED_SAFARI_FIX = false;
      try {
        if (typeof navigator !== "undefined" && navigator.userAgent) {
          NEED_SAFARI_FIX = navigator.userAgent.indexOf("Safari") >= 0;
        }
      } catch (e) {
      }
      var concurrency = 1;
      if (typeof navigator !== "undefined") {
        concurrency = Math.min(navigator.hardwareConcurrency || 1, 4);
      }
      var DEFAULT_PICA_OPTS = {
        tile: 1024,
        concurrency,
        features: ["js", "wasm", "ww"],
        idle: 2e3,
        createCanvas: function createCanvas(width, height) {
          var tmpCanvas = document.createElement("canvas");
          tmpCanvas.width = width;
          tmpCanvas.height = height;
          return tmpCanvas;
        }
      };
      var DEFAULT_RESIZE_OPTS = {
        quality: 3,
        alpha: false,
        unsharpAmount: 0,
        unsharpRadius: 0,
        unsharpThreshold: 0
      };
      var CAN_NEW_IMAGE_DATA = false;
      var CAN_CREATE_IMAGE_BITMAP = false;
      var CAN_USE_CANVAS_GET_IMAGE_DATA = false;
      var CAN_USE_OFFSCREEN_CANVAS = false;
      var CAN_USE_CIB_REGION_FOR_IMAGE = false;
      function workerFabric() {
        return {
          value: webworkify(worker),
          destroy: function destroy() {
            this.value.terminate();
            if (typeof window !== "undefined") {
              var url = window.URL || window.webkitURL || window.mozURL || window.msURL;
              if (url && url.revokeObjectURL && this.value.objectURL) {
                url.revokeObjectURL(this.value.objectURL);
              }
            }
          }
        };
      }
      function Pica(options) {
        if (!(this instanceof Pica))
          return new Pica(options);
        this.options = assign({}, DEFAULT_PICA_OPTS, options || {});
        var limiter_key = "lk_".concat(this.options.concurrency);
        this.__limit = singletones[limiter_key] || utils.limiter(this.options.concurrency);
        if (!singletones[limiter_key])
          singletones[limiter_key] = this.__limit;
        this.features = {
          js: false,
          wasm: false,
          cib: false,
          ww: false
        };
        this.__workersPool = null;
        this.__requested_features = [];
        this.__mathlib = null;
      }
      Pica.prototype.init = function() {
        var _this = this;
        if (this.__initPromise)
          return this.__initPromise;
        if (typeof ImageData !== "undefined" && typeof Uint8ClampedArray !== "undefined") {
          try {
            new ImageData(new Uint8ClampedArray(400), 10, 10);
            CAN_NEW_IMAGE_DATA = true;
          } catch (__) {
          }
        }
        if (typeof ImageBitmap !== "undefined") {
          if (ImageBitmap.prototype && ImageBitmap.prototype.close) {
            CAN_CREATE_IMAGE_BITMAP = true;
          } else {
            this.debug("ImageBitmap does not support .close(), disabled");
          }
        }
        var features = this.options.features.slice();
        if (features.indexOf("all") >= 0) {
          features = ["cib", "wasm", "js", "ww"];
        }
        this.__requested_features = features;
        this.__mathlib = new MathLib(features);
        if (features.indexOf("ww") >= 0) {
          if (typeof window !== "undefined" && "Worker" in window) {
            try {
              var wkr = _dereq_("webworkify")(function() {
              });
              wkr.terminate();
              this.features.ww = true;
              var wpool_key = "wp_".concat(JSON.stringify(this.options));
              if (singletones[wpool_key]) {
                this.__workersPool = singletones[wpool_key];
              } else {
                this.__workersPool = new Pool(workerFabric, this.options.idle);
                singletones[wpool_key] = this.__workersPool;
              }
            } catch (__) {
            }
          }
        }
        var initMath = this.__mathlib.init().then(function(mathlib) {
          assign(_this.features, mathlib.features);
        });
        var checkCibResize;
        if (!CAN_CREATE_IMAGE_BITMAP) {
          checkCibResize = Promise.resolve(false);
        } else {
          checkCibResize = utils.cib_support(this.options.createCanvas).then(function(status) {
            if (_this.features.cib && features.indexOf("cib") < 0) {
              _this.debug("createImageBitmap() resize supported, but disabled by config");
              return;
            }
            if (features.indexOf("cib") >= 0)
              _this.features.cib = status;
          });
        }
        CAN_USE_CANVAS_GET_IMAGE_DATA = utils.can_use_canvas(this.options.createCanvas);
        var checkOffscreenCanvas;
        if (CAN_CREATE_IMAGE_BITMAP && CAN_NEW_IMAGE_DATA && features.indexOf("ww") !== -1) {
          checkOffscreenCanvas = utils.worker_offscreen_canvas_support();
        } else {
          checkOffscreenCanvas = Promise.resolve(false);
        }
        checkOffscreenCanvas = checkOffscreenCanvas.then(function(result) {
          CAN_USE_OFFSCREEN_CANVAS = result;
        });
        var checkCibRegion = utils.cib_can_use_region().then(function(result) {
          CAN_USE_CIB_REGION_FOR_IMAGE = result;
        });
        this.__initPromise = Promise.all([initMath, checkCibResize, checkOffscreenCanvas, checkCibRegion]).then(function() {
          return _this;
        });
        return this.__initPromise;
      };
      Pica.prototype.__invokeResize = function(tileOpts, opts) {
        var _this2 = this;
        opts.__mathCache = opts.__mathCache || {};
        return Promise.resolve().then(function() {
          if (!_this2.features.ww) {
            return {
              data: _this2.__mathlib.resizeAndUnsharp(tileOpts, opts.__mathCache)
            };
          }
          return new Promise(function(resolve, reject) {
            var w = _this2.__workersPool.acquire();
            if (opts.cancelToken)
              opts.cancelToken["catch"](function(err) {
                return reject(err);
              });
            w.value.onmessage = function(ev) {
              w.release();
              if (ev.data.err)
                reject(ev.data.err);
              else
                resolve(ev.data);
            };
            var transfer = [];
            if (tileOpts.src)
              transfer.push(tileOpts.src.buffer);
            if (tileOpts.srcBitmap)
              transfer.push(tileOpts.srcBitmap);
            w.value.postMessage({
              opts: tileOpts,
              features: _this2.__requested_features,
              preload: {
                wasm_nodule: _this2.__mathlib.__
              }
            }, transfer);
          });
        });
      };
      Pica.prototype.__extractTileData = function(tile, from, opts, stageEnv, extractTo) {
        if (this.features.ww && CAN_USE_OFFSCREEN_CANVAS && (utils.isCanvas(from) || CAN_USE_CIB_REGION_FOR_IMAGE)) {
          this.debug("Create tile for OffscreenCanvas");
          return createImageBitmap(stageEnv.srcImageBitmap || from, tile.x, tile.y, tile.width, tile.height).then(function(bitmap) {
            extractTo.srcBitmap = bitmap;
            return extractTo;
          });
        }
        if (utils.isCanvas(from)) {
          if (!stageEnv.srcCtx)
            stageEnv.srcCtx = from.getContext("2d", {
              alpha: Boolean(opts.alpha)
            });
          this.debug("Get tile pixel data");
          extractTo.src = stageEnv.srcCtx.getImageData(tile.x, tile.y, tile.width, tile.height).data;
          return extractTo;
        }
        this.debug("Draw tile imageBitmap/image to temporary canvas");
        var tmpCanvas = this.options.createCanvas(tile.width, tile.height);
        var tmpCtx = tmpCanvas.getContext("2d", {
          alpha: Boolean(opts.alpha)
        });
        tmpCtx.globalCompositeOperation = "copy";
        tmpCtx.drawImage(stageEnv.srcImageBitmap || from, tile.x, tile.y, tile.width, tile.height, 0, 0, tile.width, tile.height);
        this.debug("Get tile pixel data");
        extractTo.src = tmpCtx.getImageData(0, 0, tile.width, tile.height).data;
        tmpCanvas.width = tmpCanvas.height = 0;
        return extractTo;
      };
      Pica.prototype.__landTileData = function(tile, result, stageEnv) {
        var toImageData;
        this.debug("Convert raw rgba tile result to ImageData");
        if (result.bitmap) {
          stageEnv.toCtx.drawImage(result.bitmap, tile.toX, tile.toY);
          return null;
        }
        if (CAN_NEW_IMAGE_DATA) {
          toImageData = new ImageData(new Uint8ClampedArray(result.data), tile.toWidth, tile.toHeight);
        } else {
          toImageData = stageEnv.toCtx.createImageData(tile.toWidth, tile.toHeight);
          if (toImageData.data.set) {
            toImageData.data.set(result.data);
          } else {
            for (var i = toImageData.data.length - 1; i >= 0; i--) {
              toImageData.data[i] = result.data[i];
            }
          }
        }
        this.debug("Draw tile");
        if (NEED_SAFARI_FIX) {
          stageEnv.toCtx.putImageData(toImageData, tile.toX, tile.toY, tile.toInnerX - tile.toX, tile.toInnerY - tile.toY, tile.toInnerWidth + 1e-5, tile.toInnerHeight + 1e-5);
        } else {
          stageEnv.toCtx.putImageData(toImageData, tile.toX, tile.toY, tile.toInnerX - tile.toX, tile.toInnerY - tile.toY, tile.toInnerWidth, tile.toInnerHeight);
        }
        return null;
      };
      Pica.prototype.__tileAndResize = function(from, to, opts) {
        var _this3 = this;
        var stageEnv = {
          srcCtx: null,
          srcImageBitmap: null,
          isImageBitmapReused: false,
          toCtx: null
        };
        var processTile = function processTile2(tile) {
          return _this3.__limit(function() {
            if (opts.canceled)
              return opts.cancelToken;
            var tileOpts = {
              width: tile.width,
              height: tile.height,
              toWidth: tile.toWidth,
              toHeight: tile.toHeight,
              scaleX: tile.scaleX,
              scaleY: tile.scaleY,
              offsetX: tile.offsetX,
              offsetY: tile.offsetY,
              quality: opts.quality,
              alpha: opts.alpha,
              unsharpAmount: opts.unsharpAmount,
              unsharpRadius: opts.unsharpRadius,
              unsharpThreshold: opts.unsharpThreshold
            };
            _this3.debug("Invoke resize math");
            return Promise.resolve(tileOpts).then(function(tileOpts2) {
              return _this3.__extractTileData(tile, from, opts, stageEnv, tileOpts2);
            }).then(function(tileOpts2) {
              _this3.debug("Invoke resize math");
              return _this3.__invokeResize(tileOpts2, opts);
            }).then(function(result) {
              if (opts.canceled)
                return opts.cancelToken;
              stageEnv.srcImageData = null;
              return _this3.__landTileData(tile, result, stageEnv);
            });
          });
        };
        return Promise.resolve().then(function() {
          stageEnv.toCtx = to.getContext("2d", {
            alpha: Boolean(opts.alpha)
          });
          if (utils.isCanvas(from))
            return null;
          if (utils.isImageBitmap(from)) {
            stageEnv.srcImageBitmap = from;
            stageEnv.isImageBitmapReused = true;
            return null;
          }
          if (utils.isImage(from)) {
            if (!CAN_CREATE_IMAGE_BITMAP)
              return null;
            _this3.debug("Decode image via createImageBitmap");
            return createImageBitmap(from).then(function(imageBitmap) {
              stageEnv.srcImageBitmap = imageBitmap;
            })["catch"](function(e) {
              return null;
            });
          }
          throw new Error('Pica: ".from" should be Image, Canvas or ImageBitmap');
        }).then(function() {
          if (opts.canceled)
            return opts.cancelToken;
          _this3.debug("Calculate tiles");
          var regions = createRegions({
            width: opts.width,
            height: opts.height,
            srcTileSize: _this3.options.tile,
            toWidth: opts.toWidth,
            toHeight: opts.toHeight,
            destTileBorder: opts.__destTileBorder
          });
          var jobs = regions.map(function(tile) {
            return processTile(tile);
          });
          function cleanup(stageEnv2) {
            if (stageEnv2.srcImageBitmap) {
              if (!stageEnv2.isImageBitmapReused)
                stageEnv2.srcImageBitmap.close();
              stageEnv2.srcImageBitmap = null;
            }
          }
          _this3.debug("Process tiles");
          return Promise.all(jobs).then(function() {
            _this3.debug("Finished!");
            cleanup(stageEnv);
            return to;
          }, function(err) {
            cleanup(stageEnv);
            throw err;
          });
        });
      };
      Pica.prototype.__processStages = function(stages, from, to, opts) {
        var _this4 = this;
        if (opts.canceled)
          return opts.cancelToken;
        var _stages$shift = stages.shift(), _stages$shift2 = _slicedToArray(_stages$shift, 2), toWidth = _stages$shift2[0], toHeight = _stages$shift2[1];
        var isLastStage = stages.length === 0;
        opts = assign({}, opts, {
          toWidth,
          toHeight,
          quality: isLastStage ? opts.quality : Math.min(1, opts.quality)
        });
        var tmpCanvas;
        if (!isLastStage) {
          tmpCanvas = this.options.createCanvas(toWidth, toHeight);
        }
        return this.__tileAndResize(from, isLastStage ? to : tmpCanvas, opts).then(function() {
          if (isLastStage)
            return to;
          opts.width = toWidth;
          opts.height = toHeight;
          return _this4.__processStages(stages, tmpCanvas, to, opts);
        }).then(function(res) {
          if (tmpCanvas) {
            tmpCanvas.width = tmpCanvas.height = 0;
          }
          return res;
        });
      };
      Pica.prototype.__resizeViaCreateImageBitmap = function(from, to, opts) {
        var _this5 = this;
        var toCtx = to.getContext("2d", {
          alpha: Boolean(opts.alpha)
        });
        this.debug("Resize via createImageBitmap()");
        return createImageBitmap(from, {
          resizeWidth: opts.toWidth,
          resizeHeight: opts.toHeight,
          resizeQuality: utils.cib_quality_name(opts.quality)
        }).then(function(imageBitmap) {
          if (opts.canceled)
            return opts.cancelToken;
          if (!opts.unsharpAmount) {
            toCtx.drawImage(imageBitmap, 0, 0);
            imageBitmap.close();
            toCtx = null;
            _this5.debug("Finished!");
            return to;
          }
          _this5.debug("Unsharp result");
          var tmpCanvas = _this5.options.createCanvas(opts.toWidth, opts.toHeight);
          var tmpCtx = tmpCanvas.getContext("2d", {
            alpha: Boolean(opts.alpha)
          });
          tmpCtx.drawImage(imageBitmap, 0, 0);
          imageBitmap.close();
          var iData = tmpCtx.getImageData(0, 0, opts.toWidth, opts.toHeight);
          _this5.__mathlib.unsharp_mask(iData.data, opts.toWidth, opts.toHeight, opts.unsharpAmount, opts.unsharpRadius, opts.unsharpThreshold);
          toCtx.putImageData(iData, 0, 0);
          tmpCanvas.width = tmpCanvas.height = 0;
          iData = tmpCtx = tmpCanvas = toCtx = null;
          _this5.debug("Finished!");
          return to;
        });
      };
      Pica.prototype.resize = function(from, to, options) {
        var _this6 = this;
        this.debug("Start resize...");
        var opts = assign({}, DEFAULT_RESIZE_OPTS);
        if (!isNaN(options)) {
          opts = assign(opts, {
            quality: options
          });
        } else if (options) {
          opts = assign(opts, options);
        }
        opts.toWidth = to.width;
        opts.toHeight = to.height;
        opts.width = from.naturalWidth || from.width;
        opts.height = from.naturalHeight || from.height;
        if (to.width === 0 || to.height === 0) {
          return Promise.reject(new Error("Invalid output size: ".concat(to.width, "x").concat(to.height)));
        }
        if (opts.unsharpRadius > 2)
          opts.unsharpRadius = 2;
        opts.canceled = false;
        if (opts.cancelToken) {
          opts.cancelToken = opts.cancelToken.then(function(data) {
            opts.canceled = true;
            throw data;
          }, function(err) {
            opts.canceled = true;
            throw err;
          });
        }
        var DEST_TILE_BORDER = 3;
        opts.__destTileBorder = Math.ceil(Math.max(DEST_TILE_BORDER, 2.5 * opts.unsharpRadius | 0));
        return this.init().then(function() {
          if (opts.canceled)
            return opts.cancelToken;
          if (_this6.features.cib) {
            return _this6.__resizeViaCreateImageBitmap(from, to, opts);
          }
          if (!CAN_USE_CANVAS_GET_IMAGE_DATA) {
            var err = new Error("Pica: cannot use getImageData on canvas, make sure fingerprinting protection isn't enabled");
            err.code = "ERR_GET_IMAGE_DATA";
            throw err;
          }
          var stages = createStages(opts.width, opts.height, opts.toWidth, opts.toHeight, _this6.options.tile, opts.__destTileBorder);
          return _this6.__processStages(stages, from, to, opts);
        });
      };
      Pica.prototype.resizeBuffer = function(options) {
        var _this7 = this;
        var opts = assign({}, DEFAULT_RESIZE_OPTS, options);
        return this.init().then(function() {
          return _this7.__mathlib.resizeAndUnsharp(opts);
        });
      };
      Pica.prototype.toBlob = function(canvas, mimeType, quality) {
        mimeType = mimeType || "image/png";
        return new Promise(function(resolve) {
          if (canvas.toBlob) {
            canvas.toBlob(function(blob) {
              return resolve(blob);
            }, mimeType, quality);
            return;
          }
          if (canvas.convertToBlob) {
            resolve(canvas.convertToBlob({
              type: mimeType,
              quality
            }));
            return;
          }
          var asString = atob(canvas.toDataURL(mimeType, quality).split(",")[1]);
          var len2 = asString.length;
          var asBuffer = new Uint8Array(len2);
          for (var i = 0; i < len2; i++) {
            asBuffer[i] = asString.charCodeAt(i);
          }
          resolve(new Blob([asBuffer], {
            type: mimeType
          }));
        });
      };
      Pica.prototype.debug = function() {
      };
      module2.exports = Pica;
    }, {"./lib/mathlib": 1, "./lib/pool": 13, "./lib/stepper": 14, "./lib/tiler": 15, "./lib/utils": 16, "./lib/worker": 17, "object-assign": 23, webworkify: 24}]}, {}, [])("/index.js");
  });
});
var pica_default = pica;

// build/src/layouts/d3force3dLayoutWorker.js
console.log("IMPORTING");
var workerFunction = function() {
  importScripts("https://cdn.jsdelivr.net/npm/d3-dispatch@3");
  importScripts("https://cdn.jsdelivr.net/npm/d3-quadtree@3");
  importScripts("https://cdn.jsdelivr.net/npm/d3-timer@3");
  importScripts("https://cdn.jsdelivr.net/npm/d3-force@3");
  importScripts("https://unpkg.com/d3-binarytree");
  importScripts("https://unpkg.com/d3-octree");
  importScripts("https://unpkg.com/d3-force-3d");
  "use strict";
  self.onmessage = function(msg) {
    console.log("RECEIVED:", msg.data.type);
    let use2D2 = false;
    if (msg.data.type == "import") {
      console.log("IMPORTING...");
    } else if (msg.data.type == "stop") {
      this.simulation.stop();
    } else if (msg.data.type == "restart") {
      this.simulation.restart();
    } else if (msg.data.type == "init") {
      console.log("INIT");
      let network = msg.data.network;
      if (msg.data.use2D) {
        use2D2 = true;
      }
      let nodes = [];
      let links = [];
      Object.entries(network.nodes).forEach((entry) => {
        let [key, node] = entry;
        node.ID = key;
        node.x = network.positions[node.index * 3 + 0] * 10;
        node.y = network.positions[node.index * 3 + 1] * 10;
        node.z = network.positions[node.index * 3 + 2] * 10;
        node.vz = 0;
        node.index = network.ID2index[key];
        nodes.push(node);
      });
      for (let index = 0; index < network.indexedEdges.length / 2; index++) {
        let edgeFrom = network.indexedEdges[index * 2];
        let edgeTo = network.indexedEdges[index * 2 + 1];
        let edgeObject = {
          source: edgeFrom,
          target: edgeTo
        };
        links.push(edgeObject);
      }
      this.simulation = d3.forceSimulation(nodes).numDimensions(use2D2 ? 2 : 3).force("charge", d3.forceManyBody()).force("link", d3.forceLink(links)).force("center", d3.forceCenter()).velocityDecay(0.05).on("tick", async () => {
        for (let vertexIndex = 0; vertexIndex < nodes.length; vertexIndex++) {
          const node = nodes[vertexIndex];
          network.positions[vertexIndex * 3 + 0] = node.x / 10;
          network.positions[vertexIndex * 3 + 1] = node.y / 10;
          if (!use2D2) {
            network.positions[vertexIndex * 3 + 2] = node.z / 10;
          } else {
            network.positions[vertexIndex * 3 + 2] = 0;
          }
        }
        self.postMessage({type: "layoutStep", positions: network.positions});
      });
    }
  };
};
var workerFunctionString = workerFunction.toString();
console.log(workerFunctionString);
var workerURL = URL.createObjectURL(new Blob([`(${workerFunctionString})()`], {type: "text/javascript"}));

// build/src/core/Helios-Core.js
import.meta.env = env_exports;
var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
var Helios = class {
  constructor({
    elementID,
    nodes = {},
    edges = [],
    use2D: use2D2 = false,
    display = []
  }) {
    this.element = document.getElementById(elementID);
    this.element.innerHTML = "";
    this.canvasElement = document.createElement("canvas");
    this.element.appendChild(this.canvasElement);
    this.network = new Network(nodes, edges);
    this.display = display;
    this.rotationMatrix = mat4.create();
    this.translatePosition = vec3.create();
    this.mouseDown = false;
    this.lastMouseX = null;
    this.lastMouseY = null;
    this.redrawingFromMouseWheelEvent = false;
    this.fastEdges = false;
    this.animate = false;
    this.cameraDistance = 450;
    this._zoomFactor = 1;
    this.rotateLinearX = 0;
    this.rotateLinearY = 0;
    this.panX = 0;
    this.panY = 0;
    this.saveResolutionRatio = 1;
    this.pickingResolutionRatio = 0.25;
    this._edgesIntensity = 1;
    this._use2D = use2D2;
    if (this._use2D) {
      for (let vertexIndex = 0; vertexIndex < this.network.positions.length; vertexIndex++) {
        this.network.positions[vertexIndex * 3 + 2] = 0;
      }
    }
    mat4.identity(this.rotationMatrix);
    var translatePosition = [0, 0, 0];
    this.gl = createWebGLContext(this.canvasElement, {
      antialias: true,
      powerPreference: "high-performance",
      desynchronized: true
    });
    console.log(this.gl);
    this.initialize();
    window.onresize = (event) => {
      this.willResizeEvent(event);
    };
    this.onNodeClickCallback = null;
    this.onNodeHoverStartCallback = null;
    this.onNodeHoverMoveCallback = null;
    this.onNodeHoverEndCallback = null;
    this.onZoomCallback = null;
    this.onRotationCallback = null;
    this.onResizeCallback = null;
    this.onLayoutStartCallback = null;
    this.onLayoutFinishCallback = null;
    this.onDrawCallback = null;
    this._backgroundColor = [0.5, 0.5, 0.5, 1];
    this.onReadyCallback = null;
    this.isReady = false;
  }
  async initialize() {
    await this._setupShaders();
    await this._buildGeometry();
    await this._buildPickingBuffers();
    await this._buildEdgesGeometry();
    await this.willResizeEvent(0);
    await this._setupCamera();
    await this._setupEvents();
    await this._setupLayout();
    await this.redraw();
    this.onReadyCallback?.(this);
    this.onReadyCallback = null;
    this.isReady = true;
  }
  _setupLayout() {
    this.layoutWorker = new Worker(workerURL);
    this.newPositions = this.network.positions.slice(0);
    this.positionInterpolator = null;
    this.layoutWorker.onmessage = (msg) => {
      if (msg.data.type == "layoutStep") {
        this.newPositions = msg.data.positions;
        if (this.positionInterpolator == null) {
          let maxDisplacement = 0;
          for (let index = 0; index < this.network.positions.length; index++) {
            let displacement = this.newPositions[index] - this.network.positions[index];
            maxDisplacement = Math.max(Math.abs(displacement), maxDisplacement);
          }
          ;
          if (maxDisplacement > 1) {
            this.onLayoutStartCallback?.();
            this.positionInterpolator = setInterval(() => {
              let maxDisplacement2 = 0;
              for (let index = 0; index < this.network.positions.length; index++) {
                let displacement = this.newPositions[index] - this.network.positions[index];
                this.network.positions[index] += 0.025 * displacement;
                maxDisplacement2 = Math.max(Math.abs(displacement), maxDisplacement2);
              }
              ;
              this._updateGeometry();
              this._updateEdgesGeometry();
              requestAnimationFrame(() => {
                this.redraw();
              });
              if (maxDisplacement2 < 1) {
                this.onLayoutFinishCallback?.();
                clearInterval(this.positionInterpolator);
                this.positionInterpolator = null;
              }
            }, 1e3 / 60);
          }
        }
      } else {
        console.log("Received message", msg);
      }
    };
    this.layoutWorker.postMessage({type: "init", network: this.network, use2D: this._use2D});
    this.layoutRunning = true;
    document.addEventListener("keyup", (event) => {
      if (event.code === "Space") {
        if (this.layoutRunning) {
          this.stopLayout();
        } else {
          this.resumeLayout();
        }
      }
    });
  }
  stopLayout() {
    this.layoutWorker.postMessage({type: "stop"});
    this.layoutRunning = false;
  }
  resumeLayout() {
    this.layoutWorker.postMessage({type: "restart"});
    this.layoutRunning = true;
  }
  _setupEvents() {
    this.lastMouseX = -1;
    this.lastMouseY = -1;
    this.currentHoverIndex = -1;
    this.canvasElement.onclick = (e) => {
      const rect = this.canvasElement.getBoundingClientRect();
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      const nodeIndex = this.pickPoint(this.lastMouseX - rect.left, this.lastMouseY - rect.top);
      if (nodeIndex >= 0) {
        this.onNodeClickCallback?.(this.network.index2Node[nodeIndex], e);
      }
    };
    this.canvasElement.addEventListener("mousemove", (event) => {
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
      this.triggerHoverEvents(event);
    });
    this.canvasElement.addEventListener("mouseleave", (e) => {
      if (this.currentHoverIndex >= 0) {
        this.onNodeHoverEndCallback?.(this.network.index2Node[this.currentHoverIndex], e);
        this.currentHoverIndex = -1;
        this.lastMouseX = -1;
        this.lastMouseY = -1;
      }
    });
    document.body.addEventListener("mouseout", (e) => {
      if (!e.relatedTarget && !e.toElement) {
        if (this.currentHoverIndex >= 0) {
          this.onNodeHoverEndCallback?.(this.network.index2Node[this.currentHoverIndex], e);
          this.currentHoverIndex = -1;
          this.lastMouseX = -1;
          this.lastMouseY = -1;
        }
      }
    });
  }
  async _downloadImageData(imagedata, filename, supersampleFactor, fileFormat) {
    let pica2 = new pica_default({});
    let canvas = document.createElement("canvas");
    let canvasFullSize = document.createElement("canvas");
    let ctx = canvas.getContext("2d");
    let ctxFullSize = canvasFullSize.getContext("2d");
    canvasFullSize.width = imagedata.width;
    canvasFullSize.height = imagedata.height;
    canvas.width = imagedata.width / supersampleFactor;
    canvas.height = imagedata.height / supersampleFactor;
    ctx.imageSmoothingEnabled = true;
    ctxFullSize.imageSmoothingEnabled = true;
    if (typeof ctx.imageSmoothingQuality !== "undefined") {
      ctx.imageSmoothingQuality = "high";
    }
    if (typeof ctxFullSize.imageSmoothingQuality !== "undefined") {
      ctxFullSize.imageSmoothingQuality = "high";
    }
    ctxFullSize.putImageData(imagedata, 0, 0);
    await pica2.resize(canvasFullSize, canvas, {
      alpha: true
    });
    let downloadLink = document.createElement("a");
    if (isSafari) {
      console.log("Fixing Safari bug...");
      canvas.toDataURL();
    }
    downloadLink.setAttribute("download", filename);
    let blob = await pica2.toBlob(canvas, "image/png");
    if (blob) {
      if (filename.endsWith("svg")) {
        let svgText = `
				<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
				width="${canvas.width}" height="${canvas.width}"
				>
				<image
						width="${canvas.width}" height="${canvas.width}"
						xlink:href="${blob}"
						/>
				</svg>`;
        downloadLink.setAttribute("download", filename);
        let blobSVG = new Blob([svgText], {type: "image/svg+xml"});
        let url = URL.createObjectURL(blobSVG);
        downloadLink.setAttribute("href", url);
        downloadLink.click();
      } else {
        let url = URL.createObjectURL(blob);
        downloadLink.setAttribute("href", url);
        downloadLink.click();
      }
    } else {
      window.alert(`An error occured while trying to download the image. Please try again. (Error: blob is null.)`);
    }
    if (filename.endsWith("svg")) {
      let svgText = `
			<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
			width="${canvas.width}" height="${canvas.width}"
			>
			<image
					width="${canvas.width}" height="${canvas.width}"
					xlink:href="${canvas.toDataURL()}"
					/>
			</svg>`;
      downloadLink.setAttribute("download", filename);
      let blob2 = new Blob([svgText], {type: "image/svg+xml"});
      let url = URL.createObjectURL(blob2);
      downloadLink.setAttribute("href", url);
      downloadLink.click();
    } else if (false) {
      downloadLink.setAttribute("download", filename);
      downloadLink.setAttribute("href", canvas.toDataURL("image/png").replace("image/png", "image/octet-stream"));
      downloadLink.click();
    } else {
    }
  }
  framebufferImage(framebuffer) {
    const fbWidth = framebuffer.size.width;
    const fbHeight = framebuffer.size.height;
    const data = new Uint8ClampedArray(4 * fbWidth * fbHeight);
    let gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.readPixels(0, 0, fbWidth, fbHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return new ImageData(data, fbWidth, fbHeight);
  }
  exportFigure(filename, {
    scale = 1,
    supersampleFactor = 4,
    width = null,
    height = null,
    backgroundColor = null
  }) {
    if (typeof scale === "undefined") {
      scale = 1;
    }
    if (typeof supersampleFactor === "undefined") {
      supersampleFactor = 2;
    }
    let framebuffer = this.createOffscreenFramebuffer();
    if (width == null && height == null) {
      width = this.canvasElement.width;
      height = this.canvasElement.height;
    } else if (width == null) {
      width = Math.round(height * this.canvasElement.width / this.canvasElement.height);
    } else if (height == null) {
      height = Math.round(width * this.canvasElement.height / this.canvasElement.width);
    }
    if (backgroundColor == null) {
      backgroundColor = this.backgroundColor;
    }
    framebuffer.setSize(width * scale * supersampleFactor, height * scale * supersampleFactor);
    framebuffer.backgroundColor = backgroundColor;
    this._redrawAll(framebuffer);
    let image = this.framebufferImage(framebuffer);
    this._downloadImageData(image, filename, supersampleFactor);
    framebuffer.discard();
  }
  triggerHoverEvents(event) {
    if (this.lastMouseX == -1 || this.lastMouseY == -1) {
      return;
    }
    const rect = this.canvasElement.getBoundingClientRect();
    const nodeID = this.pickPoint(this.lastMouseX - rect.left, this.lastMouseY - rect.top);
    if (nodeID >= 0 && this.currentHoverIndex == -1) {
      this.currentHoverIndex = nodeID;
      this.onNodeHoverStartCallback?.(this.network.index2Node[nodeID], event);
    } else if (nodeID >= 0 && this.currentHoverIndex == nodeID) {
      this.onNodeHoverMoveCallback?.(this.network.index2Node[nodeID], event);
    } else if (nodeID >= 0 && this.currentHoverIndex != nodeID) {
      this.onNodeHoverEndCallback?.(this.network.index2Node[this.currentHoverIndex], event);
      this.currentHoverIndex = nodeID;
      this.onNodeHoverStartCallback?.(this.network.index2Node[nodeID], event);
    } else if (nodeID == -1 && this.currentHoverIndex != nodeID) {
      this.onNodeHoverEndCallback?.(this.network.index2Node[this.currentHoverIndex], event);
      this.currentHoverIndex = -1;
    }
  }
  async _setupShaders() {
    let edgesShaderVertex = await getShader(this.gl, "edges-vertex");
    let edgesShaderFragment = await getShader(this.gl, "edges-fragment");
    this.edgesShaderProgram = new ShaderProgram(edgesShaderVertex, edgesShaderFragment, ["projectionViewMatrix", "nearFar", "linesIntensity"], ["vertex", "color"], this.gl);
    let verticesShaderVertex = await getShader(this.gl, "vertices-vertex");
    let verticesShaderFragment = await getShader(this.gl, "vertices-fragment");
    let pickingShaderFragment = await getShader(this.gl, "vertices-fragment-picking");
    this.verticesShaderProgram = new ShaderProgram(verticesShaderVertex, verticesShaderFragment, ["viewMatrix", "projectionMatrix", "normalMatrix"], ["vertex", "position", "color", "intensity", "size", "outlineWidth", "outlineColor", "encodedIndex"], this.gl);
    this.verticesPickingShaderProgram = new ShaderProgram(verticesShaderVertex, pickingShaderFragment, ["viewMatrix", "projectionMatrix", "normalMatrix"], ["vertex", "position", "color", "intensity", "size", "outlineWidth", "outlineColor", "encodedIndex"], this.gl);
  }
  async _buildGeometry() {
    let gl = this.gl;
    let sphereQuality = 15;
    this.nodesGeometry = makePlane(gl, false, false);
    this.nodesPositionBuffer = gl.createBuffer();
    this.nodesColorBuffer = gl.createBuffer();
    this.nodesSizeBuffer = gl.createBuffer();
    this.nodesIntensityBuffer = gl.createBuffer();
    this.nodesOutlineWidthBuffer = gl.createBuffer();
    this.nodesOutlineColorBuffer = gl.createBuffer();
    this.nodesIndexBuffer = gl.createBuffer();
    this.nodesIndexArray = new Float32Array(this.network.index2Node.length * 4);
    for (let ID = 0; ID < this.network.index2Node.length; ID++) {
      this.nodesIndexArray[4 * ID] = (ID + 1 >> 0 & 255) / 255;
      this.nodesIndexArray[4 * ID + 1] = (ID + 1 >> 8 & 255) / 255;
      this.nodesIndexArray[4 * ID + 2] = (ID + 1 >> 16 & 255) / 255;
      this.nodesIndexArray[4 * ID + 3] = (ID + 1 >> 24 & 255) / 255;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesIndexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.nodesIndexArray, gl.STATIC_DRAW);
    console.log(this.nodesIndexArray);
    await this._updateGeometry();
  }
  async _buildPickingBuffers() {
    let gl = this.gl;
    this.pickingFramebuffer = this.createOffscreenFramebuffer();
  }
  createOffscreenFramebuffer() {
    let gl = this.gl;
    let framebuffer = gl.createFramebuffer();
    framebuffer.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, framebuffer.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    framebuffer.depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, framebuffer.depthBuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    framebuffer.size = {
      width: 0,
      height: 0
    };
    framebuffer.setSize = (width, height) => {
      gl.bindTexture(gl.TEXTURE_2D, framebuffer.texture);
      const level2 = 0;
      const internalFormat = gl.RGBA;
      const border = 0;
      const format2 = gl.RGBA;
      const type = gl.UNSIGNED_BYTE;
      const data = null;
      const fbWidth = width;
      const fbHeight = height;
      gl.texImage2D(gl.TEXTURE_2D, level2, internalFormat, fbWidth, fbHeight, border, format2, type, data);
      gl.bindRenderbuffer(gl.RENDERBUFFER, framebuffer.depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, fbWidth, fbHeight);
      framebuffer.size.width = width;
      framebuffer.size.height = height;
    };
    framebuffer.discard = () => {
      gl.deleteRenderbuffer(framebuffer.depthBuffer);
      gl.deleteTexture(framebuffer.texture);
      gl.deleteFramebuffer(framebuffer);
    };
    const attachmentPoint = gl.COLOR_ATTACHMENT0;
    const level = 0;
    gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, framebuffer.texture, level);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, framebuffer.depthBuffer);
    return framebuffer;
  }
  async _updateGeometry() {
    let gl = this.gl;
    let positions = this.network.positions;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    let colors3 = this.network.colors;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors3, gl.STATIC_DRAW);
    let sizes = this.network.sizes;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesSizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);
    let intensities = this.network.intensities;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesIntensityBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, intensities, gl.STATIC_DRAW);
    let outlineWidths = this.network.outlineWidths;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesOutlineWidthBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, outlineWidths, gl.STATIC_DRAW);
    let outlineColors = this.network.outlineColors;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesOutlineColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, outlineColors, gl.STATIC_DRAW);
  }
  async _buildEdgesGeometry() {
    let gl = this.gl;
    let edges = this.network.indexedEdges;
    let positions = this.network.positions;
    let colors3 = this.network.colors;
    let newGeometry = new Object();
    let indicesArray;
    if (positions.length < 64e3) {
      indicesArray = new Uint16Array(edges);
      newGeometry.indexType = gl.UNSIGNED_SHORT;
    } else {
      var uints_for_indices = gl.getExtension("OES_element_index_uint");
      if (uints_for_indices == null) {
        indicesArray = new Uint16Array(edges);
        newGeometry.indexType = gl.UNSIGNED_SHORT;
      } else {
        indicesArray = new Uint32Array(edges);
        newGeometry.indexType = gl.UNSIGNED_INT;
      }
    }
    newGeometry.vertexObject = gl.createBuffer();
    newGeometry.colorObject = gl.createBuffer();
    newGeometry.numIndices = indicesArray.length;
    newGeometry.indexObject = gl.createBuffer();
    this.edgesGeometry = newGeometry;
    this.indicesArray = indicesArray;
    await this._updateEdgesGeometry();
  }
  async _updateEdgesGeometry() {
    let gl = this.gl;
    let edges = this.network.indexedEdges;
    let positions = this.network.positions;
    let colors3 = this.network.colors;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.vertexObject);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.colorObject);
    gl.bufferData(gl.ARRAY_BUFFER, colors3, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgesGeometry.indexObject);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indicesArray, gl.STREAM_DRAW);
  }
  async resizeGL(newWidth, newHeight) {
    this.pickingFramebuffer.setSize(newWidth * this.pickingResolutionRatio, newHeight * this.pickingResolutionRatio);
    window.requestAnimationFrame(() => this.redraw());
  }
  async _setupCamera() {
    this.zoom = zoom().on("zoom", (event) => {
      this._zoomFactor = event.transform.k;
      this.triggerHoverEvents(event);
      if (this.prevK === void 0) {
        this.prevK = event.transform.k;
      }
      let dx = 0;
      let dy = 0;
      if (this.prevK == event.transform.k) {
        if (this.prevX === void 0) {
          dx = event.transform.x;
          dy = event.transform.y;
        } else {
          dx = event.transform.x - this.prevX * this._zoomFactor;
          dy = event.transform.y - this.prevY * this._zoomFactor;
        }
      } else {
      }
      this.prevX = event.transform.x / this._zoomFactor;
      this.prevY = event.transform.y / this._zoomFactor;
      this.prevK = event.transform.k;
      let newRotationMatrix = mat4.create();
      if (this._use2D || event.sourceEvent?.shiftKey) {
        let perspectiveFactor = this.cameraDistance * this._zoomFactor;
        let aspectRatio = this.canvasElement.width / this.canvasElement.height;
        this.panX = this.panX + dx / perspectiveFactor * 400;
        this.panY = this.panY - dy / perspectiveFactor * 400;
      } else {
        mat4.identity(newRotationMatrix);
        mat4.rotate(newRotationMatrix, newRotationMatrix, degToRad(dx / 2), [0, 1, 0]);
        mat4.rotate(newRotationMatrix, newRotationMatrix, degToRad(dy / 2), [1, 0, 0]);
        mat4.multiply(this.rotationMatrix, newRotationMatrix, this.rotationMatrix);
      }
      if (!this.positionInterpolator) {
        this.update();
        this.render();
      }
      (event2) => event2.preventDefault();
    });
    select(this.canvasElement).call(this.zoom).on("dblclick.zoom", null);
  }
  zoomFactor(zoomFactor, duration) {
    if (zoomFactor !== void 0) {
      if (duration === void 0) {
        select(this.canvasElement).call(this.zoom.transform, identity$1.translate(0, 0).scale(zoomFactor));
      } else {
        select(this.canvasElement).transition().duration(duration).call(this.zoom.transform, identity$1.translate(0, 0).scale(zoomFactor));
      }
      return this;
    } else {
      return this._zoomFactor;
    }
  }
  willResizeEvent(event) {
    let dpr = window.devicePixelRatio || 1;
    if (dpr < 2) {
      dpr = 2;
    }
    this.canvasElement.style.width = this.element.clientWidth + "px";
    this.canvasElement.style.height = this.element.clientHeight + "px";
    this.canvasElement.width = dpr * this.element.clientWidth;
    this.canvasElement.height = dpr * this.element.clientHeight;
    this.resizeGL(this.canvasElement.width, this.canvasElement.height);
    this.onResizeCallback?.(event);
  }
  redraw() {
    this._redrawAll(null, false);
    this._redrawAll(this.pickingFramebuffer, true);
    this.onDrawCallback?.();
    this.triggerHoverEvents(null);
  }
  update() {
    if (!this.positionInterpolator) {
      this._updateGeometry();
      this._updateEdgesGeometry();
    }
  }
  render() {
    if (!this.positionInterpolator) {
      window.requestAnimationFrame(() => this.redraw());
    }
  }
  _redrawPrepare(destination, isPicking, viewport) {
    let gl = this.gl;
    const fbWidth = destination?.size.width || this.canvasElement.width;
    const fbHeight = destination?.size.height || this.canvasElement.height;
    if (destination == null) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(...this._backgroundColor);
    } else if (isPicking) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
      gl.clearColor(0, 0, 0, 0);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
      if (typeof destination.backgroundColor === "undefined") {
        gl.clearColor(...this._backgroundColor);
      } else {
        gl.clearColor(...destination.backgroundColor);
      }
    }
    if (typeof viewport === "undefined") {
      gl.viewport(0, 0, fbWidth, fbHeight);
    } else {
      gl.viewport(...viewport);
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.depthFunc(gl.LEQUAL);
    this.projectionMatrix = mat4.create();
    this.viewMatrix = mat4.create();
    mat4.perspective(this.projectionMatrix, Math.PI * 2 / 360 * 70, fbWidth / fbHeight, 1, 1e4);
    mat4.identity(this.viewMatrix);
    mat4.translate(this.viewMatrix, this.viewMatrix, [this.panX, this.panY, -this.cameraDistance / this._zoomFactor]);
    mat4.multiply(this.viewMatrix, this.viewMatrix, this.rotationMatrix);
    mat4.translate(this.viewMatrix, this.viewMatrix, this.translatePosition);
  }
  _redrawNodes(destination, isPicking) {
    let gl = this.gl;
    let ext = gl.getExtension("ANGLE_instanced_arrays");
    let currentShaderProgram;
    if (!isPicking) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      currentShaderProgram = this.verticesShaderProgram;
    } else {
      gl.disable(gl.BLEND);
      currentShaderProgram = this.verticesPickingShaderProgram;
    }
    currentShaderProgram.use(gl);
    currentShaderProgram.attributes.enable("vertex");
    currentShaderProgram.attributes.enable("position");
    currentShaderProgram.attributes.enable("size");
    currentShaderProgram.attributes.enable("intensity");
    currentShaderProgram.attributes.enable("outlineWidth");
    currentShaderProgram.attributes.enable("outlineColor");
    currentShaderProgram.attributes.enable("encodedIndex");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesGeometry.vertexObject);
    gl.vertexAttribPointer(currentShaderProgram.attributes.vertex, 3, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.vertex, 0);
    if (this.nodesGeometry.indexObject) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.nodesGeometry.indexObject);
    }
    gl.uniformMatrix4fv(currentShaderProgram.uniforms.projectionMatrix, false, this.projectionMatrix);
    gl.uniformMatrix4fv(currentShaderProgram.uniforms.viewMatrix, false, this.viewMatrix);
    let normalMatrix = mat3.create();
    mat3.normalFromMat4(normalMatrix, this.viewMatrix);
    gl.uniformMatrix3fv(currentShaderProgram.uniforms.normalMatrix, false, normalMatrix);
    let colorsArray = this.network.colors;
    let positionsArray = this.network.positions;
    let sizeValue = this.network.sizes;
    let intensityValue = this.network.intensities;
    let outlineWidthValue = this.network.outlineWidths;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesPositionBuffer);
    gl.enableVertexAttribArray(currentShaderProgram.attributes.position);
    gl.vertexAttribPointer(currentShaderProgram.attributes.position, 3, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.position, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesColorBuffer);
    gl.enableVertexAttribArray(currentShaderProgram.attributes.color);
    gl.vertexAttribPointer(currentShaderProgram.attributes.color, 3, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.color, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesSizeBuffer);
    gl.enableVertexAttribArray(currentShaderProgram.attributes.size);
    gl.vertexAttribPointer(currentShaderProgram.attributes.size, 1, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.size, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesOutlineColorBuffer);
    gl.enableVertexAttribArray(currentShaderProgram.attributes.outlineColor);
    gl.vertexAttribPointer(currentShaderProgram.attributes.outlineColor, 3, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.outlineColor, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesOutlineWidthBuffer);
    gl.enableVertexAttribArray(currentShaderProgram.attributes.outlineWidth);
    gl.vertexAttribPointer(currentShaderProgram.attributes.outlineWidth, 1, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.outlineWidth, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesIntensityBuffer);
    gl.enableVertexAttribArray(currentShaderProgram.attributes.intensity);
    gl.vertexAttribPointer(currentShaderProgram.attributes.intensity, 1, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.intensity, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesIndexBuffer);
    gl.enableVertexAttribArray(currentShaderProgram.attributes.encodedIndex);
    gl.vertexAttribPointer(currentShaderProgram.attributes.encodedIndex, 4, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.encodedIndex, 1);
    if (this.nodesGeometry.indexObject) {
      ext.drawElementsInstancedANGLE(gl.TRIANGLES, this.nodesGeometry.numIndices, this.nodesGeometry.indexType, 0, this.network.positions.length / 3);
    } else {
      ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, this.nodesGeometry.numIndices, this.network.positions.length / 3);
    }
    currentShaderProgram.attributes.disable("vertex");
    currentShaderProgram.attributes.disable("position");
    currentShaderProgram.attributes.disable("size");
    currentShaderProgram.attributes.disable("intensity");
    currentShaderProgram.attributes.disable("outlineWidth");
    currentShaderProgram.attributes.disable("outlineColor");
    currentShaderProgram.attributes.disable("encodedIndex");
  }
  _redrawEdges(destination, isPicking) {
    let gl = this.gl;
    let ext = gl.getExtension("ANGLE_instanced_arrays");
    if (!isPicking && !((this.mouseDown || this.redrawingFromMouseWheelEvent) && this.fastEdges)) {
      this.edgesShaderProgram.use(gl);
      this.edgesShaderProgram.attributes.enable("vertex");
      this.edgesShaderProgram.attributes.enable("color");
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
      this.projectionViewMatrix = mat4.create();
      mat4.multiply(this.projectionViewMatrix, this.projectionMatrix, this.viewMatrix);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.vertexObject);
      gl.vertexAttribPointer(this.edgesShaderProgram.attributes.vertex, 3, gl.FLOAT, false, 0, 0);
      ext.vertexAttribDivisorANGLE(this.edgesShaderProgram.attributes.vertex, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.colorObject);
      gl.vertexAttribPointer(this.edgesShaderProgram.attributes.color, 3, gl.FLOAT, false, 0, 0);
      ext.vertexAttribDivisorANGLE(this.edgesShaderProgram.attributes.color, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgesGeometry.indexObject);
      gl.uniformMatrix4fv(this.edgesShaderProgram.uniforms.projectionViewMatrix, false, this.projectionViewMatrix);
      gl.uniform1f(this.edgesShaderProgram.uniforms.linesIntensity, this._edgesIntensity);
      gl.drawElements(gl.LINES, this.edgesGeometry.numIndices, this.edgesGeometry.indexType, 0);
      this.edgesShaderProgram.attributes.disable("vertex");
      this.edgesShaderProgram.attributes.disable("color");
    }
  }
  _redrawAll(destination, isPicking) {
    if (typeof isPicking === "undefined") {
      isPicking = false;
    }
    let gl = this.gl;
    this._redrawPrepare(destination, isPicking);
    gl.depthMask(true);
    if (this._use2D) {
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      this._redrawEdges(destination, isPicking);
      this._redrawNodes(destination, isPicking);
    } else {
      gl.enable(gl.DEPTH_TEST);
      this._redrawNodes(destination, isPicking);
      gl.depthMask(false);
      this._redrawEdges(destination, isPicking);
      gl.depthMask(true);
    }
  }
  onResize(callback) {
    this.onResizeCallback = callback;
    return this;
  }
  onNodeClick(callback) {
    this.onNodeClickCallback = callback;
    return this;
  }
  onNodeHoverStart(callback) {
    this.onNodeHoverStartCallback = callback;
    return this;
  }
  onNodeHoverEnd(callback) {
    this.onNodeHoverEndCallback = callback;
    return this;
  }
  onNodeHoverMove(callback) {
    this.onNodeHoverMoveCallback = callback;
    return this;
  }
  onZoom(callback) {
    this.onZoomCallback = callback;
    return this;
  }
  onRotation(callback) {
    this.onRotationCallback = callback;
    return this;
  }
  onLayoutStart(callback) {
    this.onLayoutStartCallback = callback;
    return this;
  }
  onLayoutFinish(callback) {
    this.onLayoutFinishCallback = callback;
    return this;
  }
  onDraw(callback) {
    this.onDrawCallback = callback;
    return this;
  }
  onReady(callback) {
    if (this.isReady) {
      callback?.(this);
    } else {
      this.onReadyCallback = callback;
    }
  }
  backgroundColor(color2) {
    if (typeof color2 === "undefined") {
      return this._backgroundColor;
    } else {
      this._backgroundColor = color2;
      return this;
    }
  }
  nodeColor(colorInput, nodeID) {
    if (typeof nodeID === "undefined") {
      if (typeof colorInput === "undefined") {
        return this.network.colors;
      } else if (typeof colorInput === "function") {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          let nodeIndex = this.network.ID2index[nodeID2];
          let aColor = colorInput(node, nodeIndex, this.network);
          this.network.colors[nodeIndex * 3 + 0] = aColor[0];
          this.network.colors[nodeIndex * 3 + 1] = aColor[1];
          this.network.colors[nodeIndex * 3 + 2] = aColor[2];
        }
      } else if (typeof colorInput === "number") {
        return this.network.colors[this.network.ID2index[colorInput]];
      } else {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          let nodeIndex = this.network.ID2index[nodeID2];
          this.network.colors[nodeIndex * 3 + 0] = colorInput[0];
          this.network.colors[nodeIndex * 3 + 1] = colorInput[1];
          this.network.colors[nodeIndex * 3 + 2] = colorInput[2];
        }
      }
    } else {
      if (typeof colorInput === "function") {
        let nodeIndex = this.network.ID2index[nodeID];
        let aColor = colorInput(nodeID, nodeIndex, this.network);
        this.network.colors[nodeIndex * 3 + 0] = aColor[0];
        this.network.colors[nodeIndex * 3 + 1] = aColor[1];
        this.network.colors[nodeIndex * 3 + 2] = aColor[2];
      } else {
        let nodeIndex = this.network.ID2index[nodeID];
        this.network.colors[nodeIndex * 3 + 0] = colorInput[0];
        this.network.colors[nodeIndex * 3 + 1] = colorInput[1];
        this.network.colors[nodeIndex * 3 + 2] = colorInput[2];
      }
    }
    return this;
  }
  nodeSize(sizeInput, nodeID) {
    if (typeof nodeID === "undefined") {
      if (typeof sizeInput === "undefined") {
        return this.network.sizes;
      } else if (typeof sizeInput === "function") {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          let aSize = sizeInput(node, this.network);
          this.network.sizes[node.index] = aSize;
        }
      } else {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          this.network.sizes[node.index] = sizeInput;
        }
      }
    } else {
      if (typeof sizeInput === "function") {
        let aSize = sizeInput(nodeID, this.network);
        let nodeIndex = this.network.ID2index[nodeID];
        this.network.sizes[nodeIndex] = aSize;
      } else {
        let nodeIndex = this.network.ID2index[nodeID];
        this.network.sizes[nodeIndex] = sizeInput;
      }
    }
    return this;
  }
  nodeOutlineColor(colorInput, nodeID) {
    if (typeof nodeID === "undefined") {
      if (typeof colorInput === "undefined") {
        return this.network.outlineColors;
      } else if (typeof colorInput === "function") {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          let nodeIndex = this.network.ID2index[nodeID2];
          let aColor = colorInput(node, nodeIndex, this.network);
          this.network.outlineColors[nodeIndex * 3 + 0] = aColor[0];
          this.network.outlineColors[nodeIndex * 3 + 1] = aColor[1];
          this.network.outlineColors[nodeIndex * 3 + 2] = aColor[2];
        }
      } else if (typeof colorInput === "number") {
        return this.network.outlineColors[this.network.ID2index[colorInput]];
      } else {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          let nodeIndex = this.network.ID2index[nodeID2];
          this.network.outlineColors[nodeIndex * 3 + 0] = colorInput[0];
          this.network.outlineColors[nodeIndex * 3 + 1] = colorInput[1];
          this.network.outlineColors[nodeIndex * 3 + 2] = colorInput[2];
        }
      }
    } else {
      if (typeof colorInput === "function") {
        let nodeIndex = this.network.ID2index[nodeID];
        let aColor = colorInput(nodeID, nodeIndex, this.network);
        this.network.outlineColors[nodeIndex * 3 + 0] = aColor[0];
        this.network.outlineColors[nodeIndex * 3 + 1] = aColor[1];
        this.network.outlineColors[nodeIndex * 3 + 2] = aColor[2];
      } else {
        let nodeIndex = this.network.ID2index[nodeID];
        this.network.outlineColors[nodeIndex * 3 + 0] = colorInput[0];
        this.network.outlineColors[nodeIndex * 3 + 1] = colorInput[1];
        this.network.outlineColors[nodeIndex * 3 + 2] = colorInput[2];
      }
    }
    return this;
  }
  nodeOutlineWidth(widthInput, nodeID) {
    if (typeof nodeID === "undefined") {
      if (typeof widthInput === "undefined") {
        return this.network.outlineWidths;
      } else if (typeof widthInput === "function") {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          let aWidth = widthInput(node, this.network);
          this.network.outlineWidths[node.index] = aWidth;
        }
      } else {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          this.network.outlineWidths[node.index] = widthInput;
        }
      }
    } else {
      if (typeof widthInput === "function") {
        let aWidth = widthInput(nodeID, this.network);
        let nodeIndex = this.network.ID2index[nodeID];
        this.network.outlineWidths[nodeIndex] = aWidth;
      } else {
        let nodeIndex = this.network.ID2index[nodeID];
        this.network.outlineWidths[nodeIndex] = widthInput;
      }
    }
    return this;
  }
  pickPoint(x, y) {
    const fbWidth = this.canvasElement.width * this.pickingResolutionRatio;
    const fbHeight = this.canvasElement.height * this.pickingResolutionRatio;
    const pixelX = x * fbWidth / this.canvasElement.clientWidth;
    const pixelY = fbHeight - y * fbHeight / this.canvasElement.clientHeight - 1;
    const data = new Uint8Array(4);
    let gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFramebuffer);
    gl.readPixels(pixelX, pixelY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const ID = data[0] + (data[1] << 8) + (data[2] << 16) + (data[3] << 24) - 1;
    return ID;
  }
  edgesIntensity(intensity) {
    if (typeof intensity === "undefined") {
      return this._edgesIntensity;
    } else {
      this._edgesIntensity = intensity;
      return this;
    }
  }
};

// build/_snowpack/pkg/d3-scale-chromatic.js
var d3_scale_chromatic_exports = {};
__export(d3_scale_chromatic_exports, {
  interpolateBlues: () => Blues,
  interpolateBrBG: () => BrBG,
  interpolateBuGn: () => BuGn,
  interpolateBuPu: () => BuPu,
  interpolateCividis: () => cividis,
  interpolateCool: () => cool,
  interpolateCubehelixDefault: () => cubehelix$2,
  interpolateGnBu: () => GnBu,
  interpolateGreens: () => Greens,
  interpolateGreys: () => Greys,
  interpolateInferno: () => inferno,
  interpolateMagma: () => magma,
  interpolateOrRd: () => OrRd,
  interpolateOranges: () => Oranges,
  interpolatePRGn: () => PRGn,
  interpolatePiYG: () => PiYG,
  interpolatePlasma: () => plasma,
  interpolatePuBu: () => PuBu,
  interpolatePuBuGn: () => PuBuGn,
  interpolatePuOr: () => PuOr,
  interpolatePuRd: () => PuRd,
  interpolatePurples: () => Purples,
  interpolateRainbow: () => rainbow,
  interpolateRdBu: () => RdBu,
  interpolateRdGy: () => RdGy,
  interpolateRdPu: () => RdPu,
  interpolateRdYlBu: () => RdYlBu,
  interpolateRdYlGn: () => RdYlGn,
  interpolateReds: () => Reds,
  interpolateSinebow: () => sinebow,
  interpolateSpectral: () => Spectral,
  interpolateTurbo: () => turbo,
  interpolateViridis: () => viridis,
  interpolateWarm: () => warm,
  interpolateYlGn: () => YlGn,
  interpolateYlGnBu: () => YlGnBu,
  interpolateYlOrBr: () => YlOrBr,
  interpolateYlOrRd: () => YlOrRd,
  schemeAccent: () => Accent,
  schemeBlues: () => scheme$l,
  schemeBrBG: () => scheme,
  schemeBuGn: () => scheme$9,
  schemeBuPu: () => scheme$a,
  schemeCategory10: () => category10,
  schemeDark2: () => Dark2,
  schemeGnBu: () => scheme$b,
  schemeGreens: () => scheme$m,
  schemeGreys: () => scheme$n,
  schemeOrRd: () => scheme$c,
  schemeOranges: () => scheme$q,
  schemePRGn: () => scheme$1,
  schemePaired: () => Paired,
  schemePastel1: () => Pastel1,
  schemePastel2: () => Pastel2,
  schemePiYG: () => scheme$2,
  schemePuBu: () => scheme$e,
  schemePuBuGn: () => scheme$d,
  schemePuOr: () => scheme$3,
  schemePuRd: () => scheme$f,
  schemePurples: () => scheme$o,
  schemeRdBu: () => scheme$4,
  schemeRdGy: () => scheme$5,
  schemeRdPu: () => scheme$g,
  schemeRdYlBu: () => scheme$6,
  schemeRdYlGn: () => scheme$7,
  schemeReds: () => scheme$p,
  schemeSet1: () => Set1,
  schemeSet2: () => Set2,
  schemeSet3: () => Set3,
  schemeSpectral: () => scheme$8,
  schemeTableau10: () => Tableau10,
  schemeYlGn: () => scheme$i,
  schemeYlGnBu: () => scheme$h,
  schemeYlOrBr: () => scheme$j,
  schemeYlOrRd: () => scheme$k
});
var radians = Math.PI / 180;
var degrees2 = 180 / Math.PI;
var A = -0.14861;
var B = 1.78277;
var C = -0.29227;
var D = -0.90649;
var E = 1.97294;
var ED = E * D;
var EB = E * B;
var BC_DA = B * C - D * A;
function cubehelixConvert(o) {
  if (o instanceof Cubehelix)
    return new Cubehelix(o.h, o.s, o.l, o.opacity);
  if (!(o instanceof Rgb))
    o = rgbConvert(o);
  var r = o.r / 255, g = o.g / 255, b = o.b / 255, l = (BC_DA * b + ED * r - EB * g) / (BC_DA + ED - EB), bl = b - l, k = (E * (g - l) - C * bl) / D, s = Math.sqrt(k * k + bl * bl) / (E * l * (1 - l)), h = s ? Math.atan2(k, bl) * degrees2 - 120 : NaN;
  return new Cubehelix(h < 0 ? h + 360 : h, s, l, o.opacity);
}
function cubehelix(h, s, l, opacity) {
  return arguments.length === 1 ? cubehelixConvert(h) : new Cubehelix(h, s, l, opacity == null ? 1 : opacity);
}
function Cubehelix(h, s, l, opacity) {
  this.h = +h;
  this.s = +s;
  this.l = +l;
  this.opacity = +opacity;
}
define(Cubehelix, cubehelix, extend(Color, {
  brighter: function(k) {
    k = k == null ? brighter : Math.pow(brighter, k);
    return new Cubehelix(this.h, this.s, this.l * k, this.opacity);
  },
  darker: function(k) {
    k = k == null ? darker : Math.pow(darker, k);
    return new Cubehelix(this.h, this.s, this.l * k, this.opacity);
  },
  rgb: function() {
    var h = isNaN(this.h) ? 0 : (this.h + 120) * radians, l = +this.l, a = isNaN(this.s) ? 0 : this.s * l * (1 - l), cosh2 = Math.cos(h), sinh2 = Math.sin(h);
    return new Rgb(255 * (l + a * (A * cosh2 + B * sinh2)), 255 * (l + a * (C * cosh2 + D * sinh2)), 255 * (l + a * (E * cosh2)), this.opacity);
  }
}));
function cubehelix$1(hue2) {
  return function cubehelixGamma(y) {
    y = +y;
    function cubehelix$12(start2, end) {
      var h = hue2((start2 = cubehelix(start2)).h, (end = cubehelix(end)).h), s = nogamma(start2.s, end.s), l = nogamma(start2.l, end.l), opacity = nogamma(start2.opacity, end.opacity);
      return function(t) {
        start2.h = h(t);
        start2.s = s(t);
        start2.l = l(Math.pow(t, y));
        start2.opacity = opacity(t);
        return start2 + "";
      };
    }
    cubehelix$12.gamma = cubehelixGamma;
    return cubehelix$12;
  }(1);
}
cubehelix$1(hue);
var cubehelixLong = cubehelix$1(nogamma);
function colors2(specifier) {
  var n = specifier.length / 6 | 0, colors3 = new Array(n), i = 0;
  while (i < n)
    colors3[i] = "#" + specifier.slice(i * 6, ++i * 6);
  return colors3;
}
var category10 = colors2("1f77b4ff7f0e2ca02cd627289467bd8c564be377c27f7f7fbcbd2217becf");
var Accent = colors2("7fc97fbeaed4fdc086ffff99386cb0f0027fbf5b17666666");
var Dark2 = colors2("1b9e77d95f027570b3e7298a66a61ee6ab02a6761d666666");
var Paired = colors2("a6cee31f78b4b2df8a33a02cfb9a99e31a1cfdbf6fff7f00cab2d66a3d9affff99b15928");
var Pastel1 = colors2("fbb4aeb3cde3ccebc5decbe4fed9a6ffffcce5d8bdfddaecf2f2f2");
var Pastel2 = colors2("b3e2cdfdcdaccbd5e8f4cae4e6f5c9fff2aef1e2cccccccc");
var Set1 = colors2("e41a1c377eb84daf4a984ea3ff7f00ffff33a65628f781bf999999");
var Set2 = colors2("66c2a5fc8d628da0cbe78ac3a6d854ffd92fe5c494b3b3b3");
var Set3 = colors2("8dd3c7ffffb3bebadafb807280b1d3fdb462b3de69fccde5d9d9d9bc80bdccebc5ffed6f");
var Tableau10 = colors2("4e79a7f28e2ce1575976b7b259a14fedc949af7aa1ff9da79c755fbab0ab");
var ramp = (scheme2) => rgbBasis(scheme2[scheme2.length - 1]);
var scheme = new Array(3).concat("d8b365f5f5f55ab4ac", "a6611adfc27d80cdc1018571", "a6611adfc27df5f5f580cdc1018571", "8c510ad8b365f6e8c3c7eae55ab4ac01665e", "8c510ad8b365f6e8c3f5f5f5c7eae55ab4ac01665e", "8c510abf812ddfc27df6e8c3c7eae580cdc135978f01665e", "8c510abf812ddfc27df6e8c3f5f5f5c7eae580cdc135978f01665e", "5430058c510abf812ddfc27df6e8c3c7eae580cdc135978f01665e003c30", "5430058c510abf812ddfc27df6e8c3f5f5f5c7eae580cdc135978f01665e003c30").map(colors2);
var BrBG = ramp(scheme);
var scheme$1 = new Array(3).concat("af8dc3f7f7f77fbf7b", "7b3294c2a5cfa6dba0008837", "7b3294c2a5cff7f7f7a6dba0008837", "762a83af8dc3e7d4e8d9f0d37fbf7b1b7837", "762a83af8dc3e7d4e8f7f7f7d9f0d37fbf7b1b7837", "762a839970abc2a5cfe7d4e8d9f0d3a6dba05aae611b7837", "762a839970abc2a5cfe7d4e8f7f7f7d9f0d3a6dba05aae611b7837", "40004b762a839970abc2a5cfe7d4e8d9f0d3a6dba05aae611b783700441b", "40004b762a839970abc2a5cfe7d4e8f7f7f7d9f0d3a6dba05aae611b783700441b").map(colors2);
var PRGn = ramp(scheme$1);
var scheme$2 = new Array(3).concat("e9a3c9f7f7f7a1d76a", "d01c8bf1b6dab8e1864dac26", "d01c8bf1b6daf7f7f7b8e1864dac26", "c51b7de9a3c9fde0efe6f5d0a1d76a4d9221", "c51b7de9a3c9fde0eff7f7f7e6f5d0a1d76a4d9221", "c51b7dde77aef1b6dafde0efe6f5d0b8e1867fbc414d9221", "c51b7dde77aef1b6dafde0eff7f7f7e6f5d0b8e1867fbc414d9221", "8e0152c51b7dde77aef1b6dafde0efe6f5d0b8e1867fbc414d9221276419", "8e0152c51b7dde77aef1b6dafde0eff7f7f7e6f5d0b8e1867fbc414d9221276419").map(colors2);
var PiYG = ramp(scheme$2);
var scheme$3 = new Array(3).concat("998ec3f7f7f7f1a340", "5e3c99b2abd2fdb863e66101", "5e3c99b2abd2f7f7f7fdb863e66101", "542788998ec3d8daebfee0b6f1a340b35806", "542788998ec3d8daebf7f7f7fee0b6f1a340b35806", "5427888073acb2abd2d8daebfee0b6fdb863e08214b35806", "5427888073acb2abd2d8daebf7f7f7fee0b6fdb863e08214b35806", "2d004b5427888073acb2abd2d8daebfee0b6fdb863e08214b358067f3b08", "2d004b5427888073acb2abd2d8daebf7f7f7fee0b6fdb863e08214b358067f3b08").map(colors2);
var PuOr = ramp(scheme$3);
var scheme$4 = new Array(3).concat("ef8a62f7f7f767a9cf", "ca0020f4a58292c5de0571b0", "ca0020f4a582f7f7f792c5de0571b0", "b2182bef8a62fddbc7d1e5f067a9cf2166ac", "b2182bef8a62fddbc7f7f7f7d1e5f067a9cf2166ac", "b2182bd6604df4a582fddbc7d1e5f092c5de4393c32166ac", "b2182bd6604df4a582fddbc7f7f7f7d1e5f092c5de4393c32166ac", "67001fb2182bd6604df4a582fddbc7d1e5f092c5de4393c32166ac053061", "67001fb2182bd6604df4a582fddbc7f7f7f7d1e5f092c5de4393c32166ac053061").map(colors2);
var RdBu = ramp(scheme$4);
var scheme$5 = new Array(3).concat("ef8a62ffffff999999", "ca0020f4a582bababa404040", "ca0020f4a582ffffffbababa404040", "b2182bef8a62fddbc7e0e0e09999994d4d4d", "b2182bef8a62fddbc7ffffffe0e0e09999994d4d4d", "b2182bd6604df4a582fddbc7e0e0e0bababa8787874d4d4d", "b2182bd6604df4a582fddbc7ffffffe0e0e0bababa8787874d4d4d", "67001fb2182bd6604df4a582fddbc7e0e0e0bababa8787874d4d4d1a1a1a", "67001fb2182bd6604df4a582fddbc7ffffffe0e0e0bababa8787874d4d4d1a1a1a").map(colors2);
var RdGy = ramp(scheme$5);
var scheme$6 = new Array(3).concat("fc8d59ffffbf91bfdb", "d7191cfdae61abd9e92c7bb6", "d7191cfdae61ffffbfabd9e92c7bb6", "d73027fc8d59fee090e0f3f891bfdb4575b4", "d73027fc8d59fee090ffffbfe0f3f891bfdb4575b4", "d73027f46d43fdae61fee090e0f3f8abd9e974add14575b4", "d73027f46d43fdae61fee090ffffbfe0f3f8abd9e974add14575b4", "a50026d73027f46d43fdae61fee090e0f3f8abd9e974add14575b4313695", "a50026d73027f46d43fdae61fee090ffffbfe0f3f8abd9e974add14575b4313695").map(colors2);
var RdYlBu = ramp(scheme$6);
var scheme$7 = new Array(3).concat("fc8d59ffffbf91cf60", "d7191cfdae61a6d96a1a9641", "d7191cfdae61ffffbfa6d96a1a9641", "d73027fc8d59fee08bd9ef8b91cf601a9850", "d73027fc8d59fee08bffffbfd9ef8b91cf601a9850", "d73027f46d43fdae61fee08bd9ef8ba6d96a66bd631a9850", "d73027f46d43fdae61fee08bffffbfd9ef8ba6d96a66bd631a9850", "a50026d73027f46d43fdae61fee08bd9ef8ba6d96a66bd631a9850006837", "a50026d73027f46d43fdae61fee08bffffbfd9ef8ba6d96a66bd631a9850006837").map(colors2);
var RdYlGn = ramp(scheme$7);
var scheme$8 = new Array(3).concat("fc8d59ffffbf99d594", "d7191cfdae61abdda42b83ba", "d7191cfdae61ffffbfabdda42b83ba", "d53e4ffc8d59fee08be6f59899d5943288bd", "d53e4ffc8d59fee08bffffbfe6f59899d5943288bd", "d53e4ff46d43fdae61fee08be6f598abdda466c2a53288bd", "d53e4ff46d43fdae61fee08bffffbfe6f598abdda466c2a53288bd", "9e0142d53e4ff46d43fdae61fee08be6f598abdda466c2a53288bd5e4fa2", "9e0142d53e4ff46d43fdae61fee08bffffbfe6f598abdda466c2a53288bd5e4fa2").map(colors2);
var Spectral = ramp(scheme$8);
var scheme$9 = new Array(3).concat("e5f5f999d8c92ca25f", "edf8fbb2e2e266c2a4238b45", "edf8fbb2e2e266c2a42ca25f006d2c", "edf8fbccece699d8c966c2a42ca25f006d2c", "edf8fbccece699d8c966c2a441ae76238b45005824", "f7fcfde5f5f9ccece699d8c966c2a441ae76238b45005824", "f7fcfde5f5f9ccece699d8c966c2a441ae76238b45006d2c00441b").map(colors2);
var BuGn = ramp(scheme$9);
var scheme$a = new Array(3).concat("e0ecf49ebcda8856a7", "edf8fbb3cde38c96c688419d", "edf8fbb3cde38c96c68856a7810f7c", "edf8fbbfd3e69ebcda8c96c68856a7810f7c", "edf8fbbfd3e69ebcda8c96c68c6bb188419d6e016b", "f7fcfde0ecf4bfd3e69ebcda8c96c68c6bb188419d6e016b", "f7fcfde0ecf4bfd3e69ebcda8c96c68c6bb188419d810f7c4d004b").map(colors2);
var BuPu = ramp(scheme$a);
var scheme$b = new Array(3).concat("e0f3dba8ddb543a2ca", "f0f9e8bae4bc7bccc42b8cbe", "f0f9e8bae4bc7bccc443a2ca0868ac", "f0f9e8ccebc5a8ddb57bccc443a2ca0868ac", "f0f9e8ccebc5a8ddb57bccc44eb3d32b8cbe08589e", "f7fcf0e0f3dbccebc5a8ddb57bccc44eb3d32b8cbe08589e", "f7fcf0e0f3dbccebc5a8ddb57bccc44eb3d32b8cbe0868ac084081").map(colors2);
var GnBu = ramp(scheme$b);
var scheme$c = new Array(3).concat("fee8c8fdbb84e34a33", "fef0d9fdcc8afc8d59d7301f", "fef0d9fdcc8afc8d59e34a33b30000", "fef0d9fdd49efdbb84fc8d59e34a33b30000", "fef0d9fdd49efdbb84fc8d59ef6548d7301f990000", "fff7ecfee8c8fdd49efdbb84fc8d59ef6548d7301f990000", "fff7ecfee8c8fdd49efdbb84fc8d59ef6548d7301fb300007f0000").map(colors2);
var OrRd = ramp(scheme$c);
var scheme$d = new Array(3).concat("ece2f0a6bddb1c9099", "f6eff7bdc9e167a9cf02818a", "f6eff7bdc9e167a9cf1c9099016c59", "f6eff7d0d1e6a6bddb67a9cf1c9099016c59", "f6eff7d0d1e6a6bddb67a9cf3690c002818a016450", "fff7fbece2f0d0d1e6a6bddb67a9cf3690c002818a016450", "fff7fbece2f0d0d1e6a6bddb67a9cf3690c002818a016c59014636").map(colors2);
var PuBuGn = ramp(scheme$d);
var scheme$e = new Array(3).concat("ece7f2a6bddb2b8cbe", "f1eef6bdc9e174a9cf0570b0", "f1eef6bdc9e174a9cf2b8cbe045a8d", "f1eef6d0d1e6a6bddb74a9cf2b8cbe045a8d", "f1eef6d0d1e6a6bddb74a9cf3690c00570b0034e7b", "fff7fbece7f2d0d1e6a6bddb74a9cf3690c00570b0034e7b", "fff7fbece7f2d0d1e6a6bddb74a9cf3690c00570b0045a8d023858").map(colors2);
var PuBu = ramp(scheme$e);
var scheme$f = new Array(3).concat("e7e1efc994c7dd1c77", "f1eef6d7b5d8df65b0ce1256", "f1eef6d7b5d8df65b0dd1c77980043", "f1eef6d4b9dac994c7df65b0dd1c77980043", "f1eef6d4b9dac994c7df65b0e7298ace125691003f", "f7f4f9e7e1efd4b9dac994c7df65b0e7298ace125691003f", "f7f4f9e7e1efd4b9dac994c7df65b0e7298ace125698004367001f").map(colors2);
var PuRd = ramp(scheme$f);
var scheme$g = new Array(3).concat("fde0ddfa9fb5c51b8a", "feebe2fbb4b9f768a1ae017e", "feebe2fbb4b9f768a1c51b8a7a0177", "feebe2fcc5c0fa9fb5f768a1c51b8a7a0177", "feebe2fcc5c0fa9fb5f768a1dd3497ae017e7a0177", "fff7f3fde0ddfcc5c0fa9fb5f768a1dd3497ae017e7a0177", "fff7f3fde0ddfcc5c0fa9fb5f768a1dd3497ae017e7a017749006a").map(colors2);
var RdPu = ramp(scheme$g);
var scheme$h = new Array(3).concat("edf8b17fcdbb2c7fb8", "ffffcca1dab441b6c4225ea8", "ffffcca1dab441b6c42c7fb8253494", "ffffccc7e9b47fcdbb41b6c42c7fb8253494", "ffffccc7e9b47fcdbb41b6c41d91c0225ea80c2c84", "ffffd9edf8b1c7e9b47fcdbb41b6c41d91c0225ea80c2c84", "ffffd9edf8b1c7e9b47fcdbb41b6c41d91c0225ea8253494081d58").map(colors2);
var YlGnBu = ramp(scheme$h);
var scheme$i = new Array(3).concat("f7fcb9addd8e31a354", "ffffccc2e69978c679238443", "ffffccc2e69978c67931a354006837", "ffffccd9f0a3addd8e78c67931a354006837", "ffffccd9f0a3addd8e78c67941ab5d238443005a32", "ffffe5f7fcb9d9f0a3addd8e78c67941ab5d238443005a32", "ffffe5f7fcb9d9f0a3addd8e78c67941ab5d238443006837004529").map(colors2);
var YlGn = ramp(scheme$i);
var scheme$j = new Array(3).concat("fff7bcfec44fd95f0e", "ffffd4fed98efe9929cc4c02", "ffffd4fed98efe9929d95f0e993404", "ffffd4fee391fec44ffe9929d95f0e993404", "ffffd4fee391fec44ffe9929ec7014cc4c028c2d04", "ffffe5fff7bcfee391fec44ffe9929ec7014cc4c028c2d04", "ffffe5fff7bcfee391fec44ffe9929ec7014cc4c02993404662506").map(colors2);
var YlOrBr = ramp(scheme$j);
var scheme$k = new Array(3).concat("ffeda0feb24cf03b20", "ffffb2fecc5cfd8d3ce31a1c", "ffffb2fecc5cfd8d3cf03b20bd0026", "ffffb2fed976feb24cfd8d3cf03b20bd0026", "ffffb2fed976feb24cfd8d3cfc4e2ae31a1cb10026", "ffffccffeda0fed976feb24cfd8d3cfc4e2ae31a1cb10026", "ffffccffeda0fed976feb24cfd8d3cfc4e2ae31a1cbd0026800026").map(colors2);
var YlOrRd = ramp(scheme$k);
var scheme$l = new Array(3).concat("deebf79ecae13182bd", "eff3ffbdd7e76baed62171b5", "eff3ffbdd7e76baed63182bd08519c", "eff3ffc6dbef9ecae16baed63182bd08519c", "eff3ffc6dbef9ecae16baed64292c62171b5084594", "f7fbffdeebf7c6dbef9ecae16baed64292c62171b5084594", "f7fbffdeebf7c6dbef9ecae16baed64292c62171b508519c08306b").map(colors2);
var Blues = ramp(scheme$l);
var scheme$m = new Array(3).concat("e5f5e0a1d99b31a354", "edf8e9bae4b374c476238b45", "edf8e9bae4b374c47631a354006d2c", "edf8e9c7e9c0a1d99b74c47631a354006d2c", "edf8e9c7e9c0a1d99b74c47641ab5d238b45005a32", "f7fcf5e5f5e0c7e9c0a1d99b74c47641ab5d238b45005a32", "f7fcf5e5f5e0c7e9c0a1d99b74c47641ab5d238b45006d2c00441b").map(colors2);
var Greens = ramp(scheme$m);
var scheme$n = new Array(3).concat("f0f0f0bdbdbd636363", "f7f7f7cccccc969696525252", "f7f7f7cccccc969696636363252525", "f7f7f7d9d9d9bdbdbd969696636363252525", "f7f7f7d9d9d9bdbdbd969696737373525252252525", "fffffff0f0f0d9d9d9bdbdbd969696737373525252252525", "fffffff0f0f0d9d9d9bdbdbd969696737373525252252525000000").map(colors2);
var Greys = ramp(scheme$n);
var scheme$o = new Array(3).concat("efedf5bcbddc756bb1", "f2f0f7cbc9e29e9ac86a51a3", "f2f0f7cbc9e29e9ac8756bb154278f", "f2f0f7dadaebbcbddc9e9ac8756bb154278f", "f2f0f7dadaebbcbddc9e9ac8807dba6a51a34a1486", "fcfbfdefedf5dadaebbcbddc9e9ac8807dba6a51a34a1486", "fcfbfdefedf5dadaebbcbddc9e9ac8807dba6a51a354278f3f007d").map(colors2);
var Purples = ramp(scheme$o);
var scheme$p = new Array(3).concat("fee0d2fc9272de2d26", "fee5d9fcae91fb6a4acb181d", "fee5d9fcae91fb6a4ade2d26a50f15", "fee5d9fcbba1fc9272fb6a4ade2d26a50f15", "fee5d9fcbba1fc9272fb6a4aef3b2ccb181d99000d", "fff5f0fee0d2fcbba1fc9272fb6a4aef3b2ccb181d99000d", "fff5f0fee0d2fcbba1fc9272fb6a4aef3b2ccb181da50f1567000d").map(colors2);
var Reds = ramp(scheme$p);
var scheme$q = new Array(3).concat("fee6cefdae6be6550d", "feeddefdbe85fd8d3cd94701", "feeddefdbe85fd8d3ce6550da63603", "feeddefdd0a2fdae6bfd8d3ce6550da63603", "feeddefdd0a2fdae6bfd8d3cf16913d948018c2d04", "fff5ebfee6cefdd0a2fdae6bfd8d3cf16913d948018c2d04", "fff5ebfee6cefdd0a2fdae6bfd8d3cf16913d94801a636037f2704").map(colors2);
var Oranges = ramp(scheme$q);
function cividis(t) {
  t = Math.max(0, Math.min(1, t));
  return "rgb(" + Math.max(0, Math.min(255, Math.round(-4.54 - t * (35.34 - t * (2381.73 - t * (6402.7 - t * (7024.72 - t * 2710.57))))))) + ", " + Math.max(0, Math.min(255, Math.round(32.49 + t * (170.73 + t * (52.82 - t * (131.46 - t * (176.58 - t * 67.37))))))) + ", " + Math.max(0, Math.min(255, Math.round(81.24 + t * (442.36 - t * (2482.43 - t * (6167.24 - t * (6614.94 - t * 2475.67))))))) + ")";
}
var cubehelix$2 = cubehelixLong(cubehelix(300, 0.5, 0), cubehelix(-240, 0.5, 1));
var warm = cubehelixLong(cubehelix(-100, 0.75, 0.35), cubehelix(80, 1.5, 0.8));
var cool = cubehelixLong(cubehelix(260, 0.75, 0.35), cubehelix(80, 1.5, 0.8));
var c = cubehelix();
function rainbow(t) {
  if (t < 0 || t > 1)
    t -= Math.floor(t);
  var ts = Math.abs(t - 0.5);
  c.h = 360 * t - 100;
  c.s = 1.5 - 1.5 * ts;
  c.l = 0.8 - 0.9 * ts;
  return c + "";
}
var c$1 = rgb();
var pi_1_3 = Math.PI / 3;
var pi_2_3 = Math.PI * 2 / 3;
function sinebow(t) {
  var x;
  t = (0.5 - t) * Math.PI;
  c$1.r = 255 * (x = Math.sin(t)) * x;
  c$1.g = 255 * (x = Math.sin(t + pi_1_3)) * x;
  c$1.b = 255 * (x = Math.sin(t + pi_2_3)) * x;
  return c$1 + "";
}
function turbo(t) {
  t = Math.max(0, Math.min(1, t));
  return "rgb(" + Math.max(0, Math.min(255, Math.round(34.61 + t * (1172.33 - t * (10793.56 - t * (33300.12 - t * (38394.49 - t * 14825.05))))))) + ", " + Math.max(0, Math.min(255, Math.round(23.31 + t * (557.33 + t * (1225.33 - t * (3574.96 - t * (1073.77 + t * 707.56))))))) + ", " + Math.max(0, Math.min(255, Math.round(27.2 + t * (3211.1 - t * (15327.97 - t * (27814 - t * (22569.18 - t * 6838.66))))))) + ")";
}
function ramp$1(range) {
  var n = range.length;
  return function(t) {
    return range[Math.max(0, Math.min(n - 1, Math.floor(t * n)))];
  };
}
var viridis = ramp$1(colors2("44015444025645045745055946075a46085c460a5d460b5e470d60470e6147106347116447136548146748166848176948186a481a6c481b6d481c6e481d6f481f70482071482173482374482475482576482677482878482979472a7a472c7a472d7b472e7c472f7d46307e46327e46337f463480453581453781453882443983443a83443b84433d84433e85423f854240864241864142874144874045884046883f47883f48893e49893e4a893e4c8a3d4d8a3d4e8a3c4f8a3c508b3b518b3b528b3a538b3a548c39558c39568c38588c38598c375a8c375b8d365c8d365d8d355e8d355f8d34608d34618d33628d33638d32648e32658e31668e31678e31688e30698e306a8e2f6b8e2f6c8e2e6d8e2e6e8e2e6f8e2d708e2d718e2c718e2c728e2c738e2b748e2b758e2a768e2a778e2a788e29798e297a8e297b8e287c8e287d8e277e8e277f8e27808e26818e26828e26828e25838e25848e25858e24868e24878e23888e23898e238a8d228b8d228c8d228d8d218e8d218f8d21908d21918c20928c20928c20938c1f948c1f958b1f968b1f978b1f988b1f998a1f9a8a1e9b8a1e9c891e9d891f9e891f9f881fa0881fa1881fa1871fa28720a38620a48621a58521a68522a78522a88423a98324aa8325ab8225ac8226ad8127ad8128ae8029af7f2ab07f2cb17e2db27d2eb37c2fb47c31b57b32b67a34b67935b77937b87838b9773aba763bbb753dbc743fbc7340bd7242be7144bf7046c06f48c16e4ac16d4cc26c4ec36b50c46a52c56954c56856c66758c7655ac8645cc8635ec96260ca6063cb5f65cb5e67cc5c69cd5b6ccd5a6ece5870cf5773d05675d05477d1537ad1517cd2507fd34e81d34d84d44b86d54989d5488bd6468ed64590d74393d74195d84098d83e9bd93c9dd93ba0da39a2da37a5db36a8db34aadc32addc30b0dd2fb2dd2db5de2bb8de29bade28bddf26c0df25c2df23c5e021c8e020cae11fcde11dd0e11cd2e21bd5e21ad8e219dae319dde318dfe318e2e418e5e419e7e419eae51aece51befe51cf1e51df4e61ef6e620f8e621fbe723fde725"));
var magma = ramp$1(colors2("00000401000501010601010802010902020b02020d03030f03031204041405041606051806051a07061c08071e0907200a08220b09240c09260d0a290e0b2b100b2d110c2f120d31130d34140e36150e38160f3b180f3d19103f1a10421c10441d11471e114920114b21114e22115024125325125527125829115a2a115c2c115f2d11612f116331116533106734106936106b38106c390f6e3b0f703d0f713f0f72400f74420f75440f764510774710784910784a10794c117a4e117b4f127b51127c52137c54137d56147d57157e59157e5a167e5c167f5d177f5f187f601880621980641a80651a80671b80681c816a1c816b1d816d1d816e1e81701f81721f817320817521817621817822817922827b23827c23827e24828025828125818326818426818627818827818928818b29818c29818e2a81902a81912b81932b80942c80962c80982d80992d809b2e7f9c2e7f9e2f7fa02f7fa1307ea3307ea5317ea6317da8327daa337dab337cad347cae347bb0357bb2357bb3367ab5367ab73779b83779ba3878bc3978bd3977bf3a77c03a76c23b75c43c75c53c74c73d73c83e73ca3e72cc3f71cd4071cf4070d0416fd2426fd3436ed5446dd6456cd8456cd9466bdb476adc4869de4968df4a68e04c67e24d66e34e65e44f64e55064e75263e85362e95462ea5661eb5760ec5860ed5a5fee5b5eef5d5ef05f5ef1605df2625df2645cf3655cf4675cf4695cf56b5cf66c5cf66e5cf7705cf7725cf8745cf8765cf9785df9795df97b5dfa7d5efa7f5efa815ffb835ffb8560fb8761fc8961fc8a62fc8c63fc8e64fc9065fd9266fd9467fd9668fd9869fd9a6afd9b6bfe9d6cfe9f6dfea16efea36ffea571fea772fea973feaa74feac76feae77feb078feb27afeb47bfeb67cfeb77efeb97ffebb81febd82febf84fec185fec287fec488fec68afec88cfeca8dfecc8ffecd90fecf92fed194fed395fed597fed799fed89afdda9cfddc9efddea0fde0a1fde2a3fde3a5fde5a7fde7a9fde9aafdebacfcecaefceeb0fcf0b2fcf2b4fcf4b6fcf6b8fcf7b9fcf9bbfcfbbdfcfdbf"));
var inferno = ramp$1(colors2("00000401000501010601010802010a02020c02020e03021004031204031405041706041907051b08051d09061f0a07220b07240c08260d08290e092b10092d110a30120a32140b34150b37160b39180c3c190c3e1b0c411c0c431e0c451f0c48210c4a230c4c240c4f260c51280b53290b552b0b572d0b592f0a5b310a5c320a5e340a5f3609613809623909633b09643d09653e0966400a67420a68440a68450a69470b6a490b6a4a0c6b4c0c6b4d0d6c4f0d6c510e6c520e6d540f6d550f6d57106e59106e5a116e5c126e5d126e5f136e61136e62146e64156e65156e67166e69166e6a176e6c186e6d186e6f196e71196e721a6e741a6e751b6e771c6d781c6d7a1d6d7c1d6d7d1e6d7f1e6c801f6c82206c84206b85216b87216b88226a8a226a8c23698d23698f24699025689225689326679526679727669827669a28659b29649d29649f2a63a02a63a22b62a32c61a52c60a62d60a82e5fa92e5eab2f5ead305dae305cb0315bb1325ab3325ab43359b63458b73557b93556ba3655bc3754bd3853bf3952c03a51c13a50c33b4fc43c4ec63d4dc73e4cc83f4bca404acb4149cc4248ce4347cf4446d04545d24644d34743d44842d54a41d74b3fd84c3ed94d3dda4e3cdb503bdd513ade5238df5337e05536e15635e25734e35933e45a31e55c30e65d2fe75e2ee8602de9612bea632aeb6429eb6628ec6726ed6925ee6a24ef6c23ef6e21f06f20f1711ff1731df2741cf3761bf37819f47918f57b17f57d15f67e14f68013f78212f78410f8850ff8870ef8890cf98b0bf98c0af98e09fa9008fa9207fa9407fb9606fb9706fb9906fb9b06fb9d07fc9f07fca108fca309fca50afca60cfca80dfcaa0ffcac11fcae12fcb014fcb216fcb418fbb61afbb81dfbba1ffbbc21fbbe23fac026fac228fac42afac62df9c72ff9c932f9cb35f8cd37f8cf3af7d13df7d340f6d543f6d746f5d949f5db4cf4dd4ff4df53f4e156f3e35af3e55df2e661f2e865f2ea69f1ec6df1ed71f1ef75f1f179f2f27df2f482f3f586f3f68af4f88ef5f992f6fa96f8fb9af9fc9dfafda1fcffa4"));
var plasma = ramp$1(colors2("0d088710078813078916078a19068c1b068d1d068e20068f2206902406912605912805922a05932c05942e05952f059631059733059735049837049938049a3a049a3c049b3e049c3f049c41049d43039e44039e46039f48039f4903a04b03a14c02a14e02a25002a25102a35302a35502a45601a45801a45901a55b01a55c01a65e01a66001a66100a76300a76400a76600a76700a86900a86a00a86c00a86e00a86f00a87100a87201a87401a87501a87701a87801a87a02a87b02a87d03a87e03a88004a88104a78305a78405a78606a68707a68808a68a09a58b0aa58d0ba58e0ca48f0da4910ea3920fa39410a29511a19613a19814a099159f9a169f9c179e9d189d9e199da01a9ca11b9ba21d9aa31e9aa51f99a62098a72197a82296aa2395ab2494ac2694ad2793ae2892b02991b12a90b22b8fb32c8eb42e8db52f8cb6308bb7318ab83289ba3388bb3488bc3587bd3786be3885bf3984c03a83c13b82c23c81c33d80c43e7fc5407ec6417dc7427cc8437bc9447aca457acb4679cc4778cc4977cd4a76ce4b75cf4c74d04d73d14e72d24f71d35171d45270d5536fd5546ed6556dd7566cd8576bd9586ada5a6ada5b69db5c68dc5d67dd5e66de5f65de6164df6263e06363e16462e26561e26660e3685fe4695ee56a5de56b5de66c5ce76e5be76f5ae87059e97158e97257ea7457eb7556eb7655ec7754ed7953ed7a52ee7b51ef7c51ef7e50f07f4ff0804ef1814df1834cf2844bf3854bf3874af48849f48948f58b47f58c46f68d45f68f44f79044f79143f79342f89441f89540f9973ff9983ef99a3efa9b3dfa9c3cfa9e3bfb9f3afba139fba238fca338fca537fca636fca835fca934fdab33fdac33fdae32fdaf31fdb130fdb22ffdb42ffdb52efeb72dfeb82cfeba2cfebb2bfebd2afebe2afec029fdc229fdc328fdc527fdc627fdc827fdca26fdcb26fccd25fcce25fcd025fcd225fbd324fbd524fbd724fad824fada24f9dc24f9dd25f8df25f8e125f7e225f7e425f6e626f6e826f5e926f5eb27f4ed27f3ee27f3f027f2f227f1f426f1f525f0f724f0f921"));

// build/_snowpack/pkg/d3-scale.js
var InternMap = class extends Map {
  constructor(entries, key = keyof) {
    super();
    Object.defineProperties(this, {_intern: {value: new Map()}, _key: {value: key}});
    if (entries != null)
      for (const [key2, value] of entries)
        this.set(key2, value);
  }
  get(key) {
    return super.get(intern_get(this, key));
  }
  has(key) {
    return super.has(intern_get(this, key));
  }
  set(key, value) {
    return super.set(intern_set(this, key), value);
  }
  delete(key) {
    return super.delete(intern_delete(this, key));
  }
};
function intern_get({_intern, _key}, value) {
  const key = _key(value);
  return _intern.has(key) ? _intern.get(key) : value;
}
function intern_set({_intern, _key}, value) {
  const key = _key(value);
  if (_intern.has(key))
    return _intern.get(key);
  _intern.set(key, value);
  return value;
}
function intern_delete({_intern, _key}, value) {
  const key = _key(value);
  if (_intern.has(key)) {
    value = _intern.get(value);
    _intern.delete(key);
  }
  return value;
}
function keyof(value) {
  return value !== null && typeof value === "object" ? value.valueOf() : value;
}
var e10 = Math.sqrt(50);
var e5 = Math.sqrt(10);
var e2 = Math.sqrt(2);
function ticks(start2, stop, count) {
  var reverse, i = -1, n, ticks2, step;
  stop = +stop, start2 = +start2, count = +count;
  if (start2 === stop && count > 0)
    return [start2];
  if (reverse = stop < start2)
    n = start2, start2 = stop, stop = n;
  if ((step = tickIncrement(start2, stop, count)) === 0 || !isFinite(step))
    return [];
  if (step > 0) {
    let r0 = Math.round(start2 / step), r1 = Math.round(stop / step);
    if (r0 * step < start2)
      ++r0;
    if (r1 * step > stop)
      --r1;
    ticks2 = new Array(n = r1 - r0 + 1);
    while (++i < n)
      ticks2[i] = (r0 + i) * step;
  } else {
    step = -step;
    let r0 = Math.round(start2 * step), r1 = Math.round(stop * step);
    if (r0 / step < start2)
      ++r0;
    if (r1 / step > stop)
      --r1;
    ticks2 = new Array(n = r1 - r0 + 1);
    while (++i < n)
      ticks2[i] = (r0 + i) / step;
  }
  if (reverse)
    ticks2.reverse();
  return ticks2;
}
function tickIncrement(start2, stop, count) {
  var step = (stop - start2) / Math.max(0, count), power = Math.floor(Math.log(step) / Math.LN10), error = step / Math.pow(10, power);
  return power >= 0 ? (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1) * Math.pow(10, power) : -Math.pow(10, -power) / (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1);
}
function tickStep(start2, stop, count) {
  var step0 = Math.abs(stop - start2) / Math.max(0, count), step1 = Math.pow(10, Math.floor(Math.log(step0) / Math.LN10)), error = step0 / step1;
  if (error >= e10)
    step1 *= 10;
  else if (error >= e5)
    step1 *= 5;
  else if (error >= e2)
    step1 *= 2;
  return stop < start2 ? -step1 : step1;
}
function initRange(domain, range) {
  switch (arguments.length) {
    case 0:
      break;
    case 1:
      this.range(domain);
      break;
    default:
      this.range(range).domain(domain);
      break;
  }
  return this;
}
function initInterpolator(domain, interpolator) {
  switch (arguments.length) {
    case 0:
      break;
    case 1: {
      if (typeof domain === "function")
        this.interpolator(domain);
      else
        this.range(domain);
      break;
    }
    default: {
      this.domain(domain);
      if (typeof interpolator === "function")
        this.interpolator(interpolator);
      else
        this.range(interpolator);
      break;
    }
  }
  return this;
}
var implicit = Symbol("implicit");
function ordinal() {
  var index = new InternMap(), domain = [], range = [], unknown = implicit;
  function scale(d) {
    let i = index.get(d);
    if (i === void 0) {
      if (unknown !== implicit)
        return unknown;
      index.set(d, i = domain.push(d) - 1);
    }
    return range[i % range.length];
  }
  scale.domain = function(_) {
    if (!arguments.length)
      return domain.slice();
    domain = [], index = new InternMap();
    for (const value of _) {
      if (index.has(value))
        continue;
      index.set(value, domain.push(value) - 1);
    }
    return scale;
  };
  scale.range = function(_) {
    return arguments.length ? (range = Array.from(_), scale) : range.slice();
  };
  scale.unknown = function(_) {
    return arguments.length ? (unknown = _, scale) : unknown;
  };
  scale.copy = function() {
    return ordinal(domain, range).unknown(unknown);
  };
  initRange.apply(scale, arguments);
  return scale;
}
function numberArray(a, b) {
  if (!b)
    b = [];
  var n = a ? Math.min(b.length, a.length) : 0, c2 = b.slice(), i;
  return function(t) {
    for (i = 0; i < n; ++i)
      c2[i] = a[i] * (1 - t) + b[i] * t;
    return c2;
  };
}
function isNumberArray(x) {
  return ArrayBuffer.isView(x) && !(x instanceof DataView);
}
function genericArray(a, b) {
  var nb = b ? b.length : 0, na = a ? Math.min(nb, a.length) : 0, x = new Array(na), c2 = new Array(nb), i;
  for (i = 0; i < na; ++i)
    x[i] = interpolate2(a[i], b[i]);
  for (; i < nb; ++i)
    c2[i] = b[i];
  return function(t) {
    for (i = 0; i < na; ++i)
      c2[i] = x[i](t);
    return c2;
  };
}
function date(a, b) {
  var d = new Date();
  return a = +a, b = +b, function(t) {
    return d.setTime(a * (1 - t) + b * t), d;
  };
}
function object(a, b) {
  var i = {}, c2 = {}, k;
  if (a === null || typeof a !== "object")
    a = {};
  if (b === null || typeof b !== "object")
    b = {};
  for (k in b) {
    if (k in a) {
      i[k] = interpolate2(a[k], b[k]);
    } else {
      c2[k] = b[k];
    }
  }
  return function(t) {
    for (k in i)
      c2[k] = i[k](t);
    return c2;
  };
}
function interpolate2(a, b) {
  var t = typeof b, c2;
  return b == null || t === "boolean" ? constant2(b) : (t === "number" ? interpolateNumber : t === "string" ? (c2 = color(b)) ? (b = c2, interpolateRgb) : interpolateString : b instanceof color ? interpolateRgb : b instanceof Date ? date : isNumberArray(b) ? numberArray : Array.isArray(b) ? genericArray : typeof b.valueOf !== "function" && typeof b.toString !== "function" || isNaN(b) ? object : interpolateNumber)(a, b);
}
function interpolateRound(a, b) {
  return a = +a, b = +b, function(t) {
    return Math.round(a * (1 - t) + b * t);
  };
}
function identity2(x) {
  return x;
}
function formatDecimal(x) {
  return Math.abs(x = Math.round(x)) >= 1e21 ? x.toLocaleString("en").replace(/,/g, "") : x.toString(10);
}
function formatDecimalParts(x, p) {
  if ((i = (x = p ? x.toExponential(p - 1) : x.toExponential()).indexOf("e")) < 0)
    return null;
  var i, coefficient = x.slice(0, i);
  return [
    coefficient.length > 1 ? coefficient[0] + coefficient.slice(2) : coefficient,
    +x.slice(i + 1)
  ];
}
function exponent(x) {
  return x = formatDecimalParts(Math.abs(x)), x ? x[1] : NaN;
}
function formatGroup(grouping, thousands) {
  return function(value, width) {
    var i = value.length, t = [], j = 0, g = grouping[0], length2 = 0;
    while (i > 0 && g > 0) {
      if (length2 + g + 1 > width)
        g = Math.max(1, width - length2);
      t.push(value.substring(i -= g, i + g));
      if ((length2 += g + 1) > width)
        break;
      g = grouping[j = (j + 1) % grouping.length];
    }
    return t.reverse().join(thousands);
  };
}
function formatNumerals(numerals) {
  return function(value) {
    return value.replace(/[0-9]/g, function(i) {
      return numerals[+i];
    });
  };
}
var re = /^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;
function formatSpecifier(specifier) {
  if (!(match = re.exec(specifier)))
    throw new Error("invalid format: " + specifier);
  var match;
  return new FormatSpecifier({
    fill: match[1],
    align: match[2],
    sign: match[3],
    symbol: match[4],
    zero: match[5],
    width: match[6],
    comma: match[7],
    precision: match[8] && match[8].slice(1),
    trim: match[9],
    type: match[10]
  });
}
formatSpecifier.prototype = FormatSpecifier.prototype;
function FormatSpecifier(specifier) {
  this.fill = specifier.fill === void 0 ? " " : specifier.fill + "";
  this.align = specifier.align === void 0 ? ">" : specifier.align + "";
  this.sign = specifier.sign === void 0 ? "-" : specifier.sign + "";
  this.symbol = specifier.symbol === void 0 ? "" : specifier.symbol + "";
  this.zero = !!specifier.zero;
  this.width = specifier.width === void 0 ? void 0 : +specifier.width;
  this.comma = !!specifier.comma;
  this.precision = specifier.precision === void 0 ? void 0 : +specifier.precision;
  this.trim = !!specifier.trim;
  this.type = specifier.type === void 0 ? "" : specifier.type + "";
}
FormatSpecifier.prototype.toString = function() {
  return this.fill + this.align + this.sign + this.symbol + (this.zero ? "0" : "") + (this.width === void 0 ? "" : Math.max(1, this.width | 0)) + (this.comma ? "," : "") + (this.precision === void 0 ? "" : "." + Math.max(0, this.precision | 0)) + (this.trim ? "~" : "") + this.type;
};
function formatTrim(s) {
  out:
    for (var n = s.length, i = 1, i0 = -1, i1; i < n; ++i) {
      switch (s[i]) {
        case ".":
          i0 = i1 = i;
          break;
        case "0":
          if (i0 === 0)
            i0 = i;
          i1 = i;
          break;
        default:
          if (!+s[i])
            break out;
          if (i0 > 0)
            i0 = 0;
          break;
      }
    }
  return i0 > 0 ? s.slice(0, i0) + s.slice(i1 + 1) : s;
}
var prefixExponent;
function formatPrefixAuto(x, p) {
  var d = formatDecimalParts(x, p);
  if (!d)
    return x + "";
  var coefficient = d[0], exponent2 = d[1], i = exponent2 - (prefixExponent = Math.max(-8, Math.min(8, Math.floor(exponent2 / 3))) * 3) + 1, n = coefficient.length;
  return i === n ? coefficient : i > n ? coefficient + new Array(i - n + 1).join("0") : i > 0 ? coefficient.slice(0, i) + "." + coefficient.slice(i) : "0." + new Array(1 - i).join("0") + formatDecimalParts(x, Math.max(0, p + i - 1))[0];
}
function formatRounded(x, p) {
  var d = formatDecimalParts(x, p);
  if (!d)
    return x + "";
  var coefficient = d[0], exponent2 = d[1];
  return exponent2 < 0 ? "0." + new Array(-exponent2).join("0") + coefficient : coefficient.length > exponent2 + 1 ? coefficient.slice(0, exponent2 + 1) + "." + coefficient.slice(exponent2 + 1) : coefficient + new Array(exponent2 - coefficient.length + 2).join("0");
}
var formatTypes = {
  "%": (x, p) => (x * 100).toFixed(p),
  b: (x) => Math.round(x).toString(2),
  c: (x) => x + "",
  d: formatDecimal,
  e: (x, p) => x.toExponential(p),
  f: (x, p) => x.toFixed(p),
  g: (x, p) => x.toPrecision(p),
  o: (x) => Math.round(x).toString(8),
  p: (x, p) => formatRounded(x * 100, p),
  r: formatRounded,
  s: formatPrefixAuto,
  X: (x) => Math.round(x).toString(16).toUpperCase(),
  x: (x) => Math.round(x).toString(16)
};
function identity$12(x) {
  return x;
}
var map = Array.prototype.map;
var prefixes = ["y", "z", "a", "f", "p", "n", "µ", "m", "", "k", "M", "G", "T", "P", "E", "Z", "Y"];
function formatLocale(locale2) {
  var group = locale2.grouping === void 0 || locale2.thousands === void 0 ? identity$12 : formatGroup(map.call(locale2.grouping, Number), locale2.thousands + ""), currencyPrefix = locale2.currency === void 0 ? "" : locale2.currency[0] + "", currencySuffix = locale2.currency === void 0 ? "" : locale2.currency[1] + "", decimal = locale2.decimal === void 0 ? "." : locale2.decimal + "", numerals = locale2.numerals === void 0 ? identity$12 : formatNumerals(map.call(locale2.numerals, String)), percent = locale2.percent === void 0 ? "%" : locale2.percent + "", minus = locale2.minus === void 0 ? "−" : locale2.minus + "", nan = locale2.nan === void 0 ? "NaN" : locale2.nan + "";
  function newFormat(specifier) {
    specifier = formatSpecifier(specifier);
    var fill = specifier.fill, align = specifier.align, sign = specifier.sign, symbol = specifier.symbol, zero3 = specifier.zero, width = specifier.width, comma = specifier.comma, precision = specifier.precision, trim = specifier.trim, type = specifier.type;
    if (type === "n")
      comma = true, type = "g";
    else if (!formatTypes[type])
      precision === void 0 && (precision = 12), trim = true, type = "g";
    if (zero3 || fill === "0" && align === "=")
      zero3 = true, fill = "0", align = "=";
    var prefix = symbol === "$" ? currencyPrefix : symbol === "#" && /[boxX]/.test(type) ? "0" + type.toLowerCase() : "", suffix = symbol === "$" ? currencySuffix : /[%p]/.test(type) ? percent : "";
    var formatType = formatTypes[type], maybeSuffix = /[defgprs%]/.test(type);
    precision = precision === void 0 ? 6 : /[gprs]/.test(type) ? Math.max(1, Math.min(21, precision)) : Math.max(0, Math.min(20, precision));
    function format2(value) {
      var valuePrefix = prefix, valueSuffix = suffix, i, n, c2;
      if (type === "c") {
        valueSuffix = formatType(value) + valueSuffix;
        value = "";
      } else {
        value = +value;
        var valueNegative = value < 0 || 1 / value < 0;
        value = isNaN(value) ? nan : formatType(Math.abs(value), precision);
        if (trim)
          value = formatTrim(value);
        if (valueNegative && +value === 0 && sign !== "+")
          valueNegative = false;
        valuePrefix = (valueNegative ? sign === "(" ? sign : minus : sign === "-" || sign === "(" ? "" : sign) + valuePrefix;
        valueSuffix = (type === "s" ? prefixes[8 + prefixExponent / 3] : "") + valueSuffix + (valueNegative && sign === "(" ? ")" : "");
        if (maybeSuffix) {
          i = -1, n = value.length;
          while (++i < n) {
            if (c2 = value.charCodeAt(i), 48 > c2 || c2 > 57) {
              valueSuffix = (c2 === 46 ? decimal + value.slice(i + 1) : value.slice(i)) + valueSuffix;
              value = value.slice(0, i);
              break;
            }
          }
        }
      }
      if (comma && !zero3)
        value = group(value, Infinity);
      var length2 = valuePrefix.length + value.length + valueSuffix.length, padding = length2 < width ? new Array(width - length2 + 1).join(fill) : "";
      if (comma && zero3)
        value = group(padding + value, padding.length ? width - valueSuffix.length : Infinity), padding = "";
      switch (align) {
        case "<":
          value = valuePrefix + value + valueSuffix + padding;
          break;
        case "=":
          value = valuePrefix + padding + value + valueSuffix;
          break;
        case "^":
          value = padding.slice(0, length2 = padding.length >> 1) + valuePrefix + value + valueSuffix + padding.slice(length2);
          break;
        default:
          value = padding + valuePrefix + value + valueSuffix;
          break;
      }
      return numerals(value);
    }
    format2.toString = function() {
      return specifier + "";
    };
    return format2;
  }
  function formatPrefix2(specifier, value) {
    var f = newFormat((specifier = formatSpecifier(specifier), specifier.type = "f", specifier)), e = Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3, k = Math.pow(10, -e), prefix = prefixes[8 + e / 3];
    return function(value2) {
      return f(k * value2) + prefix;
    };
  }
  return {
    format: newFormat,
    formatPrefix: formatPrefix2
  };
}
var locale;
var format;
var formatPrefix;
defaultLocale({
  thousands: ",",
  grouping: [3],
  currency: ["$", ""]
});
function defaultLocale(definition) {
  locale = formatLocale(definition);
  format = locale.format;
  formatPrefix = locale.formatPrefix;
  return locale;
}
function precisionFixed(step) {
  return Math.max(0, -exponent(Math.abs(step)));
}
function precisionPrefix(step, value) {
  return Math.max(0, Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3 - exponent(Math.abs(step)));
}
function precisionRound(step, max2) {
  step = Math.abs(step), max2 = Math.abs(max2) - step;
  return Math.max(0, exponent(max2) - exponent(step)) + 1;
}
function tickFormat(start2, stop, count, specifier) {
  var step = tickStep(start2, stop, count), precision;
  specifier = formatSpecifier(specifier == null ? ",f" : specifier);
  switch (specifier.type) {
    case "s": {
      var value = Math.max(Math.abs(start2), Math.abs(stop));
      if (specifier.precision == null && !isNaN(precision = precisionPrefix(step, value)))
        specifier.precision = precision;
      return formatPrefix(specifier, value);
    }
    case "":
    case "e":
    case "g":
    case "p":
    case "r": {
      if (specifier.precision == null && !isNaN(precision = precisionRound(step, Math.max(Math.abs(start2), Math.abs(stop)))))
        specifier.precision = precision - (specifier.type === "e");
      break;
    }
    case "f":
    case "%": {
      if (specifier.precision == null && !isNaN(precision = precisionFixed(step)))
        specifier.precision = precision - (specifier.type === "%") * 2;
      break;
    }
  }
  return format(specifier);
}
function linearish(scale) {
  var domain = scale.domain;
  scale.ticks = function(count) {
    var d = domain();
    return ticks(d[0], d[d.length - 1], count == null ? 10 : count);
  };
  scale.tickFormat = function(count, specifier) {
    var d = domain();
    return tickFormat(d[0], d[d.length - 1], count == null ? 10 : count, specifier);
  };
  scale.nice = function(count) {
    if (count == null)
      count = 10;
    var d = domain();
    var i0 = 0;
    var i1 = d.length - 1;
    var start2 = d[i0];
    var stop = d[i1];
    var prestep;
    var step;
    var maxIter = 10;
    if (stop < start2) {
      step = start2, start2 = stop, stop = step;
      step = i0, i0 = i1, i1 = step;
    }
    while (maxIter-- > 0) {
      step = tickIncrement(start2, stop, count);
      if (step === prestep) {
        d[i0] = start2;
        d[i1] = stop;
        return domain(d);
      } else if (step > 0) {
        start2 = Math.floor(start2 / step) * step;
        stop = Math.ceil(stop / step) * step;
      } else if (step < 0) {
        start2 = Math.ceil(start2 * step) / step;
        stop = Math.floor(stop * step) / step;
      } else {
        break;
      }
      prestep = step;
    }
    return scale;
  };
  return scale;
}
function transformer() {
  var x0 = 0, x1 = 1, t0, t1, k10, transform2, interpolator = identity2, clamp = false, unknown;
  function scale(x) {
    return x == null || isNaN(x = +x) ? unknown : interpolator(k10 === 0 ? 0.5 : (x = (transform2(x) - t0) * k10, clamp ? Math.max(0, Math.min(1, x)) : x));
  }
  scale.domain = function(_) {
    return arguments.length ? ([x0, x1] = _, t0 = transform2(x0 = +x0), t1 = transform2(x1 = +x1), k10 = t0 === t1 ? 0 : 1 / (t1 - t0), scale) : [x0, x1];
  };
  scale.clamp = function(_) {
    return arguments.length ? (clamp = !!_, scale) : clamp;
  };
  scale.interpolator = function(_) {
    return arguments.length ? (interpolator = _, scale) : interpolator;
  };
  function range(interpolate3) {
    return function(_) {
      var r0, r1;
      return arguments.length ? ([r0, r1] = _, interpolator = interpolate3(r0, r1), scale) : [interpolator(0), interpolator(1)];
    };
  }
  scale.range = range(interpolate2);
  scale.rangeRound = range(interpolateRound);
  scale.unknown = function(_) {
    return arguments.length ? (unknown = _, scale) : unknown;
  };
  return function(t) {
    transform2 = t, t0 = t(x0), t1 = t(x1), k10 = t0 === t1 ? 0 : 1 / (t1 - t0);
    return scale;
  };
}
function copy(source, target) {
  return target.domain(source.domain()).interpolator(source.interpolator()).clamp(source.clamp()).unknown(source.unknown());
}
function sequential() {
  var scale = linearish(transformer()(identity2));
  scale.copy = function() {
    return copy(scale, sequential());
  };
  return initInterpolator.apply(scale, arguments);
}

// build/docs/example/script.js
function sortByCount(anArray) {
  let map2 = anArray.reduce((p, c2) => {
    p.set(c2, (p.get(c2) || 0) + 1);
    return p;
  }, new Map());
  let newArray = Array.from(map2.keys()).sort((a, b) => map2.get(b) - map2.get(a));
  return newArray;
}
var queryString = window.location.search;
var urlParams = new URLSearchParams(queryString);
var networkName = "WS_10000_10_001";
if (urlParams.has("network")) {
  networkName = urlParams.get("network");
}
var use2D = false;
if (urlParams.has("use2d")) {
  use2D = true;
}
xnet_exports.loadXNETFile("networks/" + networkName + ".xnet").then(async (network) => {
  let colorProperty = "index";
  let sequencialColormap = "interpolateInferno";
  let categoricalColormap = "schemeCategory10";
  let useCategoricalColormap = false;
  let defaultOutline = 0.25;
  console.log(network);
  let nodeCount = network.nodesCount;
  let nodes = {};
  let edges = [];
  for (let index = 0; index < nodeCount; index++) {
    nodes["" + index] = {
      ID: "" + index,
      rand: "" + Math.round(Math.random() * 10)
    };
    if (network.labels) {
      nodes["" + index].label = network.labels[index];
    }
  }
  for (const [key, value] of Object.entries(network.verticesProperties)) {
    for (let index = 0; index < nodeCount; index++) {
      nodes["" + index][key.toLowerCase()] = value[index];
    }
  }
  for (let index = 0; index < network.edges.length; index++) {
    let fromIndex, toIndex;
    edges.push({
      source: "" + network.edges[index][0],
      target: "" + network.edges[index][1]
    });
  }
  let tooltipElement = document.getElementById("tooltip");
  console.log(Object.entries(d3_scale_chromatic_exports));
  let colorScale = ordinal(category10);
  let helios = new Helios({
    elementID: "netviz",
    nodes,
    edges,
    use2D
  }).onNodeHoverStart((node, event) => {
    if (event) {
      tooltipElement.style.left = event.pageX + "px";
      tooltipElement.style.top = event.pageY + "px";
    }
    if (node) {
      tooltipElement.style.display = "block";
      tooltipElement.style.color = rgb(node.color[0] * 255, node.color[1] * 255, node.color[2] * 255).darker(2).formatRgb();
      if (node.label) {
        tooltipElement.textContent = node.label;
      } else if (node.title) {
        tooltipElement.textContent = node.title;
      } else {
        tooltipElement.textContent = node.ID;
      }
      node.originalSize = node.size;
      node.size = 2 * node.originalSize;
      node.outlineWidth = 0.25 * node.originalSize;
      helios.update();
      helios.render();
    } else {
      tooltipElement.style.display = "none";
    }
  }).onNodeHoverMove((node, event) => {
    if (event) {
      tooltipElement.style.left = event.pageX + "px";
      tooltipElement.style.top = event.pageY + "px";
    }
    if (node) {
      if (node.label) {
        tooltipElement.textContent = node.label;
      } else if (node.title) {
        tooltipElement.textContent = node.title;
      } else {
        tooltipElement.textContent = node.ID;
      }
    } else {
      tooltipElement.style.display = "none";
    }
  }).onNodeHoverEnd((node, event) => {
    if (event) {
      tooltipElement.style.left = event.pageX + "px";
      tooltipElement.style.top = event.pageY + "px";
    }
    if (node) {
      node.size = 1 * node.originalSize;
      node.outlineWidth = defaultOutline * node.originalSize;
      helios.update();
      helios.render();
    }
    tooltipElement.style.display = "none";
  }).onNodeClick((node, event) => {
  }).backgroundColor([1, 1, 1, 1]).edgesIntensity(1).nodeOutlineWidth((node) => node.size * defaultOutline);
  function downloadText(filename, text) {
    var element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
    element.setAttribute("download", filename);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
  let buttonInformation = {
    Export: {
      name: "Export",
      mapColor: "#B1C3B6",
      color: "#008758",
      action: (selection2, d, event) => {
        if (event.shiftKey) {
          let pos = helios.network.positions;
          let postext = "";
          for (let i = 0; i < pos.length; i += 3) {
            postext += `${pos[i]} ${pos[i + 1]} ${pos[i + 2]}
`;
          }
          downloadText(networkName + "_positions.txt", postext);
        } else {
          console.log("Action!");
          let dpr = window.devicePixelRatio || 1;
          helios.exportFigure(networkName + ".png", {
            scale: 2,
            supersampleFactor: 2,
            backgroundColor: [1, 1, 1, 1]
          });
        }
      },
      extra: (selection2) => {
      }
    },
    Size: {
      name: "Size",
      mapColor: "#AFB9C9",
      color: "#1E6099",
      action: null,
      extra: (selection2) => {
        selection2.append("input").attr("type", "range").attr("min", "-1").attr("max", "1").attr("step", "0.1").attr("value", "0").attr("id", "nodeSizeSlider").classed("slider", true).style("min-width", "60px").on("input", (event, d) => {
          helios.nodeSize(Math.pow(10, parseFloat(select("#nodeSizeSlider").property("value"))));
          helios.nodeOutlineWidth((node) => node.size * defaultOutline);
          helios.update();
          helios.render();
          event.stopPropagation();
        });
      }
    },
    Color: {
      name: "Color",
      mapColor: "#AFB9C9",
      color: "#1E6099",
      action: null,
      extra: (selection2) => {
        selection2.append("select").attr("id", "colorSelector").classed("selector", true).style("min-width", "60px").on("change", (event, d) => {
          updateColorSelection();
        }).selectAll("option").data(Object.entries(helios.network.index2Node[0])).enter().filter((d) => !d[0].startsWith("_")).filter((d) => d[0] != "ID").append("option").attr("value", (d) => d[0]).property("selected", (d) => d[0] == colorProperty).text((d) => d[0]);
        selection2.append("select").attr("id", "colormapSelector").classed("selector", true).style("min-width", "60px");
      }
    },
    Edges: {
      name: "Edges",
      mapColor: "#B1A58C",
      color: "#903C22",
      action: null,
      extra: (selection2) => {
        console.log("CALLED");
        selection2.append("input").attr("type", "range").attr("min", "0").attr("max", "1").attr("step", 1 / 255 + "").attr("value", "1").attr("id", "edgeOpacitySlider").classed("slider", true).style("min-width", "60px").on("input", (event, d) => {
          helios.edgesIntensity(parseFloat(select("#edgeOpacitySlider").property("value")));
          helios.update();
          helios.render();
          event.stopPropagation();
        });
      }
    }
  };
  function wrapText() {
    let width = 300;
    let padding = 10;
    let self2 = select(this), textLength = self2.node().getComputedTextLength(), text = self2.text();
    while (textLength > width - 2 * padding && text.length > 0) {
      text = text.slice(0, -1);
      self2.text(text + "...");
      textLength = self2.node().getComputedTextLength();
    }
  }
  let legendView = select("body").append("svg").classed("overlay", true).attr("id", "legendView").style("left", "10px").style("top", "10px").style("pointer-events:", "none");
  let updateLegendCategorical = (property2color) => {
    legendView.selectAll("*").remove();
    let legendItems = legendView.selectAll(".legend").data(property2color.keys());
    legendView.style("width", 350 + "px").style("height", (property2color.size + 1) * 20 + "px");
    let legendEnter = legendItems.enter().append("g").classed("legend", true).attr("transform", (d, i) => "translate(0," + i * 20 + ")");
    legendEnter.append("rect");
    legendEnter.append("g").append("text");
    legendItems = legendItems.merge(legendEnter);
    legendItems.select("rect").attr("x", 0).attr("y", 0).attr("width", 30).attr("height", 15).attr("fill", (d) => property2color.get(d));
    legendItems.select("g").attr("transform", (d) => `translate(${35},${15 / 2})`).select("text").style("alignment-baseline", "central").style("font-size", "12px").append("tspan").style("alignment-baseline", "central").text((d) => d).each(wrapText);
  };
  function updateCategoricalColors() {
    let propertyArray = [];
    for (let [key, node] of Object.entries(helios.network.nodes)) {
      propertyArray.push(node[colorProperty]);
    }
    let sortedItems = sortByCount(propertyArray);
    let scheme2 = d3_scale_chromatic_exports[categoricalColormap];
    let arraysCount = scheme2.filter(Array.isArray).length;
    if (arraysCount > 0) {
      let firstIndex = scheme2.findIndex((d) => typeof d !== "undefined");
      if (typeof scheme2[sortedItems.length - 1] !== "undefined") {
        scheme2 = scheme2[sortedItems.length - 1];
      } else {
        if (sortedItems.length - 1 < firstIndex) {
          scheme2 = scheme2[firstIndex];
        } else {
          scheme2 = scheme2[scheme2.length - 1];
        }
      }
    }
    let colorMap = ordinal(scheme2);
    let property2color = new Map();
    let categoricalMap = new Map();
    sortedItems.forEach((d, i) => {
      if (i < scheme2.length) {
        property2color.set(d, colorMap(d));
        categoricalMap.set(d, scheme2[i]);
      } else {
        property2color.set(d, "#bbbbbb");
        ;
      }
    });
    if (categoricalMap.size < sortedItems.length) {
      categoricalMap.set("Other", "#bbbbbb");
    }
    helios.nodeColor((node) => {
      let color2 = rgb(property2color.get(node[colorProperty]));
      return [color2.r / 255, color2.g / 255, color2.b / 255];
    });
    helios.update();
    helios.render();
    updateLegendCategorical(categoricalMap);
  }
  function updateSequencialColors() {
    updateLegendCategorical(new Map());
    let propertyArray = [];
    let maxValue = -Infinity;
    let minValue = Infinity;
    for (let [key, node] of Object.entries(helios.network.nodes)) {
      propertyArray.push(node[colorProperty]);
      maxValue = Math.max(maxValue, node[colorProperty]);
      minValue = Math.min(minValue, node[colorProperty]);
    }
    let scheme2 = d3_scale_chromatic_exports[sequencialColormap];
    let cScale = sequential(scheme2).domain([minValue, maxValue]);
    helios.nodeColor((node) => {
      let color2 = rgb(cScale(node[colorProperty]));
      return [color2.r / 255, color2.g / 255, color2.b / 255];
    });
    helios.update();
    helios.render();
  }
  let updateColormapSelection = () => {
    if (useCategoricalColormap) {
      categoricalColormap = select("#colormapSelector").property("value");
      updateCategoricalColors();
    } else {
      sequencialColormap = select("#colormapSelector").property("value");
      updateSequencialColors();
    }
  };
  let updateColorSelection = () => {
    colorProperty = select("#colorSelector").property("value");
    let categorical = false;
    for (let [key, node] of Object.entries(helios.network.nodes)) {
      if (typeof node[colorProperty] !== "number") {
        categorical = true;
        break;
      }
    }
    useCategoricalColormap = categorical;
    console.log(categorical ? "categorical" : "continuous");
    let colormapSelector = select("#colormapSelector").classed("selector", true).style("min-width", "60px").on("change", (event, d) => {
      updateColormapSelection();
    }).selectAll("option").data(Object.entries(d3_scale_chromatic_exports).filter((d) => d[0].startsWith(categorical ? "scheme" : "interpolate"))).join("option").attr("value", (d) => d[0]).property("selected", (d) => d[0] == (categorical ? categoricalColormap : sequencialColormap)).text((d) => d[0].replace("interpolate", "").replace("scheme", ""));
    updateColormapSelection();
  };
  let buttonOrder = ["Export", "Size", "Color", "Edges"];
  select("#selectionmenu").selectAll("span.menuEntry").data(buttonOrder).enter().append("span").classed("menuEntry", true).style("--color", (d) => buttonInformation[d].color).text((d) => buttonInformation[d].name).each(function(d) {
    select(this).call(buttonInformation[d].extra);
  });
  select("#selectionmenu").selectAll("span.menuEntry").filter((d) => buttonInformation[d].action != null).on("click", (event, d) => {
    if (buttonInformation[d].action) {
      buttonInformation[d].action(select(void 0), d, event);
    }
  }).classed("hasAction", true);
  helios.onReady(() => {
    updateColorSelection();
    if (helios.network.nodes.length > 1e5) {
      helios.stopLayout();
      helios.zoomFactor(0.25);
    } else {
      helios.zoomFactor(0.05);
      helios.zoomFactor(0.75, 1e3);
    }
  });
  window.helios = helios;
});
//# sourceMappingURL=script.js.map
