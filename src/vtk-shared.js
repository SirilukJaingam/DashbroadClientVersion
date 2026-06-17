import '@kitware/vtk.js';

const vtk = window.vtk;
const vtkColorTransferFunction = vtk.Rendering.Core.vtkColorTransferFunction;

const HEAT_STOPS = [
    [0, [10, 20, 80]],
    [0.2, [0, 80, 180]],
    [0.4, [0, 200, 200]],
    [0.6, [0, 220, 100]],
    [0.75, [220, 200, 0]],
    [0.9, [255, 80, 0]],
    [1, [255, 20, 20]],
];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function normalizeHeatValue(value, rangeMin = 0, rangeMax = 1) {
    if (rangeMax <= rangeMin) return 1;
    return clamp((value - rangeMin) / (rangeMax - rangeMin), 0, 1);
}

export function heatColor(t, alpha = 255, rangeMin = 0, rangeMax = 1) {
    const value = normalizeHeatValue(t, rangeMin, rangeMax);
    for (let i = 1; i < HEAT_STOPS.length; i++) {
        if (value <= HEAT_STOPS[i][0]) {
            const lo = HEAT_STOPS[i - 1];
            const hi = HEAT_STOPS[i];
            const f = (value - lo[0]) / (hi[0] - lo[0]);
            const rgb = lo[1].map((c, j) => Math.round(lerp(c, hi[1][j], f)));
            return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha / 255})`;
        }
    }

    return `rgba(255,20,20,${alpha / 255})`;
}

export function heatRGB(t, rangeMin = 0, rangeMax = 1) {
    const value = normalizeHeatValue(t, rangeMin, rangeMax);
    for (let i = 1; i < HEAT_STOPS.length; i++) {
        if (value <= HEAT_STOPS[i][0]) {
            const lo = HEAT_STOPS[i - 1];
            const hi = HEAT_STOPS[i];
            const f = (value - lo[0]) / (hi[0] - lo[0]);
            return lo[1].map((c, j) => Math.round(lerp(c, hi[1][j], f)));
        }
    }

    return [255, 20, 20];
}

export function buildCTF(rangeMin = 0, rangeMax = 1) {
    const ctf = vtkColorTransferFunction.newInstance();
    HEAT_STOPS.forEach(([stop, rgb]) => {
        ctf.addRGBPoint(lerp(rangeMin, rangeMax, stop), rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    });
    return ctf;
}
