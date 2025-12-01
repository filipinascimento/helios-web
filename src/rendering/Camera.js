function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createVec3(x = 0, y = 0, z = 0) {
  return new Float32Array([x, y, z]);
}

function vec3Add(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  return out;
}

function vec3Sub(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  return out;
}

function vec3Scale(out, a, s) {
  out[0] = a[0] * s;
  out[1] = a[1] * s;
  out[2] = a[2] * s;
  return out;
}

function vec3ScaleAndAdd(out, a, b, s) {
  out[0] = a[0] + b[0] * s;
  out[1] = a[1] + b[1] * s;
  out[2] = a[2] + b[2] * s;
  return out;
}

function vec3Cross(out, a, b) {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}

function vec3Normalize(out, a) {
  const x = a[0];
  const y = a[1];
  const z = a[2];
  const len = Math.hypot(x, y, z);
  if (len > 0) {
    const inv = 1 / len;
    out[0] = x * inv;
    out[1] = y * inv;
    out[2] = z * inv;
  }
  return out;
}

function vec3TransformQuat(out, v, q) {
  const x = v[0];
  const y = v[1];
  const z = v[2];
  const qx = q[0];
  const qy = q[1];
  const qz = q[2];
  const qw = q[3];

  // calculate quat * vec
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;

  // calculate result * inverse quat
  out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return out;
}

function quatIdentity(out = new Float32Array(4)) {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  out[3] = 1;
  return out;
}

function quatNormalize(out, q) {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (len > 0) {
    const inv = 1 / len;
    out[0] = q[0] * inv;
    out[1] = q[1] * inv;
    out[2] = q[2] * inv;
    out[3] = q[3] * inv;
  }
  return out;
}

function quatMultiply(out, a, b) {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const aw = a[3];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];
  const bw = b[3];
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

function quatFromAxisAngle(out, axis, rad) {
  const half = rad * 0.5;
  const s = Math.sin(half);
  const ax = axis[0];
  const ay = axis[1];
  const az = axis[2];
  const len = Math.hypot(ax, ay, az);
  if (len < 1e-8) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return out;
  }
  const inv = 1 / len;
  out[0] = ax * inv * s;
  out[1] = ay * inv * s;
  out[2] = az * inv * s;
  out[3] = Math.cos(half);
  return out;
}

function createMat4() {
  const out = new Float32Array(16);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

function mat4Identity(out) {
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

function mat4Multiply(out, a, b) {
  const a00 = a[0];
  const a01 = a[1];
  const a02 = a[2];
  const a03 = a[3];
  const a10 = a[4];
  const a11 = a[5];
  const a12 = a[6];
  const a13 = a[7];
  const a20 = a[8];
  const a21 = a[9];
  const a22 = a[10];
  const a23 = a[11];
  const a30 = a[12];
  const a31 = a[13];
  const a32 = a[14];
  const a33 = a[15];

  const b00 = b[0];
  const b01 = b[1];
  const b02 = b[2];
  const b03 = b[3];
  const b10 = b[4];
  const b11 = b[5];
  const b12 = b[6];
  const b13 = b[7];
  const b20 = b[8];
  const b21 = b[9];
  const b22 = b[10];
  const b23 = b[11];
  const b30 = b[12];
  const b31 = b[13];
  const b32 = b[14];
  const b33 = b[15];

  out[0] = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
  out[1] = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
  out[2] = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
  out[3] = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;
  out[4] = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
  out[5] = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
  out[6] = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
  out[7] = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;
  out[8] = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
  out[9] = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
  out[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
  out[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;
  out[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
  out[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
  out[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
  out[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;
  return out;
}

function mat4Perspective(out, fovy, aspect, near, far) {
  const f = 1.0 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
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
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = 2 * far * near * nf;
  out[15] = 0;
  return out;
}

function mat4Ortho(out, left, right, bottom, top, near, far) {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);
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

function mat4LookAt(out, eye, center, up) {
  // Based on gl-matrix lookAt, column-major layout.
  const fx = center[0] - eye[0];
  const fy = center[1] - eye[1];
  const fz = center[2] - eye[2];

  let f = createVec3(fx, fy, fz);
  vec3Normalize(f, f);
  if (!Number.isFinite(f[0]) || !Number.isFinite(f[1]) || !Number.isFinite(f[2])) {
    f = createVec3(0, 0, -1);
  }

  let upVec = createVec3(up[0], up[1], up[2]);
  vec3Normalize(upVec, upVec);
  if (!Number.isFinite(upVec[0]) || !Number.isFinite(upVec[1]) || !Number.isFinite(upVec[2])) {
    upVec = createVec3(0, 1, 0);
  }

  const s = createVec3();
  vec3Cross(s, f, upVec);
  if (Math.hypot(s[0], s[1], s[2]) < 1e-6) {
    // Forward is parallel to up; choose an alternate up axis.
    vec3Cross(s, f, new Float32Array([1, 0, 0]));
  }
  vec3Normalize(s, s);

  const u = createVec3();
  vec3Cross(u, s, f);

  out[0] = s[0];
  out[1] = u[0];
  out[2] = -f[0];
  out[3] = 0;
  out[4] = s[1];
  out[5] = u[1];
  out[6] = -f[1];
  out[7] = 0;
  out[8] = s[2];
  out[9] = u[2];
  out[10] = -f[2];
  out[11] = 0;
  out[12] = -(s[0] * eye[0] + s[1] * eye[1] + s[2] * eye[2]);
  out[13] = -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]);
  out[14] = f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2];
  out[15] = 1;
  return out;
}

function mat4Translate(out, a, v) {
  const x = v[0];
  const y = v[1];
  const z = v[2];

  if (a === out) {
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
  } else {
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
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
  }
  return out;
}

function mat4Scale(out, a, v) {
  const x = v[0];
  const y = v[1];
  const z = v[2];

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

export class Camera {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.mode = options.mode === '3d' ? '3d' : '2d';
    this.projection = options.projection === 'orthographic' ? 'orthographic' : 'perspective';
    this.fov = options.fov ?? 60;
    this.near = options.near ?? 0.1;
    this.far = options.far ?? 100000;
    this.near2D = options.near2D ?? -1;
    this.far2D = options.far2D ?? 1;
    this.distance = options.distance ?? 800;
    this.minDistance = options.minDistance ?? 10;
    this.maxDistance = options.maxDistance ?? 25000;
    this.zoom = options.zoom ?? 1;
    this.minZoom = options.minZoom ?? 0.1;
    this.maxZoom = options.maxZoom ?? 10;
    this.rotation = quatIdentity(new Float32Array(4));
    this.target = createVec3(0, 0, 0);
    this.pan2D = createVec3();
    this.pan3D = createVec3();
    this.position = createVec3(0, 0, this.distance);
    this.right = createVec3(1, 0, 0);
    this.up = createVec3(0, -1, 0);
    this.forward = createVec3(0, 0, -1);
    this.viewport = { width: 1, height: 1, devicePixelRatio: 1 };

    this.viewMatrix = createMat4();
    this.projectionMatrix = createMat4();
    this.viewProjectionMatrix = createMat4();
    this._debugFrame = 0;

    this._needsUpdate = true;
    this._pointerId = null;
    this._lastPointer = null;
    this._boundPointerDown = (event) => this.handlePointerDown(event);
    this._boundMove = (event) => this.handlePointerMove(event);
    this._boundUp = (event) => this.handlePointerUp(event);
    this._boundWheel = (event) => this.handleWheel(event);
    this._firstStateLogged = false;
    this._arcballLast = null;

    // Default debug flag on so early state is captured.
    if (typeof window !== 'undefined' && window.__HELIOS_DEBUG_CAMERA !== false) {
      window.__HELIOS_DEBUG_CAMERA = true;
    }

    this.setViewport(options.viewport ?? this.viewport);
    if (!options.disableControls) {
      this.attachInput();
    } else {
      this.updateMatrices();
    }
  }

  debugEnabled() {
    return typeof window !== 'undefined' && window.__HELIOS_DEBUG_CAMERA;
  }

  logDebug(tag, payload) {
    if (!this.debugEnabled()) return;
    // eslint-disable-next-line no-console
    console.debug(`[HeliosCamera:${tag}]`, payload);
  }

  setMode(mode) {
    const normalized = mode === '3d' ? '3d' : '2d';
    if (normalized !== this.mode) {
      this.mode = normalized;
      this._needsUpdate = true;
      this.updateMatrices();
    }
  }

  setProjectionMode(mode) {
    const normalized = mode === 'orthographic' ? 'orthographic' : 'perspective';
    if (normalized !== this.projection) {
      this.projection = normalized;
      this._needsUpdate = true;
      this.updateMatrices();
    }
  }

  setViewport(size) {
    if (!size) return;
    this.viewport = { ...this.viewport, ...size };
    this._needsUpdate = true;
    this.updateMatrices();
  }

  setTarget(target) {
    if (!target) return;
    this.target[0] = target[0] ?? this.target[0];
    this.target[1] = target[1] ?? this.target[1];
    this.target[2] = target[2] ?? this.target[2];
    this._needsUpdate = true;
    this.updateMatrices();
  }

  attachInput() {
    if (!this.canvas || typeof this.canvas.addEventListener !== 'function') return;
    this.canvas.addEventListener('pointerdown', this._boundPointerDown);
    this.canvas.addEventListener('wheel', this._boundWheel, { passive: false });
  }

  destroy() {
    this.canvas?.removeEventListener?.('wheel', this._boundWheel);
    this.canvas?.removeEventListener?.('pointerdown', this._boundPointerDown);
    window.removeEventListener('pointermove', this._boundMove);
    window.removeEventListener('pointerup', this._boundUp);
  }

  handleWheel(event) {
    event.preventDefault();
    if (this.mode === '2d') {
      const rect = this.canvas?.getBoundingClientRect?.();
      const scale = Math.exp(-event.deltaY * 0.001);
      const newZoom = clamp(this.zoom * scale, this.minZoom, this.maxZoom);
      if (rect && this.viewport.width && this.viewport.height) {
        const screenX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * this.viewport.width;
        const screenY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * this.viewport.height;
        const worldX = (screenX - this.pan2D[0]) / this.zoom;
        const worldY = (screenY - this.pan2D[1]) / this.zoom;
        this.zoom = newZoom;
        this.pan2D[0] = screenX - worldX * this.zoom;
        this.pan2D[1] = screenY - worldY * this.zoom;
      } else {
        this.zoom = newZoom;
      }
    } else {
      const scale = Math.exp(event.deltaY * 0.001);
      const next = this.distance * scale;
      this.distance = clamp(Number.isFinite(next) ? next : this.minDistance, this.minDistance, this.maxDistance);
    }
    this.logDebug('wheel', {
      mode: this.mode,
      zoom: this.zoom,
      distance: this.distance,
      pan2D: Array.from(this.pan2D),
    });
    this._needsUpdate = true;
    this.updateMatrices();
  }

  handlePointerDown(event) {
    if (event.button !== 0) return;
    if (this._pointerId !== null) return;
    this._pointerId = event.pointerId;
    this._lastPointer = { x: event.clientX, y: event.clientY, shift: event.shiftKey };
    this._arcballLast = this.projectToArcball(event.clientX, event.clientY);
    this.canvas?.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', this._boundMove);
    window.addEventListener('pointerup', this._boundUp);
    this.logDebug('pointerdown', { mode: this.mode, shift: event.shiftKey });
  }

  handlePointerMove(event) {
    if (this._pointerId !== event.pointerId || !this._lastPointer) return;
    const dx = event.clientX - this._lastPointer.x;
    const dy = event.clientY - this._lastPointer.y;
    this._lastPointer = { x: event.clientX, y: event.clientY, shift: event.shiftKey };

    if (this.mode === '2d') {
      this.pan2D[0] += dx;
      this.pan2D[1] += dy;
    } else if (event.shiftKey) {
      this.pan3DBy(dx, dy);
    } else {
      this.arcballRotate(event.clientX, event.clientY);
    }
    this.logDebug('pointermove', {
      mode: this.mode,
      dx,
      dy,
      pan2D: Array.from(this.pan2D),
      pan3D: Array.from(this.pan3D),
      quaternion: Array.from(this.rotation),
    });
    this._needsUpdate = true;
    this.updateMatrices();
  }

  handlePointerUp(event) {
    if (event.pointerId !== this._pointerId) return;
    this._pointerId = null;
    this._lastPointer = null;
    this._arcballLast = null;
    window.removeEventListener('pointermove', this._boundMove);
    window.removeEventListener('pointerup', this._boundUp);
  }

  rotateBy(dx, dy) {
    const yawDelta = -dx * 0.003;
    const pitchDelta = -dy * 0.003;

    // Rotation is stored as a quaternion to avoid gimbal lock.
    const yawQuat = quatFromAxisAngle(new Float32Array([0, 1, 0]), yawDelta);
    const rightAxis = vec3TransformQuat(new Float32Array(3), new Float32Array([1, 0, 0]), this.rotation);
    const pitchQuat = quatFromAxisAngle(rightAxis, pitchDelta);
    const delta = new Float32Array(4);
    // Apply yaw then pitch in world space: dq = pitch * yaw
    quatMultiply(delta, pitchQuat, yawQuat);
    quatMultiply(this.rotation, delta, this.rotation);
    quatNormalize(this.rotation, this.rotation);
    if (!this.ensureFinite(this.rotation)) {
      quatIdentity(this.rotation);
    }
  }

  projectToArcball(clientX, clientY) {
    if (!this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const y = ((rect.bottom - clientY) / Math.max(1, rect.height)) * 2 - 1;
    const len2 = x * x + y * y;
    const z = len2 > 1 ? 0 : Math.sqrt(1 - len2);
    const v = new Float32Array([x, y, z]);
    const l = Math.hypot(v[0], v[1], v[2]);
    if (l > 0) {
      v[0] /= l;
      v[1] /= l;
      v[2] /= l;
    }
    return v;
  }

  arcballRotate(clientX, clientY) {
    const current = this.projectToArcball(clientX, clientY);
    if (!current || !this._arcballLast) {
      this._arcballLast = current;
      return;
    }
    const v0 = this._arcballLast;
    const v1 = current;
    const dot = Math.max(-1, Math.min(1, v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2]));
    const angle = Math.acos(dot);
    if (angle === 0) {
      this._arcballLast = current;
      return;
    }
    const axisView = new Float32Array([
      v0[1] * v1[2] - v0[2] * v1[1],
      v0[2] * v1[0] - v0[0] * v1[2],
      v0[0] * v1[1] - v0[1] * v1[0],
    ]);
    const axisWorld = vec3TransformQuat(new Float32Array(3), axisView, this.rotation);
    const axisLen = Math.hypot(axisWorld[0], axisWorld[1], axisWorld[2]);
    if (!Number.isFinite(axisLen) || axisLen < 1e-6) {
      this._arcballLast = current;
      return;
    }
    const distanceRatio = this.distance / Math.max(1e-6, this.minDistance);
    const zoomGain = 1.0*clamp(Math.pow(distanceRatio, 0.6), 1.0, 5.0);
    const delta = quatFromAxisAngle(new Float32Array(4), axisWorld, -angle * zoomGain);
    quatMultiply(this.rotation, delta, this.rotation);
    quatNormalize(this.rotation, this.rotation);
    if (!this.ensureFinite(this.rotation)) {
      quatIdentity(this.rotation);
    }
    this._arcballLast = current;
  }

  pan3DBy(dx, dy) {
    if (!Number.isFinite(this.distance) || this.distance <= 0) {
      this.distance = this.minDistance;
    }
    this.updateBasis();
    const fovRad = (this.fov * Math.PI) / 180;
    const height = Math.max(1, this.viewport.height);
    const worldPerPixel =
      this.projection === 'orthographic'
        ? (2 * this.distance) / height
        : (2 * this.distance * Math.tan(fovRad / 2)) / height;

    vec3ScaleAndAdd(this.pan3D, this.pan3D, this.right, -dx * worldPerPixel);
    vec3ScaleAndAdd(this.pan3D, this.pan3D, this.up, dy * worldPerPixel);
  }

  updateBasis() {
    if (this.mode === '2d') {
      this.right[0] = 1;
      this.right[1] = 0;
      this.right[2] = 0;
      this.up[0] = 0;
      this.up[1] = -1;
      this.up[2] = 0;
      this.forward[0] = 0;
      this.forward[1] = 0;
      this.forward[2] = -1;
      return;
    }
    // Derive basis from quaternion only.
    vec3TransformQuat(this.forward, new Float32Array([0, 0, -1]), this.rotation);
    vec3TransformQuat(this.up, new Float32Array([0, 1, 0]), this.rotation);
    if (!this.ensureFinite(this.forward) || !this.ensureFinite(this.up)) {
      quatIdentity(this.rotation);
      vec3TransformQuat(this.forward, new Float32Array([0, 0, -1]), this.rotation);
      vec3TransformQuat(this.up, new Float32Array([0, 1, 0]), this.rotation);
    }
    vec3Normalize(this.forward, this.forward);
    vec3Normalize(this.up, this.up);
    vec3Cross(this.right, this.forward, this.up);
    vec3Normalize(this.right, this.right);
    vec3Cross(this.up, this.right, this.forward);
    vec3Normalize(this.up, this.up);
  }

  updateMatrices() {
    if (!this._needsUpdate) return;
    this._needsUpdate = false;
    if (this.mode === '2d') {
      this.update2D();
    } else {
      this.update3D();
    }
    if (!this.ensureFinite(this.viewProjectionMatrix)) {
      this.resetCameraState();
      this.updateBasis();
      this.update3D();
      this.logDebug('recover', {
        yaw: this.yaw,
        pitch: this.pitch,
        distance: this.distance,
        pan3D: Array.from(this.pan3D),
      });
    }
    if (this.debugEnabled()) {
      this._debugFrame += 1;
      if (!this._firstStateLogged) {
        this._firstStateLogged = true;
        this.logDebug('state_initial', {
          mode: this.mode,
          distance: this.distance,
          pan2D: Array.from(this.pan2D),
          pan3D: Array.from(this.pan3D),
          position: Array.from(this.position),
          view: Array.from(this.viewMatrix.slice(0, 16)),
          projection: Array.from(this.projectionMatrix.slice(0, 16)),
          quaternion: Array.from(this.rotation),
        });
      }
      if (this._debugFrame % 15 === 0) {
        this.logDebug('state', {
          mode: this.mode,
          distance: this.distance,
          pan2D: Array.from(this.pan2D),
          pan3D: Array.from(this.pan3D),
          position: Array.from(this.position),
          view: Array.from(this.viewMatrix.slice(0, 16)),
          projection: Array.from(this.projectionMatrix.slice(0, 16)),
          quaternion: Array.from(this.rotation),
        });
      }
    }
  }

  update2D() {
    const { width = 1, height = 1 } = this.viewport;
    mat4Identity(this.viewMatrix);
    // Build a manual view matrix so translation is not scaled by the zoom factor.
    this.viewMatrix[0] = this.zoom;
    this.viewMatrix[5] = this.zoom;
    this.viewMatrix[10] = 1;
    this.viewMatrix[12] = this.pan2D[0];
    this.viewMatrix[13] = this.pan2D[1];
    this.viewMatrix[15] = 1;
    mat4Ortho(this.projectionMatrix, 0, width, height, 0, this.near2D, this.far2D);
    mat4Multiply(this.viewProjectionMatrix, this.projectionMatrix, this.viewMatrix);
    this.position[0] = -this.pan2D[0];
    this.position[1] = -this.pan2D[1];
    this.position[2] = 0;
    this.updateBasis();
  }

  update3D() {
    this.updateBasis();
    const { width = 1, height = 1 } = this.viewport;
    const aspect = Math.max(0.001, width / Math.max(1, height));
    if (!this._center) {
      this._center = createVec3();
    }
    const center = this._center;
    vec3Add(center, this.target, this.pan3D);
    const safeDistance = Number.isFinite(this.distance) ? this.distance : this.minDistance;
    this.distance = clamp(safeDistance, this.minDistance, this.maxDistance);
    // Orbit: position = center + q * (0, 0, radius) * q^-1
    const offset = vec3TransformQuat(new Float32Array(3), new Float32Array([0, 0, this.distance]), this.rotation);
    vec3Add(this.position, center, offset);
    if (Number.isNaN(this.position[0]) || Number.isNaN(this.position[1]) || Number.isNaN(this.position[2])) {
      this.resetCameraState();
      vec3Add(center, this.target, this.pan3D);
      vec3ScaleAndAdd(this.position, center, this.forward, -this.distance);
    }
    // Avoid eye == center, which causes lookAt to produce NaNs.
    if (
      Math.abs(this.position[0] - center[0]) < 1e-5 &&
      Math.abs(this.position[1] - center[1]) < 1e-5 &&
      Math.abs(this.position[2] - center[2]) < 1e-5
    ) {
      this.position[2] -= this.distance || 1;
    }
    if (this.projection === 'orthographic') {
      const viewHeight = this.distance;
      const viewWidth = viewHeight * aspect;
      mat4Ortho(
        this.projectionMatrix,
        -viewWidth,
        viewWidth,
        viewHeight,
        -viewHeight,
        this.near,
        this.far,
      );
    } else {
      const fovRad = (this.fov * Math.PI) / 180;
      mat4Perspective(this.projectionMatrix, fovRad, aspect, this.near, this.far);
    }
    mat4LookAt(this.viewMatrix, this.position, center, this.up);
    if (!this.ensureFinite(this.viewMatrix)) {
      // If still invalid, fall back to identity to avoid black frame.
      mat4Identity(this.viewMatrix);
      mat4Identity(this.projectionMatrix);
    }
    mat4Multiply(this.viewProjectionMatrix, this.projectionMatrix, this.viewMatrix);
  }

  ensureFinite(matrix) {
    for (let i = 0; i < matrix.length; i += 1) {
      if (!Number.isFinite(matrix[i])) return false;
    }
    return true;
  }

  resetCameraState() {
    quatIdentity(this.rotation);
    this.distance = clamp(this.distance || 800, this.minDistance, this.maxDistance);
    this.pan3D[0] = 0;
    this.pan3D[1] = 0;
    this.pan3D[2] = 0;
    this.pan2D[0] = 0;
    this.pan2D[1] = 0;
    this._arcballLast = null;
  }

  getUniforms() {
    this.updateMatrices();
    const finite =
      this.ensureFinite(this.viewProjectionMatrix) &&
      this.ensureFinite(this.viewMatrix) &&
      this.ensureFinite(this.projectionMatrix);

    if (!finite) {
      this.logDebug('invalid_matrices', {
        mode: this.mode,
        yaw: this.yaw,
        pitch: this.pitch,
        distance: this.distance,
        position: Array.from(this.position),
        view: Array.from(this.viewMatrix),
        projection: Array.from(this.projectionMatrix),
      });
      this.resetCameraState();
      mat4Identity(this.viewMatrix);
      mat4Identity(this.projectionMatrix);
      mat4Identity(this.viewProjectionMatrix);
    }

    return {
      view: this.viewMatrix,
      projection: this.projectionMatrix,
      viewProjection: this.viewProjectionMatrix,
      position: this.position,
      right: this.right,
      up: this.up,
      mode: this.mode,
      projectionType: this.projection,
      viewport: this.viewport,
    };
  }
}

export default Camera;
