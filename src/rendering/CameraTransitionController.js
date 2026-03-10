function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + ((b - a) * t);
}

function clamp01(value) {
  return clamp(Number(value) || 0, 0, 1);
}

function smoothstep(t) {
  const x = clamp01(t);
  return x * x * (3 - (2 * x));
}

function logLerp(a, b, t) {
  const av = Number(a);
  const bv = Number(b);
  if (!(av > 0) || !(bv > 0)) return lerp(av || 0, bv || 0, t);
  return Math.exp(lerp(Math.log(av), Math.log(bv), t));
}

function copyVec(source, length, fallback = 0) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const value = source?.[i];
    out[i] = Number.isFinite(value) ? value : fallback;
  }
  return out;
}

function mergeVec(base, next, length, fallback = 0) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const candidate = next?.[i];
    const fallbackValue = base?.[i];
    out[i] = Number.isFinite(candidate)
      ? candidate
      : Number.isFinite(fallbackValue)
        ? fallbackValue
        : fallback;
  }
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
    return out;
  }
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  out[3] = 1;
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

function quatFromAxisAngle(axis, radians) {
  const out = new Float32Array(4);
  const ax = Number(axis?.[0]) || 0;
  const ay = Number(axis?.[1]) || 0;
  const az = Number(axis?.[2]) || 0;
  const len = Math.hypot(ax, ay, az);
  if (len <= 1e-12) {
    out[3] = 1;
    return out;
  }
  const half = radians * 0.5;
  const scale = Math.sin(half) / len;
  out[0] = ax * scale;
  out[1] = ay * scale;
  out[2] = az * scale;
  out[3] = Math.cos(half);
  return out;
}

function quatSlerp(out, a, b, t) {
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];
  let cosOmega = (a[0] * bx) + (a[1] * by) + (a[2] * bz) + (a[3] * bw);

  if (cosOmega < 0) {
    cosOmega = -cosOmega;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }

  if (cosOmega > 0.9995) {
    out[0] = lerp(a[0], bx, t);
    out[1] = lerp(a[1], by, t);
    out[2] = lerp(a[2], bz, t);
    out[3] = lerp(a[3], bw, t);
    return quatNormalize(out, out);
  }

  const omega = Math.acos(clamp(cosOmega, -1, 1));
  const sinOmega = Math.sin(omega);
  if (Math.abs(sinOmega) < 1e-12) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    return out;
  }

  const scale0 = Math.sin((1 - t) * omega) / sinOmega;
  const scale1 = Math.sin(t * omega) / sinOmega;
  out[0] = (a[0] * scale0) + (bx * scale1);
  out[1] = (a[1] * scale0) + (by * scale1);
  out[2] = (a[2] * scale0) + (bz * scale1);
  out[3] = (a[3] * scale0) + (bw * scale1);
  return quatNormalize(out, out);
}

export function createYawPitchQuaternion(yawRadians = 0, pitchRadians = 0) {
  const yaw = quatFromAxisAngle([0, 1, 0], yawRadians);
  const pitch = quatFromAxisAngle([1, 0, 0], pitchRadians);
  const out = new Float32Array(4);
  quatMultiply(out, pitch, yaw);
  return quatNormalize(out, out);
}

export function captureCameraPose(camera) {
  if (!camera) return null;
  return {
    mode: camera.mode === '3d' ? '3d' : '2d',
    projection: camera.projection === 'orthographic' ? 'orthographic' : 'perspective',
    zoom: Number.isFinite(camera.zoom) ? camera.zoom : 1,
    distance: Number.isFinite(camera.distance) ? camera.distance : 800,
    fov: Number.isFinite(camera.fov) ? camera.fov : 60,
    near: Number.isFinite(camera.near) ? camera.near : 0.1,
    far: Number.isFinite(camera.far) ? camera.far : 100000,
    near2D: Number.isFinite(camera.near2D) ? camera.near2D : -1,
    far2D: Number.isFinite(camera.far2D) ? camera.far2D : 1,
    viewport: camera.viewport ? { ...camera.viewport } : { width: 1, height: 1, devicePixelRatio: 1 },
    target: copyVec(camera.target, 3, 0),
    pan2D: copyVec(camera.pan2D, 3, 0),
    pan3D: copyVec(camera.pan3D, 3, 0),
    rotation: quatNormalize(new Float32Array(4), copyVec(camera.rotation, 4, 0)),
  };
}

export function mergeCameraPose(basePose, patch = {}) {
  const base = basePose ?? {
    mode: '2d',
    projection: 'orthographic',
    zoom: 1,
    distance: 800,
    fov: 60,
    near: 0.1,
    far: 100000,
    near2D: -1,
    far2D: 1,
    viewport: { width: 1, height: 1, devicePixelRatio: 1 },
    target: new Float32Array([0, 0, 0]),
    pan2D: new Float32Array([0, 0, 0]),
    pan3D: new Float32Array([0, 0, 0]),
    rotation: new Float32Array([0, 0, 0, 1]),
  };
  return {
    ...base,
    ...patch,
    mode: patch.mode === '3d' ? '3d' : (base.mode === '3d' ? '3d' : '2d'),
    projection: patch.projection === 'orthographic'
      ? 'orthographic'
      : patch.projection === 'perspective'
        ? 'perspective'
        : base.projection,
    zoom: Number.isFinite(patch.zoom) ? patch.zoom : base.zoom,
    distance: Number.isFinite(patch.distance) ? patch.distance : base.distance,
    fov: Number.isFinite(patch.fov) ? patch.fov : base.fov,
    near: Number.isFinite(patch.near) ? patch.near : base.near,
    far: Number.isFinite(patch.far) ? patch.far : base.far,
    near2D: Number.isFinite(patch.near2D) ? patch.near2D : base.near2D,
    far2D: Number.isFinite(patch.far2D) ? patch.far2D : base.far2D,
    viewport: patch.viewport ? { ...(base.viewport ?? {}), ...patch.viewport } : { ...(base.viewport ?? {}) },
    target: mergeVec(base.target, patch.target, 3, 0),
    pan2D: mergeVec(base.pan2D, patch.pan2D, 3, 0),
    pan3D: mergeVec(base.pan3D, patch.pan3D, 3, 0),
    rotation: quatNormalize(new Float32Array(4), mergeVec(base.rotation, patch.rotation, 4, 0)),
  };
}

export function applyCameraPose(camera, pose, { update = true } = {}) {
  if (!camera || !pose) return camera;
  camera.mode = pose.mode === '3d' ? '3d' : '2d';
  camera.projection = pose.projection === 'orthographic' ? 'orthographic' : 'perspective';

  if (Number.isFinite(pose.zoom)) camera.zoom = pose.zoom;
  if (Number.isFinite(pose.distance)) camera.distance = pose.distance;
  if (Number.isFinite(pose.fov)) camera.fov = pose.fov;
  if (Number.isFinite(pose.near)) camera.near = pose.near;
  if (Number.isFinite(pose.far)) camera.far = pose.far;
  if (Number.isFinite(pose.near2D)) camera.near2D = pose.near2D;
  if (Number.isFinite(pose.far2D)) camera.far2D = pose.far2D;
  if (pose.viewport) camera.viewport = { ...camera.viewport, ...pose.viewport };

  if (ArrayBuffer.isView(camera.target) && pose.target) {
    camera.target[0] = pose.target[0] ?? camera.target[0];
    camera.target[1] = pose.target[1] ?? camera.target[1];
    camera.target[2] = pose.target[2] ?? camera.target[2];
  }
  if (ArrayBuffer.isView(camera.pan2D) && pose.pan2D) {
    camera.pan2D[0] = pose.pan2D[0] ?? camera.pan2D[0];
    camera.pan2D[1] = pose.pan2D[1] ?? camera.pan2D[1];
    camera.pan2D[2] = pose.pan2D[2] ?? camera.pan2D[2];
  }
  if (ArrayBuffer.isView(camera.pan3D) && pose.pan3D) {
    camera.pan3D[0] = pose.pan3D[0] ?? camera.pan3D[0];
    camera.pan3D[1] = pose.pan3D[1] ?? camera.pan3D[1];
    camera.pan3D[2] = pose.pan3D[2] ?? camera.pan3D[2];
  }
  if (ArrayBuffer.isView(camera.rotation) && pose.rotation) {
    camera.rotation[0] = pose.rotation[0] ?? camera.rotation[0];
    camera.rotation[1] = pose.rotation[1] ?? camera.rotation[1];
    camera.rotation[2] = pose.rotation[2] ?? camera.rotation[2];
    camera.rotation[3] = pose.rotation[3] ?? camera.rotation[3];
    quatNormalize(camera.rotation, camera.rotation);
  }

  if ('_needsUpdate' in camera) camera._needsUpdate = true;
  if (update) camera.updateMatrices?.();
  return camera;
}

function interpolatePose(fromPose, toPose, t) {
  const factor = smoothstep(t);
  const pose = {
    ...toPose,
    target: new Float32Array(3),
    pan2D: new Float32Array(3),
    pan3D: new Float32Array(3),
    rotation: new Float32Array(4),
  };

  for (let i = 0; i < 3; i += 1) {
    pose.target[i] = lerp(fromPose.target[i], toPose.target[i], factor);
    pose.pan2D[i] = lerp(fromPose.pan2D[i], toPose.pan2D[i], factor);
    pose.pan3D[i] = lerp(fromPose.pan3D[i], toPose.pan3D[i], factor);
  }
  quatSlerp(pose.rotation, fromPose.rotation, toPose.rotation, factor);
  pose.distance = logLerp(fromPose.distance, toPose.distance, factor);
  pose.zoom = logLerp(fromPose.zoom, toPose.zoom, factor);
  pose.fov = lerp(fromPose.fov, toPose.fov, factor);
  pose.near = logLerp(fromPose.near, toPose.near, factor);
  pose.far = logLerp(fromPose.far, toPose.far, factor);
  pose.near2D = lerp(fromPose.near2D, toPose.near2D, factor);
  pose.far2D = lerp(fromPose.far2D, toPose.far2D, factor);
  return pose;
}

export class CameraTransitionController {
  constructor({ requestRender = null } = {}) {
    this.requestRender = typeof requestRender === 'function' ? requestRender : null;
    this._rafId = null;
    this._resolve = null;
  }

  stop() {
    if (this._rafId != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._rafId);
    }
    this._rafId = null;
    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve(false);
    }
  }

  transition(camera, { fromPose, toPose, durationMs = 320 } = {}) {
    this.stop();
    if (!camera || !fromPose || !toPose) return Promise.resolve(false);

    const duration = Math.max(0, Number(durationMs) || 0);
    if (typeof requestAnimationFrame !== 'function' || duration <= 0) {
      applyCameraPose(camera, toPose);
      this.requestRender?.();
      return Promise.resolve(true);
    }

    applyCameraPose(camera, fromPose);
    this.requestRender?.();

    return new Promise((resolve) => {
      this._resolve = resolve;
      const startedAt = performance.now();
      const step = (timestamp) => {
        const elapsed = timestamp - startedAt;
        const t = duration <= 0 ? 1 : clamp01(elapsed / duration);
        const pose = interpolatePose(fromPose, toPose, t);
        applyCameraPose(camera, pose);
        this.requestRender?.();
        if (t >= 1) {
          this._rafId = null;
          const finish = this._resolve;
          this._resolve = null;
          finish?.(true);
          return;
        }
        this._rafId = requestAnimationFrame(step);
      };
      this._rafId = requestAnimationFrame(step);
    });
  }
}

export default CameraTransitionController;
