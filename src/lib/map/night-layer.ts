import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import { subsolarPoint } from "./globe";

type NightLayer = CustomLayerInterface & { setDate(date: Date): void };

export function sunDirection(date: Date): [number, number, number] {
  const [longitude, latitude] = subsolarPoint(date).map((degrees) => degrees * Math.PI / 180);
  const latitudeRadius = Math.cos(latitude);
  return [
    Math.sin(longitude) * latitudeRadius,
    Math.sin(latitude),
    Math.cos(longitude) * latitudeRadius,
  ];
}

export function nightSphereMesh(longitudeSegments = 180, latitudeStep = 2) {
  const positions: number[] = [0, -1, 0];
  const ringLatitudes: number[] = [];
  for (let latitude = -90 + latitudeStep; latitude < 90; latitude += latitudeStep) {
    ringLatitudes.push(latitude);
    const latitudeRadians = latitude * Math.PI / 180;
    const latitudeRadius = Math.cos(latitudeRadians);
    for (let longitudeIndex = 0; longitudeIndex < longitudeSegments; longitudeIndex += 1) {
      const longitude = -Math.PI + longitudeIndex * 2 * Math.PI / longitudeSegments;
      positions.push(
        Math.sin(longitude) * latitudeRadius,
        Math.sin(latitudeRadians),
        Math.cos(longitude) * latitudeRadius,
      );
    }
  }
  const northPoleIndex = positions.length / 3;
  positions.push(0, 1, 0);

  const indices: number[] = [];
  const firstRing = 1;
  for (let longitudeIndex = 0; longitudeIndex < longitudeSegments; longitudeIndex += 1) {
    const next = (longitudeIndex + 1) % longitudeSegments;
    indices.push(0, firstRing + next, firstRing + longitudeIndex);
  }
  for (let ringIndex = 0; ringIndex < ringLatitudes.length - 1; ringIndex += 1) {
    const lower = firstRing + ringIndex * longitudeSegments;
    const upper = lower + longitudeSegments;
    for (let longitudeIndex = 0; longitudeIndex < longitudeSegments; longitudeIndex += 1) {
      const next = (longitudeIndex + 1) % longitudeSegments;
      indices.push(
        lower + longitudeIndex, lower + next, upper + longitudeIndex,
        lower + next, upper + next, upper + longitudeIndex,
      );
    }
  }
  const lastRing = firstRing + (ringLatitudes.length - 1) * longitudeSegments;
  for (let longitudeIndex = 0; longitudeIndex < longitudeSegments; longitudeIndex += 1) {
    const next = (longitudeIndex + 1) % longitudeSegments;
    indices.push(northPoleIndex, lastRing + longitudeIndex, lastRing + next);
  }

  return { positions: new Float32Array(positions), indices: new Uint16Array(indices) };
}

function compileShader(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create the night shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unknown shader compilation error";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

export function createNightHemisphereLayer(initialDate: Date): NightLayer {
  const mesh = nightSphereMesh();
  let map: MapLibreMap | undefined;
  let program: WebGLProgram | undefined;
  let positionBuffer: WebGLBuffer | undefined;
  let indexBuffer: WebGLBuffer | undefined;
  let positionLocation = -1;
  let matrixLocation: WebGLUniformLocation | null = null;
  let sunLocation: WebGLUniformLocation | null = null;
  let direction = sunDirection(initialDate);

  return {
    id: "night-hemisphere",
    type: "custom",
    renderingMode: "3d",
    setDate(date) {
      direction = sunDirection(date);
      map?.triggerRepaint();
    },
    onAdd(mapInstance, gl) {
      map = mapInstance;
      const vertexShader = compileShader(gl, gl.VERTEX_SHADER, `
        precision highp float;
        attribute vec3 a_position;
        uniform mat4 u_matrix;
        varying vec3 v_normal;
        void main() {
          v_normal = a_position;
          gl_Position = u_matrix * vec4(a_position, 1.0);
        }
      `);
      const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, `
        precision highp float;
        uniform vec3 u_sun;
        varying vec3 v_normal;
        void main() {
          vec3 normal = normalize(v_normal);
          float solar = dot(normal, u_sun);
          float nightOpacity = 0.64 * (1.0 - smoothstep(-0.012, 0.012, solar));

          // EPSG:3857 raster tiles end at ±85.051°. MapLibre stretches their
          // final texel row over each globe pole, producing radial smearing.
          // Replace only that data-less polar cap and feather its edge.
          float polarMask = smoothstep(0.9961, 0.9963, abs(normal.y));
          vec3 polarDayColor = normal.y < 0.0
            ? vec3(0.79, 0.82, 0.83)
            : vec3(0.02, 0.055, 0.105);
          vec3 polarColor = polarDayColor * (1.0 - nightOpacity);
          float opacity = polarMask + (1.0 - polarMask) * nightOpacity;
          if (opacity < 0.001) discard;
          gl_FragColor = vec4(polarColor * polarMask, opacity);
        }
      `);
      program = gl.createProgram() ?? undefined;
      if (!program) throw new Error("Unable to create the night shader program");
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "Unable to link the night shader program");
      }
      positionLocation = gl.getAttribLocation(program, "a_position");
      matrixLocation = gl.getUniformLocation(program, "u_matrix");
      sunLocation = gl.getUniformLocation(program, "u_sun");
      positionBuffer = gl.createBuffer() ?? undefined;
      indexBuffer = gl.createBuffer() ?? undefined;
      if (!positionBuffer || !indexBuffer) throw new Error("Unable to allocate night shader buffers");
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    },
    render(gl, options: CustomRenderMethodInput) {
      if (!program || !positionBuffer || !indexBuffer) return;
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.uniformMatrix4fv(matrixLocation, false, options.defaultProjectionData.mainMatrix);
      gl.uniform3fv(sunLocation, direction);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.frontFace(gl.CCW);
      gl.cullFace(gl.BACK);
      gl.depthMask(false);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true);
      gl.disable(gl.CULL_FACE);
    },
    onRemove(_map, gl) {
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      if (indexBuffer) gl.deleteBuffer(indexBuffer);
      if (program) gl.deleteProgram(program);
      map = undefined;
      program = undefined;
      positionBuffer = undefined;
      indexBuffer = undefined;
    },
  };
}
