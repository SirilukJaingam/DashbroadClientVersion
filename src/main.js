import './scripts/network-url.js';
import '@kitware/vtk.js';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { AllCommunityModule, ModuleRegistry, createGrid } from 'ag-grid-community';
import { buildCTF, heatColor, heatRGB } from './vtk-shared.js';

const vtk = window.vtk;

const vtkRenderer = vtk.Rendering.Core.vtkRenderer;
const vtkRenderWindow = vtk.Rendering.Core.vtkRenderWindow;
const vtkOpenGLRenderWindow = vtk.Rendering.OpenGL.vtkRenderWindow;
const vtkRenderWindowInteractor = vtk.Rendering.Core.vtkRenderWindowInteractor;
const vtkActor = vtk.Rendering.Core.vtkActor;
const vtkMapper = vtk.Rendering.Core.vtkMapper;
const vtkPolyData = vtk.Common.DataModel.vtkPolyData;
const vtkPoints = vtk.Common.Core.vtkPoints;
const vtkCellArray = vtk.Common.Core.vtkCellArray;
const vtkDataArray = vtk.Common.Core.vtkDataArray;
const vtkColorTransferFunction = vtk.Rendering.Core.vtkColorTransferFunction;
const vtkInteractorStyleTrackballCamera = vtk.Interaction.Style.vtkInteractorStyleTrackballCamera;

const vtkSphereSource = vtk.Filters.Sources.vtkSphereSource;
const vtkLight = vtk.Rendering.Core.vtkLight;

ModuleRegistry.registerModules([AllCommunityModule]);

let vtkRenderWindowInstance = null;
let vtkRendererInstance = null;
let vtkInteractorInstance = null;
let vtkOpenGLWindow = null;
let vtkHeatmapBuilt = false;
let vtkPipeBuilt = false;
let vtkInitialized = false;
let vtkSceneMode = 'heatmap';

let rangeVtkRenderer = null;
let rangeVtkRenderWindow = null;
let rangeVtkOpenGLWindow = null;
let rangeVtkInitialized = false;

let bScanVtkRenderer = null;
let bScanVtkRenderWindow = null;
let bScanVtkOpenGLWindow = null;
let bScanVtkInitialized = false;
let bScanLastColumn = -1;

let longVtkRenderer = null;
let longVtkRenderWindow = null;
let longVtkOpenGLWindow = null;
let longVtkInitialized = false;
let longLastRow = -1;

let scatterVtkRenderer = null;
let scatterVtkRenderWindow = null;
let scatterVtkOpenGLWindow = null;
let scatterVtkInitialized = false;

let histVtkRenderer = null;
let histVtkRenderWindow = null;
let histVtkOpenGLWindow = null;
let histVtkInitialized = false;

let velocityVtkRenderer = null;
let velocityVtkRenderWindow = null;
let velocityVtkOpenGLWindow = null;
let velocityVtkInitialized = false;

let circVtkRenderer = null;
let circVtkRenderWindow = null;
let circVtkOpenGLWindow = null;
let circVtkInitialized = false;
let circLastColumn = -1;
let circLastRow = -1;

let JOINT_BLOBS = null;
let JOINT_DEFECTS = null;
let activeJointIdx = -1;
const C_SCAN_COLOR_RANGE_MIN_GAP = 0.02;
const cScanColorRange = { min: 0, max: 1 };

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const PI2 = Math.PI * 2;
// Explicit pixel-space layout for chart axes and labels.
const CHART_AXIS_INSET = 36;
const CHART_Y_TICK_X = 6;
const CHART_X_TICK_Y = 12;
const CHART_X_AXIS_TITLE_OFFSET = 6;

// Layout ratios for resizable panels
let leftColRatio = 0.25;
let scanRowRatios = [0.333, 0.333, 0.334];
let scanGridHeightRatio = 0.80;
let chartWidthRatios = [0.333, 0.333, 0.334];

function drawChartAxes(ctx, pad, pw, ph) {
    ctx.strokeStyle = 'rgba(107,138,170,.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + ph);
    ctx.lineTo(pad.l + pw, pad.t + ph);
    ctx.stroke();
}

function getCScanPad() {
    return { l: CHART_AXIS_INSET, r: 28, t: 14, b: CHART_AXIS_INSET };
}

function layoutCScanContainer() {
    const panelBody = vtkContainer.parentElement;
    const w = panelBody.clientWidth;
    const h = panelBody.clientHeight;

    if (view3D) {
        vtkContainer.style.left = '0px';
        vtkContainer.style.top = '0px';
        vtkContainer.style.width = `${w}px`;
        vtkContainer.style.height = `${h}px`;
        return;
    }

    const pad = getCScanPad();
    vtkContainer.style.left = `${pad.l}px`;
    vtkContainer.style.top = `${pad.t}px`;
    vtkContainer.style.width = `${Math.max(1, w - pad.l - pad.r)}px`;
    vtkContainer.style.height = `${Math.max(1, h - pad.t - pad.b)}px`;
}

function getRangePad() {
    return { l: CHART_AXIS_INSET, r: 28, t: 14, b: CHART_AXIS_INSET };
}

function layoutRangeContainer() {
    if (!rangeVtkContainer) return;
    const panelBody = rangeVtkContainer.parentElement;
    const w = panelBody.clientWidth;
    const h = panelBody.clientHeight;
    const pad = getRangePad();
    rangeVtkContainer.style.left = `${pad.l}px`;
    rangeVtkContainer.style.top = `${pad.t}px`;
    rangeVtkContainer.style.width = `${Math.max(1, w - pad.l - pad.r)}px`;
    rangeVtkContainer.style.height = `${Math.max(1, h - pad.t - pad.b)}px`;
}

// ── Data Map ──────────────────────────────────────────────────────────────────
const DATA_W = 600, DATA_H = 240;
let dataMap = null;
let frame = 0;
let view3D = false;
let csX = DATA_W * 0.35;
let csY = DATA_H * 0.40;
let zoom = { x0: .15, y0: .10, x1: .65, y1: .90 };
let histNBins = 20;

function fit(c) {
    const p = c.parentElement;
    const w = p.clientWidth, h = p.clientHeight;
    if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        return true;
    }
    return false;
}

function tick() {
    const n = new Date();
    document.getElementById('clock').textContent =
        n.toLocaleTimeString('en-GB', { hour12: false }) + ' · ' + n.toLocaleDateString('en-GB');
}
tick(); setInterval(tick, 1000);

function buildDataMap() {
    dataMap = [];
    for (let y = 0; y < DATA_H; y++) {
        dataMap.push(new Float32Array(DATA_W));
        for (let x = 0; x < DATA_W; x++) {
            const tx = x / DATA_W, ty = y / DATA_H;
            let v = 0.12 + Math.sin(tx * 28 + .3) * 0.04 + Math.sin(ty * 22 + 1) * 0.03 + (Math.sin(tx * 5) * Math.sin(ty * 7)) * 0.02;
            const d1 = Math.sqrt(((tx - .30) / .10) ** 2 + ((ty - .40) / .08) ** 2);
            if (d1 < 1) v = lerp(v, 0.82, Math.exp(-d1 * d1 * 2.5));
            const d2 = Math.sqrt(((tx - .70) / .07) ** 2 + ((ty - .65) / .06) ** 2);
            if (d2 < 1) v = lerp(v, 0.68, Math.exp(-d2 * d2 * 3));
            if (Math.abs(ty - .5) < .005) v = Math.max(v, 0.22);
            dataMap[y][x] = clamp(v, 0, 1);
        }
    }
}

// ── A-Scan ────────────────────────────────────────────────────────────────────
const aScanOverlay = document.getElementById('aScanOverlay');
const aOX = aScanOverlay.getContext('2d');
const aScanVtkContainer = document.getElementById('aScanVtkContainer');

const A_PEAKS = [
    [121.8, 38, 'noise'], [122.5, 22, 'noise'], [123.1, 55, 'noise'], [123.9, 18, 'noise'],
    [124.3, 42, 'noise'], [124.9, 30, 'noise'], [125.2, 25, 'noise'], [125.7, 48, 'noise'],
    [126.2, 155, 'entry'], [126.8, 62, 'entry'], [127.0, 48, 'entry'], [127.5, 44, 'entry'],
    [128.6, 138, 'entry'], [128.9, 820, 'gate_max'], [129.1, 547, 'bw'], [129.4, 96, 'noise'],
    [129.8, 50, 'noise'], [131.0, 678, 'notable'], [131.4, 383, 'bw'],
    [131.8, 106, 'noise'], [132.1, 93, 'noise'], [133.5, 468, 'notable'], [133.8, 65, 'noise'],
    [136.0, 305, 'bw'], [136.5, 243, 'bw'], [139.2, 185, 'noise'], [139.6, 155, 'noise'],
    [141.8, 95, 'noise'], [142.1, 60, 'noise'],
];
let A_GATES = [
    [126.0, 128.5, 'rgba(130,210,230,.18)', 'rgba(130,210,230,.7)', 'Gate A'],
    [128.5, 131.2, 'rgba(250,200,100,.15)', 'rgba(250,200,100,.7)', 'Gate B'],
];
const A_TMIN = 121, A_TMAX = 145, A_VMAX = 880;
let aThresholdSolid = 100;
let aThresholdDash = 50;
let aCursorT = 136.0;
// Start / End Gate cursor lines (adjustable X positions)
let aStartGateT = 124.0;
let aEndGateT = 137.0;

let aScanVtkRenderer = null;
let aScanVtkRenderWindow = null;
let aScanVtkOpenGLWindow = null;
let aScanVtkInitialized = false;
let aScanLastAspect = -1;
let aScanLastCursorT = -1;
let aScanLastStartGateT = -1;
let aScanLastEndGateT = -1;

const ASCAN_WORLD_H = 8.0;

function getAScanPad() {
    return { l: CHART_AXIS_INSET, r: 8, t: 28, b: CHART_AXIS_INSET };
}

function layoutAScanVtkContainer() {
    const panelBody = aScanVtkContainer.parentElement;
    const pad = getAScanPad();
    aScanVtkContainer.style.left = `${pad.l}px`;
    aScanVtkContainer.style.top = `${pad.t}px`;
    aScanVtkContainer.style.width = `${Math.max(1, panelBody.clientWidth - pad.l - pad.r)}px`;
    aScanVtkContainer.style.height = `${Math.max(1, panelBody.clientHeight - pad.t - pad.b)}px`;
}

function aScanMakeLines(coords, rgb, lineWidth, opacity = 1) {
    const n = coords.length / 3;
    const pts = vtkPoints.newInstance();
    pts.setData(new Float64Array(coords), 3);
    const cells = [];
    for (let i = 0; i < n; i += 2) cells.push(2, i, i + 1);
    const ca = vtkCellArray.newInstance();
    ca.setData(new Uint32Array(cells));
    const pd = vtkPolyData.newInstance();
    pd.setPoints(pts);
    pd.setLines(ca);
    const mapper = vtkMapper.newInstance();
    mapper.setInputData(pd);
    mapper.setScalarVisibility(false);
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor(...rgb);
    actor.getProperty().setLineWidth(lineWidth);
    actor.getProperty().setOpacity(opacity);
    return actor;
}

function aScanMakeQuad(x0, x1, y0, y1, rgb, opacity) {
    const pts = vtkPoints.newInstance();
    pts.setData(new Float64Array([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0]), 3);
    const cells = new Uint32Array([3, 0, 1, 2, 3, 0, 2, 3]);
    const ca = vtkCellArray.newInstance();
    ca.setData(cells);
    const pd = vtkPolyData.newInstance();
    pd.setPoints(pts);
    pd.setPolys(ca);
    const mapper = vtkMapper.newInstance();
    mapper.setInputData(pd);
    mapper.setScalarVisibility(false);
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor(...rgb);
    actor.getProperty().setOpacity(opacity);
    return actor;
}

function aScanMakePoints(coords, rgb, pointSize) {
    const n = coords.length / 3;
    const pts = vtkPoints.newInstance();
    pts.setData(new Float64Array(coords), 3);
    const cells = [];
    for (let i = 0; i < n; i++) cells.push(1, i);
    const ca = vtkCellArray.newInstance();
    ca.setData(new Uint32Array(cells));
    const pd = vtkPolyData.newInstance();
    pd.setPoints(pts);
    pd.setVerts(ca);
    const mapper = vtkMapper.newInstance();
    mapper.setInputData(pd);
    mapper.setScalarVisibility(false);
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor(...rgb);
    actor.getProperty().setPointSize(pointSize);
    return actor;
}

function buildAScanScene() {
    if (!aScanVtkOpenGLWindow) return;
    layoutAScanVtkContainer();
    const { width, height } = aScanVtkContainer.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;

    const aspect = width / height;
    const worldH = ASCAN_WORLD_H;
    const worldW = worldH * aspect;
    const hwH = worldH / 2, hwW = worldW / 2;
    const toWX = t => (t - A_TMIN) / (A_TMAX - A_TMIN) * worldW - hwW;
    const toWY = v => v / A_VMAX * worldH - hwH;
    const y0W = toWY(0);

    aScanVtkRenderer.removeAllActors();

    // Fine grid (0.5µs / 20mV)
    const fineGrid = [];
    for (let t = A_TMIN; t <= A_TMAX; t += 0.5) {
        const x = toWX(t); fineGrid.push(x, -hwH, 0, x, hwH, 0);
    }
    for (let v = 0; v <= A_VMAX; v += 20) {
        const y = toWY(v); fineGrid.push(-hwW, y, 0, hwW, y, 0);
    }
    aScanVtkRenderer.addActor(aScanMakeLines(fineGrid, [0.12, 0.20, 0.32], 0.4, 0.45));

    // Coarse grid (1µs / 80mV)
    const coarseGrid = [];
    for (let t = A_TMIN; t <= A_TMAX; t += 1) {
        const x = toWX(t); coarseGrid.push(x, -hwH, 0, x, hwH, 0);
    }
    for (let v = 0; v <= A_VMAX; v += 80) {
        const y = toWY(v); coarseGrid.push(-hwW, y, 0, hwW, y, 0);
    }
    aScanVtkRenderer.addActor(aScanMakeLines(coarseGrid, [0.20, 0.31, 0.47], 0.5, 0.70));

    // Gate fills and border lines
    const gateFills = [
        { rgb: [130/255, 210/255, 230/255], opacity: 0.18 },
        { rgb: [250/255, 200/255, 100/255], opacity: 0.15 },
    ];
    A_GATES.forEach(([t0, t1], i) => {
        const gx0 = toWX(t0), gx1 = toWX(t1);
        aScanVtkRenderer.addActor(aScanMakeQuad(gx0, gx1, -hwH, hwH, gateFills[i].rgb, gateFills[i].opacity));
        aScanVtkRenderer.addActor(aScanMakeLines(
            [gx0, -hwH, 0, gx0, hwH, 0, gx1, -hwH, 0, gx1, hwH, 0],
            gateFills[i].rgb, 0.8, 0.7
        ));
    });

    // Solid threshold — from Start Gate to Gate A right edge
    const tSolidL = toWX(aStartGateT);
    const tSolidR = toWX(A_GATES[0][1]);
    aScanVtkRenderer.addActor(aScanMakeLines(
        [tSolidL, toWY(aThresholdSolid), 0, tSolidR, toWY(aThresholdSolid), 0],
        [244/255, 63/255, 94/255], 1.0, 0.8
    ));

    // Dashed threshold — from Gate B left edge to End Gate
    const dashY = toWY(aThresholdDash);
    const tDashL = toWX(A_GATES[1][0]);
    const tDashR = toWX(aEndGateT);
    const dashSegs = [];
    for (let x = tDashL; x < tDashR; x += 0.28) {
        dashSegs.push(x, dashY, 0, Math.min(x + 0.14, tDashR), dashY, 0);
    }
    aScanVtkRenderer.addActor(aScanMakeLines(dashSegs, [244/255, 63/255, 94/255], 0.8, 0.55));

    // Stems by type
    const stems = { noise: [], entry: [], gate_max: [], notable: [], bw: [] };
    A_PEAKS.forEach(([t, v, type]) => {
        const key = stems[type] !== undefined ? type : 'noise';
        stems[key].push(toWX(t), y0W, 0, toWX(t), toWY(v), 0);
    });
    if (stems.noise.length)    aScanVtkRenderer.addActor(aScanMakeLines(stems.noise,    [74/255, 107/255, 150/255], 0.8, 0.6));
    if (stems.entry.length)    aScanVtkRenderer.addActor(aScanMakeLines(stems.entry,    [74/255, 107/255, 150/255], 0.8, 0.6));
    if (stems.gate_max.length) aScanVtkRenderer.addActor(aScanMakeLines(stems.gate_max, [244/255, 63/255, 94/255],  0.8, 0.5));
    if (stems.notable.length)  aScanVtkRenderer.addActor(aScanMakeLines(stems.notable,  [163/255, 230/255, 53/255], 0.8, 0.4));
    if (stems.bw.length)       aScanVtkRenderer.addActor(aScanMakeLines(stems.bw,       [251/255, 191/255, 36/255], 0.8, 0.4));

    // Peak tip markers
    const ptNoise = [], ptGateMax = [], ptNotable = [], ptBw = [];
    A_PEAKS.forEach(([t, v, type]) => {
        const wx = toWX(t), wy = toWY(v);
        if (type === 'gate_max') ptGateMax.push(wx, wy, 0);
        else if (type === 'notable') ptNotable.push(wx, wy, 0);
        else if (type === 'bw') ptBw.push(wx, wy, 0);
        else ptNoise.push(wx, wy, 0);
    });
    if (ptNoise.length)   aScanVtkRenderer.addActor(aScanMakePoints(ptNoise,   [74/255, 140/255, 196/255], 4.5));
    if (ptGateMax.length) aScanVtkRenderer.addActor(aScanMakePoints(ptGateMax, [239/255, 68/255, 68/255],  8.0));
    if (ptNotable.length) aScanVtkRenderer.addActor(aScanMakePoints(ptNotable, [163/255, 230/255, 53/255], 7.0));
    if (ptBw.length)      aScanVtkRenderer.addActor(aScanMakePoints(ptBw,      [251/255, 191/255, 36/255], 6.0));

    // Cursor line
    aScanVtkRenderer.addActor(aScanMakeLines(
        [toWX(aCursorT), -hwH, 0, toWX(aCursorT), hwH, 0],
        [52/255, 211/255, 153/255], 0.9, 0.75
    ));

    // Start Gate & End Gate vertical cursors
    aScanVtkRenderer.addActor(aScanMakeLines(
        [toWX(aStartGateT), -hwH, 0, toWX(aStartGateT), hwH, 0],
        [130/255, 210/255, 230/255], 1.2, 0.85
    ));
    aScanVtkRenderer.addActor(aScanMakeLines(
        [toWX(aEndGateT), -hwH, 0, toWX(aEndGateT), hwH, 0],
        [250/255, 200/255, 100/255], 1.2, 0.85
    ));

    // Parallel camera filling the plot region
    const cam = aScanVtkRenderer.getActiveCamera();
    cam.setPosition(0, 0, 18);
    cam.setFocalPoint(0, 0, 0);
    cam.setViewUp(0, 1, 0);
    cam.setParallelProjection(true);
    cam.setParallelScale(hwH);
    cam.setClippingRange(0.1, 100);

    aScanVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
    aScanVtkRenderWindow.render();

    aScanLastAspect = aspect;
    aScanLastCursorT = aCursorT;
    aScanLastStartGateT = aStartGateT;
    aScanLastEndGateT = aEndGateT;
}

function drawAScanOverlay() {
    fit(aScanOverlay);
    const w = aScanOverlay.width, h = aScanOverlay.height;
    aOX.clearRect(0, 0, w, h);
    if (!aScanVtkInitialized) return;
    const pad = getAScanPad();
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const xTickY = pad.t + ph + CHART_X_TICK_Y;
    const xAxisTitleY = pad.t + ph + pad.b - CHART_X_AXIS_TITLE_OFFSET;
    const toX = t => pad.l + (t - A_TMIN) / (A_TMAX - A_TMIN) * pw;
    const toY = v => pad.t + (1 - v / A_VMAX) * ph;

    drawChartAxes(aOX, pad, pw, ph);

    // Y ticks and axis title
    aOX.fillStyle = 'rgba(107,138,170,.8)'; aOX.font = '7px JetBrains Mono';
    for (let v = 0; v <= A_VMAX; v += 80) aOX.fillText(v, CHART_Y_TICK_X, toY(v) + 3);
    aOX.save();
    aOX.translate(10, pad.t + ph / 2); aOX.rotate(-Math.PI / 2);
    aOX.fillStyle = 'rgba(107,138,170,.7)'; aOX.font = '8px Inter';
    aOX.textAlign = 'center'; aOX.fillText('Signal, mV', 0, 0);
    aOX.textAlign = 'left'; aOX.restore();

    // X ticks and axis title
    for (let t = A_TMIN; t <= A_TMAX; t += 1) {
        aOX.fillStyle = 'rgba(107,138,170,.7)'; aOX.font = '7px JetBrains Mono';
        aOX.fillText(t, toX(t) - 5, xTickY);
    }
    aOX.fillStyle = 'rgba(107,138,170,.7)'; aOX.font = '8px Inter';
    aOX.textAlign = 'center'; aOX.fillText('µs', pad.l + pw / 2, xAxisTitleY);
    aOX.textAlign = 'left';

    // Gate labels — left AND right edges
    A_GATES.forEach(([t0, t1, , stroke, lbl]) => {
        aOX.font = '7px JetBrains Mono';
        aOX.fillStyle = stroke;
        aOX.fillText(`‹${lbl}`, toX(t0) + 3, pad.t + 10);
        aOX.fillText(`${lbl}›`, toX(t1) + 3, pad.t + 10);
    });
    // Gate fill name centered at bottom
    A_GATES.forEach(([t0, t1, fill, , lbl]) => {
        aOX.font = 'bold 6.5px JetBrains Mono';
        aOX.fillStyle = fill;
        aOX.textAlign = 'center';
        aOX.fillText(lbl, (toX(t0) + toX(t1)) / 2, pad.t + ph - 8);
        aOX.textAlign = 'left';
    });

    // Start Gate / End Gate labels
    aOX.font = '7px JetBrains Mono';
    aOX.fillStyle = 'rgba(130,210,230,.9)';
    aOX.fillText('Start', toX(aStartGateT) - 10, pad.t + ph - 2);
    aOX.fillStyle = 'rgba(250,200,100,.9)';
    aOX.fillText('End', toX(aEndGateT) - 6, pad.t + ph - 2);

    // Start / End Gate hover indicators
    if (aScanHoverStartGate || aScanDragStartGate) {
        const x = toX(aStartGateT);
        aOX.strokeStyle = 'rgba(130,210,230,1)';
        aOX.lineWidth = 2.5;
        aOX.beginPath();
        aOX.moveTo(x, pad.t + 4);
        aOX.lineTo(x, pad.t + ph - 4);
        aOX.stroke();
        aOX.fillStyle = 'rgba(130,210,230,1)';
        aOX.beginPath();
        aOX.arc(x, pad.t + 4, 3.5, 0, Math.PI * 2);
        aOX.arc(x, pad.t + ph - 4, 3.5, 0, Math.PI * 2);
        aOX.fill();
    }
    if (aScanHoverEndGate || aScanDragEndGate) {
        const x = toX(aEndGateT);
        aOX.strokeStyle = 'rgba(250,200,100,1)';
        aOX.lineWidth = 2.5;
        aOX.beginPath();
        aOX.moveTo(x, pad.t + 4);
        aOX.lineTo(x, pad.t + ph - 4);
        aOX.stroke();
        aOX.fillStyle = 'rgba(250,200,100,1)';
        aOX.beginPath();
        aOX.arc(x, pad.t + 4, 3.5, 0, Math.PI * 2);
        aOX.arc(x, pad.t + ph - 4, 3.5, 0, Math.PI * 2);
        aOX.fill();
    }

    // Gate edge hover indicators
    if (aScanHoverGate || aScanDragGate) {
        const h = aScanHoverGate || aScanDragGate;
        const g = A_GATES[h.gateIdx];
        const isLeft = h.edge === 'left';
        const edgeX = toX(isLeft ? g[0] : g[1]);
        const color = h.gateIdx === 0 ? '130,210,230' : '250,200,100';
        const name = h.gateIdx === 0 ? 'Gate A' : 'Gate B';
        const side = isLeft ? '‹' : '›';
        // Tall vertical drag handle
        aOX.strokeStyle = `rgba(${color},1)`;
        aOX.lineWidth = 2.5;
        aOX.beginPath();
        aOX.moveTo(edgeX, pad.t + 4);
        aOX.lineTo(edgeX, pad.t + ph - 4);
        aOX.stroke();
        // Small circles at top/bottom
        aOX.fillStyle = `rgba(${color},1)`;
        aOX.beginPath();
        aOX.arc(edgeX, pad.t + 4, 3.5, 0, Math.PI * 2);
        aOX.arc(edgeX, pad.t + ph - 4, 3.5, 0, Math.PI * 2);
        aOX.fill();
        // Edge label right at the line
        aOX.font = 'bold 8px JetBrains Mono';
        aOX.fillStyle = `rgba(${color},1)`;
        aOX.textAlign = 'center';
        const label = `${side}${name}`;
        aOX.fillText(label, edgeX, pad.t + 20);
        aOX.textAlign = 'left';
    }

    // Threshold labels in right gutter
    aOX.fillStyle = 'rgba(244,63,94,.8)'; aOX.font = '7px JetBrains Mono';
    const threshLabel = aThresholdSolid.toString();
    aOX.fillText(threshLabel, pad.l + pw + 2, toY(aThresholdSolid) + 3);
    // Drag indicator circle on solid threshold line
    if (aScanHoverThreshold || aScanDragThreshold) {
        aOX.beginPath();
        aOX.arc(pad.l + pw - 4, toY(aThresholdSolid), 4, 0, Math.PI * 2);
        aOX.fillStyle = 'rgba(244,63,94,.9)';
        aOX.fill();
        aOX.strokeStyle = 'rgba(244,63,94,1)';
        aOX.lineWidth = 1.5;
        aOX.stroke();
    }
    aOX.fillStyle = 'rgba(244,63,94,.6)';
    aOX.fillText(` ${aThresholdDash}`, pad.l + pw + 2, toY(aThresholdDash) + 3);
    // Drag indicator circle on dashed threshold line
    if (aScanHoverThresholdDash || aScanDragThresholdDash) {
        aOX.beginPath();
        aOX.arc(pad.l + pw - 4, toY(aThresholdDash), 4, 0, Math.PI * 2);
        aOX.fillStyle = 'rgba(244,63,94,.7)';
        aOX.fill();
        aOX.strokeStyle = 'rgba(244,63,94,.9)';
        aOX.lineWidth = 1.2;
        aOX.stroke();
    }

    // Info box
    aOX.fillStyle = 'rgba(6,13,26,.7)'; aOX.fillRect(pad.l + 2, pad.t, 140, 55);
    aOX.fillStyle = 'rgba(180,200,220,.85)'; aOX.font = '8px JetBrains Mono';
    aOX.fillText('U(r) : 0.00 us',      pad.l + 5, pad.t + 11);
    aOX.fillText('U(m) : 135.73 us',    pad.l + 5, pad.t + 22);
    aOX.fillText('U(m-r)/2 : 67.87 us', pad.l + 5, pad.t + 33);
    aOX.fillStyle = 'rgba(244,63,94,.7)'; aOX.font = '6px JetBrains Mono';
    aOX.fillText(`PW1: ${aThresholdSolid}mV`, pad.l + 5, pad.t + 44);
    aOX.fillStyle = 'rgba(244,63,94,.5)'; aOX.font = '6px JetBrains Mono';
    aOX.fillText(`PW2: ${aThresholdDash}mV`, pad.l + 5, pad.t + 52);

    // Metadata line
    aOX.fillStyle = 'rgba(0,212,255,.7)'; aOX.font = '7.5px JetBrains Mono';
    aOX.textAlign = 'right';
    aOX.fillText('T=7.30  N=7.80  WI=6.41%', pad.l + pw, pad.t - 4);
    aOX.textAlign = 'left';
}

function initAScanVTK() {
    if (aScanVtkInitialized) return;
    aScanVtkInitialized = true;

    aScanVtkRenderer = vtkRenderer.newInstance();
    aScanVtkRenderer.setBackground(0.039, 0.082, 0.125, 1.0);
    aScanVtkRenderer.setLightFollowCamera(false);

    aScanVtkRenderWindow = vtkRenderWindow.newInstance();
    aScanVtkRenderWindow.addRenderer(aScanVtkRenderer);

    aScanVtkOpenGLWindow = vtkOpenGLRenderWindow.newInstance();
    aScanVtkOpenGLWindow.setContainer(aScanVtkContainer);
    aScanVtkRenderWindow.addView(aScanVtkOpenGLWindow);

    layoutAScanVtkContainer();
    buildAScanScene();
}

function updateAScanVTK() {
    drawAScanOverlay();
    if (!aScanVtkOpenGLWindow) return;
    const { width, height } = aScanVtkContainer.getBoundingClientRect();
    const aspect = height > 0 ? width / height : 1.5;
    if (Math.abs(aspect - aScanLastAspect) > 0.005 || aCursorT !== aScanLastCursorT || aStartGateT !== aScanLastStartGateT || aEndGateT !== aScanLastEndGateT) {
        buildAScanScene();
    }
}

function resizeAScanVTK() {
    if (!aScanVtkOpenGLWindow) return;
    layoutAScanVtkContainer();
    const { width, height } = aScanVtkContainer.getBoundingClientRect();
    if (width > 0 && height > 0) buildAScanScene();
}

let aScanDragThreshold = false;
let aScanHoverThreshold = false;
let aScanDragThresholdDash = false;
let aScanHoverThresholdDash = false;

// Gate edge dragging state
let aScanDragGate = null; // { gateIdx, edge: 'left'|'right' } or null
let aScanHoverGate = null; // { gateIdx, edge: 'left'|'right' } or null
const A_GATE_EDGE_SNAP = 8; // px snap distance

// Start / End Gate dragging state
let aScanDragStartGate = false;
let aScanHoverStartGate = false;
let aScanDragEndGate = false;
let aScanHoverEndGate = false;

function aScanScreenToValue(clientY) {
    const r = aScanOverlay.getBoundingClientRect();
    const pad = getAScanPad();
    const ph = r.height - pad.t - pad.b;
    const frac = 1 - (clientY - r.top - pad.t) / ph;
    return clamp(Math.round(frac * A_VMAX), 0, A_VMAX);
}

function aScanScreenToTime(clientX) {
    const r = aScanOverlay.getBoundingClientRect();
    const pad = getAScanPad();
    const pw = r.width - pad.l - pad.r;
    const frac = (clientX - r.left - pad.l) / pw;
    return clamp(A_TMIN + frac * (A_TMAX - A_TMIN), A_TMIN, A_TMAX);
}

function aScanFindHoverGate(clientX) {
    const r = aScanOverlay.getBoundingClientRect();
    const pad = getAScanPad();
    const pw = r.width - pad.l - pad.r;
    const toX = t => pad.l + (t - A_TMIN) / (A_TMAX - A_TMIN) * pw;
    for (let i = 0; i < A_GATES.length; i++) {
        const g = A_GATES[i];
        const gx0 = r.left + toX(g[0]);
        const gx1 = r.left + toX(g[1]);
        if (Math.abs(clientX - gx0) < A_GATE_EDGE_SNAP) return { gateIdx: i, edge: 'left' };
        if (Math.abs(clientX - gx1) < A_GATE_EDGE_SNAP) return { gateIdx: i, edge: 'right' };
    }
    return null;
}

aScanOverlay.addEventListener('mousedown', e => {
    const nx = e.clientX, ny = e.clientY;
    const r = aScanOverlay.getBoundingClientRect();
    const pad = getAScanPad();
    const pw = r.width - pad.l - pad.r;
    const ph = r.height - pad.t - pad.b;
    const toX = t => r.left + pad.l + (t - A_TMIN) / (A_TMAX - A_TMIN) * pw;
    const toY = v => r.top + pad.t + (1 - v / A_VMAX) * ph;
    const sx = toX(aStartGateT), ex = toX(aEndGateT);
    const dS = Math.abs(nx - sx), dE = Math.abs(nx - ex);

    // Check Start Gate first, then End Gate, then gate edges, then thresholds
    if (dS < A_GATE_EDGE_SNAP && dS <= dE) {
        aScanDragStartGate = true;
        aScanOverlay.style.cursor = 'ew-resize';
        return;
    }
    if (dE < A_GATE_EDGE_SNAP) {
        aScanDragEndGate = true;
        aScanOverlay.style.cursor = 'ew-resize';
        return;
    }
    const gateHit = aScanFindHoverGate(nx);
    if (gateHit) {
        aScanDragGate = gateHit;
        aScanOverlay.style.cursor = 'ew-resize';
        return;
    }
    // Check thresholds — bounded by X position
    const mouseT = aScanScreenToTime(nx);
    const inSolidSpan = mouseT >= aStartGateT && mouseT <= A_GATES[0][1];
    const inDashSpan = mouseT >= A_GATES[1][0] && mouseT <= aEndGateT;
    const solidYpx = toY(aThresholdSolid);
    const dashYpx = toY(aThresholdDash);
    const ds = Math.abs(ny - solidYpx);
    const dd = Math.abs(ny - dashYpx);

    // Dashed threshold (within PW2 span, closer than solid)
    if (inDashSpan && dd < 8 && (!inSolidSpan || dd <= ds)) {
        aScanDragThresholdDash = true;
        aScanOverlay.style.cursor = 'ns-resize';
        aThresholdDash = aScanScreenToValue(ny);
        buildAScanScene();
        drawAScanOverlay();
        return;
    }
    // Solid threshold (within PW1 span)
    if (inSolidSpan && ds < 8) {
        aScanDragThreshold = true;
        aScanOverlay.style.cursor = 'ns-resize';
        aThresholdSolid = aScanScreenToValue(ny);
        buildAScanScene();
        drawAScanOverlay();
        return;
    }
});
window.addEventListener('mousemove', e => {
    const nx = e.clientX, ny = e.clientY;

    // Start Gate drag
    if (aScanDragStartGate) {
        aStartGateT = aScanScreenToTime(nx);
        buildAScanScene();
        drawAScanOverlay();
        return;
    }
    // End Gate drag
    if (aScanDragEndGate) {
        aEndGateT = aScanScreenToTime(nx);
        buildAScanScene();
        drawAScanOverlay();
        return;
    }
    // Gate edge drag
    if (aScanDragGate) {
        const newT = aScanScreenToTime(nx);
        const g = A_GATES[aScanDragGate.gateIdx];
        if (aScanDragGate.edge === 'left') {
            g[0] = clamp(newT, A_TMIN, g[1] - 0.5);
        } else {
            g[1] = clamp(newT, g[0] + 0.5, A_TMAX);
        }
        if (aScanDragGate.gateIdx === 0) {
            A_GATES[0][1] = Math.min(A_GATES[0][1], A_GATES[1][0] - 0.3);
            A_GATES[1][0] = Math.max(A_GATES[1][0], A_GATES[0][1] + 0.3);
        }
        if (aScanDragGate.gateIdx === 1) {
            A_GATES[1][0] = Math.max(A_GATES[1][0], A_GATES[0][1] + 0.3);
            A_GATES[0][1] = Math.min(A_GATES[0][1], A_GATES[1][0] - 0.3);
        }
        buildAScanScene();
        drawAScanOverlay();
        return;
    }
    // Dashed threshold drag
    if (aScanDragThresholdDash) {
        aThresholdDash = aScanScreenToValue(ny);
        buildAScanScene();
        drawAScanOverlay();
        return;
    }
    // Solid threshold drag
    if (aScanDragThreshold) {
        aThresholdSolid = aScanScreenToValue(ny);
        buildAScanScene();
        drawAScanOverlay();
        return;
    }
    // Hover feedback
    const r = aScanOverlay.getBoundingClientRect();
    const pad = getAScanPad();
    const pw = r.width - pad.l - pad.r;
    const ph = r.height - pad.t - pad.b;
    const toY = v => pad.t + (1 - v / A_VMAX) * ph;
    const toX = t => r.left + pad.l + (t - A_TMIN) / (A_TMAX - A_TMIN) * pw;

    const sx = toX(aStartGateT), ex = toX(aEndGateT);
    const dS = Math.abs(nx - sx), dE = Math.abs(nx - ex);
    let cursor = 'default';
    let redraw = false;

    // Start Gate hover
    const nearStart = dS < A_GATE_EDGE_SNAP && dS <= dE;
    if (nearStart !== aScanHoverStartGate) { aScanHoverStartGate = nearStart; redraw = true; }
    if (nearStart) cursor = 'ew-resize';

    // End Gate hover
    const nearEnd = dE < A_GATE_EDGE_SNAP && (!nearStart || dE <= dS);
    if (nearEnd !== aScanHoverEndGate) { aScanHoverEndGate = nearEnd; redraw = true; }
    if (nearEnd) cursor = 'ew-resize';

    if (!nearStart && !nearEnd) {
        // Check gate edges
        let newHoverGate = null;
        for (let i = 0; i < A_GATES.length; i++) {
            const g = A_GATES[i];
            const gx0 = toX(g[0]), gx1 = toX(g[1]);
            if (Math.abs(nx - gx0) < A_GATE_EDGE_SNAP) { newHoverGate = { gateIdx: i, edge: 'left' }; break; }
            if (Math.abs(nx - gx1) < A_GATE_EDGE_SNAP) { newHoverGate = { gateIdx: i, edge: 'right' }; break; }
        }
        if (newHoverGate !== aScanHoverGate) { aScanHoverGate = newHoverGate; redraw = true; }
        if (newHoverGate) cursor = 'ew-resize';

        // Convert mouse X to time domain for bounded checks
        const mouseT = aScanScreenToTime(nx);

        // Check solid threshold — only active between Start Gate and Gate A right edge
        const inSolidSpan = mouseT >= aStartGateT && mouseT <= A_GATES[0][1];
        const solidYpx = r.top + toY(aThresholdSolid);
        const nearSolid = inSolidSpan && Math.abs(ny - solidYpx) < 8;
        if (nearSolid !== aScanHoverThreshold) { aScanHoverThreshold = nearSolid; redraw = true; }
        if (nearSolid && !newHoverGate) cursor = 'ns-resize';

        // Check dashed threshold — only active between Gate B left edge and End Gate
        const inDashSpan = mouseT >= A_GATES[1][0] && mouseT <= aEndGateT;
        const dashYpx = r.top + toY(aThresholdDash);
        const nearDash = inDashSpan && Math.abs(ny - dashYpx) < 8;
        if (nearDash !== aScanHoverThresholdDash) { aScanHoverThresholdDash = nearDash; redraw = true; }
        if (nearDash && !newHoverGate && !nearSolid) cursor = 'ns-resize';
    } else {
        if (aScanHoverGate) { aScanHoverGate = null; redraw = true; }
        if (aScanHoverThreshold) { aScanHoverThreshold = false; redraw = true; }
        if (aScanHoverThresholdDash) { aScanHoverThresholdDash = false; redraw = true; }
    }

    aScanOverlay.style.cursor = cursor;
    if (redraw) drawAScanOverlay();
});
window.addEventListener('mouseup', () => {
    aScanDragThreshold = false;
    aScanDragThresholdDash = false;
    aScanDragGate = null;
    aScanDragStartGate = false;
    aScanDragEndGate = false;
});
aScanOverlay.addEventListener('mouseleave', () => {
    if (!aScanDragThreshold && !aScanDragThresholdDash && !aScanDragGate && !aScanDragStartGate && !aScanDragEndGate) {
        aScanHoverThreshold = false;
        aScanHoverThresholdDash = false;
        aScanHoverGate = null;
        aScanHoverStartGate = false;
        aScanHoverEndGate = false;
        aScanOverlay.style.cursor = 'default';
        drawAScanOverlay();
    }
});


// ── Panel 2: Range Selection — vtk.js Heatmap ─────────────────────────────────
const rangeOverlay = document.getElementById('rangeOverlay');
const rOX = rangeOverlay.getContext('2d');
const rangeVtkContainer = document.getElementById('rangeVtkContainer');

function buildRangeScene() {
    if (!dataMap || !rangeVtkOpenGLWindow) return;
    layoutRangeContainer();
    rangeVtkRenderer.removeAllActors();

    const { width, height } = rangeVtkContainer.getBoundingClientRect();
    const aspect = height > 0 ? width / height : 1;

    const worldHeight = 12;
    const worldWidth = worldHeight * aspect;

    const nAxial = 200, nCirc = 200;
    const totalPts = nAxial * nCirc;
    const positions = new Float64Array(totalPts * 3);
    const scalars = new Float32Array(totalPts);

    for (let ia = 0; ia < nAxial; ia++) {
        const t = ia / (nAxial - 1);
        const dx = Math.floor(t * (DATA_W - 1));
        const x = (t - 0.5) * worldWidth;
        for (let ic = 0; ic < nCirc; ic++) {
            const dy = Math.floor((ic / nCirc) * (DATA_H - 1));
            const v = dataMap[dy][dx];
            const y2 = (0.5 - ic / nCirc) * worldHeight;
            const idx = (ia * nCirc + ic) * 3;
            positions[idx] = x;
            positions[idx + 1] = y2;
            positions[idx + 2] = 0;
            scalars[ia * nCirc + ic] = v;
        }
    }

    const cells = [];
    for (let ia = 0; ia < nAxial - 1; ia++) {
        for (let ic = 0; ic < nCirc - 1; ic++) {
            const i0 = ia * nCirc + ic;
            const i1 = ia * nCirc + ic + 1;
            const i2 = (ia + 1) * nCirc + ic;
            const i3 = (ia + 1) * nCirc + ic + 1;
            cells.push(3, i0, i1, i2);
            cells.push(3, i1, i3, i2);
        }
    }

    const polyData = vtkPolyData.newInstance();
    const ptsObj = vtkPoints.newInstance();
    ptsObj.setData(positions, 3);
    polyData.setPoints(ptsObj);
    const cellArray = vtkCellArray.newInstance();
    cellArray.setData(new Uint32Array(cells));
    polyData.setPolys(cellArray);
    const scalarsDA = vtkDataArray.newInstance({ name: 'wallLoss', values: scalars, numberOfComponents: 1 });
    polyData.getPointData().setScalars(scalarsDA);

    const ctf = buildActiveCTF();

    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);
    mapper.setLookupTable(ctf);
    mapper.setScalarVisibility(true);
    mapper.setColorByArrayName('wallLoss');
    mapper.setScalarRange(cScanColorRange.min, cScanColorRange.max);
    mapper.setUseLookupTableScalarRange(true);
    mapper.setScalarModeToUsePointData();

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setInterpolationToFlat();
    actor.getProperty().setAmbient(1.0);
    actor.getProperty().setDiffuse(0.0);
    actor.getProperty().setSpecular(0.0);
    rangeVtkRenderer.addActor(actor);

    rangeVtkRenderer.resetCamera();
    const cam = rangeVtkRenderer.getActiveCamera();
    cam.setPosition(0, 0, 18);
    cam.setFocalPoint(0, 0, 0);
    cam.setViewUp(0, 1, 0);
    cam.setParallelProjection(true);
    cam.setParallelScale(worldHeight / 2);
    cam.setClippingRange(0.1, 100);

    if (width > 0 && height > 0) {
        rangeVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
    }
    rangeVtkRenderWindow.render();
}

function initVTK() {
    if (vtkInitialized) return;
    vtkInitialized = true;

    vtkRendererInstance = vtkRenderer.newInstance();
    vtkRendererInstance.setBackground(0.025, 0.05, 0.1, 1.0);
    vtkRendererInstance.setLightFollowCamera(false);

    const light1 = vtkLight.newInstance();
    light1.setPosition(-5, 5, 8);
    light1.setIntensity(0.9);
    light1.setColor(1, 0.95, 0.9);
    vtkRendererInstance.addLight(light1);

    const light2 = vtkLight.newInstance();
    light2.setPosition(5, -3, -5);
    light2.setIntensity(0.35);
    light2.setColor(0.85, 0.9, 1);
    vtkRendererInstance.addLight(light2);

    const light3 = vtkLight.newInstance();
    light3.setPosition(0, 0, 12);
    light3.setIntensity(0.2);
    light3.setColor(0.9, 0.95, 1);
    vtkRendererInstance.addLight(light3);

    vtkRenderWindowInstance = vtkRenderWindow.newInstance();
    vtkRenderWindowInstance.addRenderer(vtkRendererInstance);

    vtkOpenGLWindow = vtkOpenGLRenderWindow.newInstance();
    vtkOpenGLWindow.setContainer(vtkContainer);
    vtkRenderWindowInstance.addView(vtkOpenGLWindow);
    layoutCScanContainer();

    vtkInteractorInstance = vtkRenderWindowInteractor.newInstance();
    vtkInteractorInstance.setView(vtkOpenGLWindow);
    vtkInteractorInstance.initialize();
    vtkInteractorInstance.bindEvents(vtkContainer);

    const trackball = vtkInteractorStyleTrackballCamera.newInstance();
    vtkInteractorInstance.setInteractorStyle(trackball);

    buildHeatmapScene();
}

function buildHeatmapScene() {
    layoutCScanContainer();
    vtkRendererInstance.removeAllActors();
    vtkSceneMode = 'heatmap';
    if (!dataMap) return;

    const { width, height } = vtkContainer.getBoundingClientRect();
    const plotAspect = height > 0 ? width / height : 1;

    const x0 = zoom.x0 * DATA_W, x1 = zoom.x1 * DATA_W;
    const y0 = zoom.y0 * DATA_H, y1 = zoom.y1 * DATA_H;
    const worldWidth = 12;
    const worldHeight = worldWidth / Math.max(plotAspect, 1);

    const nAxial = 200, nCirc = 200;
    const totalPts = nAxial * nCirc;
    const positions = new Float64Array(totalPts * 3);
    const scalars = new Float32Array(totalPts);

    for (let ia = 0; ia < nAxial; ia++) {
        const t = ia / (nAxial - 1);
        const dx = clamp(Math.floor(x0 + t * (x1 - x0)), 0, DATA_W - 1);
        const x = (t - 0.5) * worldWidth;
        for (let ic = 0; ic < nCirc; ic++) {
            const dy = clamp(Math.floor(y0 + (ic / nCirc) * (y1 - y0)), 0, DATA_H - 1);
            const v = dataMap[dy][dx];
            const y2 = (0.5 - ic / nCirc) * worldHeight;
            const idx = (ia * nCirc + ic) * 3;
            positions[idx] = x;
            positions[idx + 1] = y2;
            positions[idx + 2] = 0;
            scalars[ia * nCirc + ic] = v;
        }
    }

    const cells = [];
    for (let ia = 0; ia < nAxial - 1; ia++) {
        for (let ic = 0; ic < nCirc - 1; ic++) {
            const i0 = ia * nCirc + ic;
            const i1 = ia * nCirc + ic + 1;
            const i2 = (ia + 1) * nCirc + ic;
            const i3 = (ia + 1) * nCirc + ic + 1;
            cells.push(3, i0, i1, i2);
            cells.push(3, i1, i3, i2);
        }
    }

    const polyData = vtkPolyData.newInstance();
    const ptsObj = vtkPoints.newInstance();
    ptsObj.setData(positions, 3);
    polyData.setPoints(ptsObj);
    const cellArray = vtkCellArray.newInstance();
    cellArray.setData(new Uint32Array(cells));
    polyData.setPolys(cellArray);
    const scalarsDA = vtkDataArray.newInstance({ name: 'wallLoss', values: scalars, numberOfComponents: 1 });
    polyData.getPointData().setScalars(scalarsDA);

    const ctf = buildActiveCTF();

    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);
    mapper.setScalarVisibility(true);
    mapper.setLookupTable(ctf);
    mapper.setColorByArrayName('wallLoss');
    mapper.setScalarRange(cScanColorRange.min, cScanColorRange.max);
    mapper.setUseLookupTableScalarRange(true);
    mapper.setScalarModeToUsePointData();

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setInterpolationToFlat();
    actor.getProperty().setAmbient(1.0);
    actor.getProperty().setDiffuse(0.0);
    actor.getProperty().setSpecular(0.0);
    vtkRendererInstance.addActor(actor);

    vtkHeatmapBuilt = true;
    vtkRendererInstance.resetCamera();
    const cam = vtkRendererInstance.getActiveCamera();
    cam.setPosition(0, 0, 18);
    cam.setFocalPoint(0, 0, 0);
    cam.setViewUp(0, 1, 0);
    cam.setParallelProjection(true);
    cam.setParallelScale(worldHeight / 2);
    cam.setClippingRange(0.1, 100);

    if (width > 0 && height > 0) {
        vtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
    }
    vtkRenderWindowInstance.render();
}

function initRangeVTK() {
    if (rangeVtkInitialized) return;
    rangeVtkInitialized = true;

    rangeVtkRenderer = vtkRenderer.newInstance();
    rangeVtkRenderer.setBackground(0.025, 0.05, 0.1, 1.0);
    rangeVtkRenderer.setLightFollowCamera(false);

    const rLight1 = vtkLight.newInstance();
    rLight1.setPosition(-5, 5, 8);
    rLight1.setIntensity(0.9);
    rLight1.setColor(1, 0.95, 0.9);
    rangeVtkRenderer.addLight(rLight1);

    const rLight2 = vtkLight.newInstance();
    rLight2.setPosition(5, -3, -5);
    rLight2.setIntensity(0.35);
    rLight2.setColor(0.85, 0.9, 1);
    rangeVtkRenderer.addLight(rLight2);

    const rLight3 = vtkLight.newInstance();
    rLight3.setPosition(0, 0, 12);
    rLight3.setIntensity(0.2);
    rLight3.setColor(0.9, 0.95, 1);
    rangeVtkRenderer.addLight(rLight3);

    rangeVtkRenderWindow = vtkRenderWindow.newInstance();
    rangeVtkRenderWindow.addRenderer(rangeVtkRenderer);

    rangeVtkOpenGLWindow = vtkOpenGLRenderWindow.newInstance();
    rangeVtkOpenGLWindow.setContainer(rangeVtkContainer);
    rangeVtkRenderWindow.addView(rangeVtkOpenGLWindow);

    layoutRangeContainer();
    buildRangeScene();
}

function resizeRangeVTK() {
    if (!rangeVtkOpenGLWindow) return;
    layoutRangeContainer();
    const { width, height } = rangeVtkContainer.getBoundingClientRect();
    if (width > 0 && height > 0) {
        rangeVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
        rangeVtkRenderWindow.render();
    }
}

function drawRangeOverlay() {
    const p = rangeVtkContainer.parentElement;
    const w = p.clientWidth, h = p.clientHeight;
    if (rangeOverlay.width !== w || rangeOverlay.height !== h) {
        rangeOverlay.width = w; rangeOverlay.height = h;
    }
    rOX.clearRect(0, 0, w, h);
    if (!dataMap) return;

    const pad = getRangePad();
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;

    const PIPE_M = 2000;
    const bottomAxisY = pad.t + ph;
    const xTickY = bottomAxisY + CHART_X_TICK_Y;

    // Draw grid axes
    drawChartAxes(rOX, pad, pw, ph);

    // Distance ticks and lines
    const distTicks = [0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000];
    distTicks.forEach(m => {
        const x = pad.l + (m / PIPE_M) * pw;
        // Grid vertical lines
        rOX.strokeStyle = 'rgba(0,212,255,.22)'; rOX.lineWidth = .6;
        rOX.beginPath(); rOX.moveTo(x, pad.t); rOX.lineTo(x, bottomAxisY); rOX.stroke();
        // Ticks
        rOX.strokeStyle = 'rgba(107,138,170,.45)'; rOX.lineWidth = .8;
        rOX.beginPath(); rOX.moveTo(x, bottomAxisY); rOX.lineTo(x, bottomAxisY + 6); rOX.stroke();
        // Label
        rOX.fillStyle = 'rgba(0,212,255,.65)'; rOX.font = '7.5px JetBrains Mono';
        rOX.fillText(m >= 1000 ? (m / 1000).toFixed(1) + 'km' : m + 'm', x - 10, xTickY);
    });

    // Joint indicators (J1 - J5)
    for (let i = 1; i < 6; i++) {
        const x = pad.l + (i / 6) * pw;
        rOX.strokeStyle = 'rgba(0,212,255,.15)'; rOX.lineWidth = .5;
        rOX.beginPath(); rOX.moveTo(x, pad.t); rOX.lineTo(x, bottomAxisY); rOX.stroke();
        rOX.fillStyle = 'rgba(0,212,255,.4)'; rOX.font = '7px JetBrains Mono';
        rOX.fillText('J' + i, x + 1, pad.t + 9);
    }

    // Circumferential angle labels
    ['0°', '90°', '180°', '270°', '360°'].forEach((lbl, i) => {
        const y = pad.t + (i / 4) * ph;
        rOX.strokeStyle = 'rgba(107,138,170,.18)'; rOX.lineWidth = .4;
        rOX.beginPath(); rOX.moveTo(pad.l, y); rOX.lineTo(pad.l + pw, y); rOX.stroke();
        rOX.fillStyle = 'rgba(107,138,170,.6)'; rOX.font = '7px JetBrains Mono';
        rOX.fillText(lbl, CHART_Y_TICK_X, y + 3);
    });

    // Zoom region box
    const zx0 = pad.l + zoom.x0 * pw;
    const zy0 = pad.t + zoom.y0 * ph;
    const zx1 = pad.l + zoom.x1 * pw;
    const zy1 = pad.t + zoom.y1 * ph;

    rOX.strokeStyle = '#00d4ff'; rOX.lineWidth = 1.5;
    rOX.strokeRect(zx0, zy0, zx1 - zx0, zy1 - zy0);
    rOX.fillStyle = 'rgba(255,255,255,.035)';
    rOX.fillRect(zx0, zy0, zx1 - zx0, zy1 - zy0);

    // Darken outside of zoom region
    rOX.fillStyle = 'rgba(6,13,26,.28)';
    rOX.fillRect(pad.l, pad.t, zx0 - pad.l, ph); // Left
    rOX.fillRect(zx1, pad.t, pad.l + pw - zx1, ph); // Right
    rOX.fillRect(zx0, pad.t, zx1 - zx0, zy0 - pad.t); // Top
    rOX.fillRect(zx0, zy1, zx1 - zx0, pad.t + ph - zy1); // Bottom

    // Drag handles at zoom box corners
    [[zx0, zy0], [zx1, zy0], [zx0, zy1], [zx1, zy1]].forEach(([cx, cy]) => {
        rOX.fillStyle = '#00d4ff'; rOX.beginPath(); rOX.arc(cx, cy, 3.5, 0, PI2); rOX.fill();
        rOX.strokeStyle = 'rgba(255,255,255,.65)'; rOX.lineWidth = 1;
        rOX.beginPath(); rOX.arc(cx, cy, 5.5, 0, PI2); rOX.stroke();
    });

    // Center crosshair (from csX and csY)
    const cxF = pad.l + (csX / DATA_W) * pw;
    const cyF = pad.t + (csY / DATA_H) * ph;

    rOX.strokeStyle = 'rgba(255,255,255,.75)'; rOX.lineWidth = .8; rOX.setLineDash([2, 2]);
    rOX.beginPath(); rOX.moveTo(cxF, zy0); rOX.lineTo(cxF, zy1); rOX.stroke();
    rOX.beginPath(); rOX.moveTo(zx0, cyF); rOX.lineTo(zx1, cyF); rOX.stroke();
    rOX.setLineDash([]);

    rOX.fillStyle = '#ffffff'; rOX.beginPath(); rOX.arc(cxF, cyF, 3, 0, PI2); rOX.fill();

    // Text labels for ZOOM region
    const zoomLabel = (zoom.x0 * PIPE_M).toFixed(0) + 'm - ' + (zoom.x1 * PIPE_M).toFixed(0) + 'm';
    const zoomChipW = Math.max(92, zoomLabel.length * 4.8);
    const zoomChipY = Math.max(pad.t + 2, zy0 + 2);
    rOX.fillStyle = 'rgba(6,13,26,.82)';
    rOX.fillRect(zx0 + 3, zoomChipY, zoomChipW, 18);
    rOX.strokeStyle = 'rgba(0,212,255,.45)';
    rOX.lineWidth = .8;
    rOX.strokeRect(zx0 + 3, zoomChipY, zoomChipW, 18);
    rOX.fillStyle = 'rgba(0,212,255,.92)'; rOX.font = '7px Inter';
    rOX.fillText('ZOOM', zx0 + 7, zoomChipY + 7);
    rOX.fillStyle = 'rgba(160,235,255,.86)'; rOX.font = '7px JetBrains Mono';
    rOX.fillText(zoomLabel, zx0 + 7, zoomChipY + 15);

    // Colorbar on the right side of the plot region
    const barW = 11;
    const barH = ph * .65;
    const barX = pad.l + pw + 6;
    const barY = pad.t + (ph - barH) / 2;

    const bg = rOX.createLinearGradient(0, barY, 0, barY + barH);
    ['#ff1414', '#ff5000', '#dcc800', '#00dc64', '#00c8c8', '#0050b4', '#0a1450'].forEach((c, i) => bg.addColorStop(i / 6, c));
    rOX.fillStyle = bg; rOX.fillRect(barX, barY, barW, barH);
    rOX.strokeStyle = 'rgba(30,51,82,.8)'; rOX.lineWidth = .5; rOX.strokeRect(barX, barY, barW, barH);
    rOX.fillStyle = 'rgba(107,138,170,.8)'; rOX.font = '7.5px JetBrains Mono';
    rOX.fillText('100%', barX - 18, barY + 5);
    rOX.fillText('0%', barX - 10, barY + barH + 3);
}

let rangeDrag = false, rangeDragStart = { x: 0, y: 0 }, zoomStart = { ...zoom };
rangeVtkContainer.addEventListener('mousedown', e => {
    const r = rangeVtkContainer.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    if (px > zoom.x0 && px < zoom.x1 && py > zoom.y0 && py < zoom.y1) {
        rangeDrag = true;
        rangeDragStart = { x: px, y: py };
        zoomStart = { ...zoom };
    }
});
window.addEventListener('mousemove', e => {
    if (!rangeDrag) return;
    const r = rangeVtkContainer.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const dx = px - rangeDragStart.x, dy = py - rangeDragStart.y;
    const w_ = zoomStart.x1 - zoomStart.x0, h2 = zoomStart.y1 - zoomStart.y0;
    zoom.x0 = clamp(zoomStart.x0 + dx, 0, 1 - w_); zoom.x1 = zoom.x0 + w_;
    zoom.y0 = clamp(zoomStart.y0 + dy, 0, 1 - h2); zoom.y1 = zoom.y0 + h2;
    updateHeatmap();
});
window.addEventListener('mouseup', () => { rangeDrag = false; });

// ── Panel 3: B-Scan (Vertical Profile) ───────────────────────────────────────
const bScanOverlay = document.getElementById('bScanOverlay');
const bX = bScanOverlay.getContext('2d');
const bScanVtkContainer = document.getElementById('bScanVtkContainer');

function getBScanPad() {
    return { l: CHART_AXIS_INSET, r: 10, t: 14, b: CHART_AXIS_INSET };
}

function layoutBScanVtkContainer() {
    const panelBody = bScanVtkContainer.parentElement;
    const w = panelBody.clientWidth;
    const h = panelBody.clientHeight;
    const pad = getBScanPad();
    const plotW = Math.max(1, w - pad.l - pad.r);
    const plotH = Math.max(1, h - pad.t - pad.b);

    bScanVtkContainer.style.left = `${pad.l}px`;
    bScanVtkContainer.style.top = `${pad.t}px`;
    bScanVtkContainer.style.width = `${plotW}px`;
    bScanVtkContainer.style.height = `${plotH}px`;

    return { w, h, pad, plotW, plotH };
}

function initBScanVTK() {
    if (bScanVtkInitialized) return;
    bScanVtkInitialized = true;

    bScanVtkRenderer = vtkRenderer.newInstance();
    bScanVtkRenderer.setBackground(0.025, 0.05, 0.1, 1.0);
    bScanVtkRenderer.setLightFollowCamera(false);

    bScanVtkRenderWindow = vtkRenderWindow.newInstance();
    bScanVtkRenderWindow.addRenderer(bScanVtkRenderer);

    bScanVtkOpenGLWindow = vtkOpenGLRenderWindow.newInstance();
    bScanVtkOpenGLWindow.setContainer(bScanVtkContainer);
    bScanVtkRenderWindow.addView(bScanVtkOpenGLWindow);

    layoutBScanVtkContainer();
    updateVerticalProfileVTK(true);
}

function buildVerticalProfileScene() {
    if (!dataMap || !bScanVtkOpenGLWindow) return;

    layoutBScanVtkContainer();

    const xi = Math.round(clamp(csX, 0, DATA_W - 1));
    const nomWT = 10.0;
    const outerRadius = 152.4;
    const innerRadius = outerRadius - nomWT;
    const xMin = innerRadius - 0.8;
    const xMax = outerRadius + 1.2;
    const xRange = xMax - xMin;

    const { width, height } = bScanVtkContainer.getBoundingClientRect();
    const aspect = height > 0 ? width / height : 1;

    const worldHeight = 12;
    const worldWidth = worldHeight * aspect;

    const pointCount = DATA_H * 4;
    const positions = new Float64Array(pointCount * 3);
    const scalars = new Float32Array(pointCount);
    const cells = new Uint32Array(DATA_H * 8);

    for (let iy = 0; iy < DATA_H; iy++) {
        const v = dataMap[iy][xi];
        const wt = nomWT * (1 - v * 0.85);
        const y0 = (0.5 - iy / DATA_H) * worldHeight;
        const y1 = (0.5 - (iy + 1) / DATA_H) * worldHeight;
        const x0 = ((innerRadius - xMin) / xRange - 0.5) * worldWidth;
        const x1 = ((innerRadius + wt - xMin) / xRange - 0.5) * worldWidth;
        const base = iy * 4;
        const posIdx = base * 3;

        positions[posIdx] = x0;
        positions[posIdx + 1] = y0;
        positions[posIdx + 2] = 0;
        positions[posIdx + 3] = x1;
        positions[posIdx + 4] = y0;
        positions[posIdx + 5] = 0;
        positions[posIdx + 6] = x0;
        positions[posIdx + 7] = y1;
        positions[posIdx + 8] = 0;
        positions[posIdx + 9] = x1;
        positions[posIdx + 10] = y1;
        positions[posIdx + 11] = 0;

        scalars[base] = v;
        scalars[base + 1] = v;
        scalars[base + 2] = v;
        scalars[base + 3] = v;

        const cellIdx = iy * 8;
        cells[cellIdx] = 3;
        cells[cellIdx + 1] = base;
        cells[cellIdx + 2] = base + 1;
        cells[cellIdx + 3] = base + 2;
        cells[cellIdx + 4] = 3;
        cells[cellIdx + 5] = base + 1;
        cells[cellIdx + 6] = base + 3;
        cells[cellIdx + 7] = base + 2;
    }

    const polyData = vtkPolyData.newInstance();
    const ptsObj = vtkPoints.newInstance();
    ptsObj.setData(positions, 3);
    polyData.setPoints(ptsObj);
    const cellArray = vtkCellArray.newInstance();
    cellArray.setData(cells);
    polyData.setPolys(cellArray);
    const scalarsDA = vtkDataArray.newInstance({ name: 'wallLoss', values: scalars, numberOfComponents: 1 });
    polyData.getPointData().setScalars(scalarsDA);

    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);
    mapper.setLookupTable(buildActiveCTF());
    mapper.setScalarVisibility(true);
    mapper.setColorByArrayName('wallLoss');
    mapper.setScalarRange(cScanColorRange.min, cScanColorRange.max);
    mapper.setUseLookupTableScalarRange(true);
    mapper.setScalarModeToUsePointData();

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);

    bScanVtkRenderer.removeAllActors();
    bScanVtkRenderer.addActor(actor);
    bScanVtkRenderer.resetCamera();
    const cam = bScanVtkRenderer.getActiveCamera();
    cam.setPosition(0, 0, 18);
    cam.setFocalPoint(0, 0, 0);
    cam.setViewUp(0, 1, 0);
    cam.setParallelProjection(true);
    cam.setParallelScale(worldHeight / 2);
    cam.setClippingRange(0.1, 100);

    if (width > 0 && height > 0) {
        bScanVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
    }
    bScanVtkRenderWindow.render();
}

function updateVerticalProfileVTK(force = false) {
    if (!bScanVtkInitialized) return;
    const xi = Math.round(clamp(csX, 0, DATA_W - 1));
    if (!force && xi === bScanLastColumn) return;
    bScanLastColumn = xi;
    buildVerticalProfileScene();
}

function resizeBScanVTK() {
    if (!bScanVtkOpenGLWindow) return;
    layoutBScanVtkContainer();
    const { width, height } = bScanVtkContainer.getBoundingClientRect();
    if (width > 0 && height > 0) {
        bScanVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
        bScanVtkRenderWindow.render();
    }
}

function drawVerticalProfile() {
    fit(bScanOverlay);
    const w = bScanOverlay.width, h = bScanOverlay.height;
    bX.clearRect(0, 0, w, h);
    if (!dataMap) return;
    const pad = getBScanPad();
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const xTickY = pad.t + ph + CHART_X_TICK_Y;
    const xAxisTitleY = pad.t + ph + pad.b - CHART_X_AXIS_TITLE_OFFSET;
    const xi = Math.round(clamp(csX, 0, DATA_W - 1));
    const nomWT = 10.0, R_o = 152.4, R_i = R_o - nomWT, xMin = R_i - 0.8, xMax = R_o + 1.2, xRange = xMax - xMin, xScale = pw / xRange;
    bX.strokeStyle = 'rgba(30,51,82,.55)'; bX.lineWidth = .4;
    [0, .25, .5, .75, 1].forEach(f => { const y2 = pad.t + f * ph; bX.beginPath(); bX.moveTo(pad.l, y2); bX.lineTo(pad.l + pw, y2); bX.stroke(); });
    [0, .25, .5, .75, 1].forEach(f => { const x2 = pad.l + f * pw; bX.beginPath(); bX.moveTo(x2, pad.t); bX.lineTo(x2, pad.t + ph); bX.stroke(); });
    drawChartAxes(bX, pad, pw, ph);
    const riX = pad.l + (R_i - xMin) * xScale;
    bX.strokeStyle = 'rgba(107,138,170,.4)'; bX.lineWidth = 1; bX.setLineDash([2, 4]);
    bX.beginPath(); bX.moveTo(riX, pad.t); bX.lineTo(riX, pad.t + ph); bX.stroke(); bX.setLineDash([]);
    const nomX = pad.l + (R_o - xMin) * xScale;
    bX.strokeStyle = 'rgba(0,212,255,.7)'; bX.lineWidth = 1; bX.setLineDash([4, 3]);
    bX.beginPath(); bX.moveTo(nomX, pad.t); bX.lineTo(nomX, pad.t + ph); bX.stroke(); bX.setLineDash([]);
    const minX = pad.l + (R_i + nomWT * .8 - xMin) * xScale;
    bX.strokeStyle = 'rgba(244,63,94,.55)'; bX.lineWidth = 1; bX.setLineDash([2, 3]);
    bX.beginPath(); bX.moveTo(minX, pad.t); bX.lineTo(minX, pad.t + ph); bX.stroke(); bX.setLineDash([]);
    const cyFrac = csY / DATA_H, cyPx = pad.t + cyFrac * ph;
    bX.strokeStyle = 'rgba(255,255,255,.5)'; bX.lineWidth = 1; bX.setLineDash([3, 3]);
    bX.beginPath(); bX.moveTo(pad.l, cyPx); bX.lineTo(pad.l + pw, cyPx); bX.stroke(); bX.setLineDash([]);
    bX.fillStyle = '#ffffff'; bX.beginPath(); bX.arc(pad.l, cyPx, 2.5, 0, PI2); bX.fill();
    bX.fillStyle = 'rgba(107,138,170,.75)'; bX.font = '7px JetBrains Mono';
    ['0°', '90°', '180°', '270°', '360°'].forEach((lbl, i) => { bX.fillText(lbl, CHART_Y_TICK_X, pad.t + i / 4 * ph + 3); });
    bX.fillStyle = 'rgba(107,138,170,.75)'; bX.font = '7px JetBrains Mono';
    for (let r = Math.ceil(xMin); r <= Math.floor(xMax); r += 2) { const x2 = pad.l + (r - xMin) * xScale; if (x2 >= pad.l && x2 <= pad.l + pw) bX.fillText(r, x2 - 6, xTickY); }
    bX.fillStyle = 'rgba(107,138,170,.6)'; bX.font = '7.5px Inter'; bX.textAlign = 'center'; bX.fillText('Radius (mm)', pad.l + pw / 2, xAxisTitleY); bX.textAlign = 'left';
    bX.fillStyle = 'rgba(0,212,255,.75)'; bX.font = '7px Inter'; bX.fillText('NOM', nomX + 2, pad.t + 8);
    bX.fillStyle = 'rgba(244,63,94,.75)'; bX.fillText('MIN', minX + 2, pad.t + 8);
    bX.fillStyle = 'rgba(107,138,170,.65)'; bX.fillText('ID', riX + 2, pad.t + 8);
    bX.fillStyle = 'rgba(0,212,255,.9)'; bX.font = '7.5px Inter';
    bX.fillText('Axial: ' + (csX / DATA_W * 2000).toFixed(0) + ' m  |  0°→360°', pad.l, pad.t - 3);
}

// ── Panel 4: C-Scan — vtk.js Overlay ─────────────────────────────────────────
const cOverlay = document.getElementById('cScanOverlay');
const cOX = cOverlay.getContext('2d');
const cTip = document.getElementById('cTip');
const cScanPanelBody = document.getElementById('cScanPanelBody');
const cScanColorPopover = document.getElementById('cScanColorPopover');
const cScanColorMinInput = document.getElementById('cScanColorMin');
const cScanColorMaxInput = document.getElementById('cScanColorMax');
const cScanColorMinValue = document.getElementById('cScanColorMinValue');
const cScanColorMaxValue = document.getElementById('cScanColorMaxValue');
const cScanColorReset = document.getElementById('cScanColorReset');
const C_SCAN_TIP_OFFSET_X = 14;
const C_SCAN_TIP_OFFSET_Y = 12;
let cScanColorBarRect = null;

const defs = [
    { cx: .30, cy: .40, rx: .09, ry: .07, lbl: 'DEF-01 · 18%WT', col: '#f43f5e' },
    { cx: .70, cy: .65, rx: .06, ry: .05, lbl: 'DEF-02 · 11%WT', col: '#f59e0b' },
];

function buildActiveCTF() {
    return buildCTF(cScanColorRange.min, cScanColorRange.max);
}

function formatScalePct(value) {
    return `${Math.round(value * 100)}%`;
}

function syncCScanColorControls() {
    cScanColorMinInput.value = `${Math.round(cScanColorRange.min * 100)}`;
    cScanColorMaxInput.value = `${Math.round(cScanColorRange.max * 100)}`;
    cScanColorMinValue.textContent = formatScalePct(cScanColorRange.min);
    cScanColorMaxValue.textContent = formatScalePct(cScanColorRange.max);
}

function hideCScanColorPopover() {
    cScanColorPopover.classList.remove('show');
}

function showCScanColorPopover() {
    if (!cScanColorBarRect) return;
    syncCScanColorControls();
    const popoverW = 196;
    const popoverH = 162;
    const left = clamp(cScanColorBarRect.x - popoverW - 10, 8, Math.max(8, cScanPanelBody.clientWidth - popoverW - 8));
    const top = clamp(cScanColorBarRect.y + cScanColorBarRect.h * 0.5 - popoverH * 0.5, 8, Math.max(8, cScanPanelBody.clientHeight - popoverH - 8));
    cScanColorPopover.style.left = `${left}px`;
    cScanColorPopover.style.top = `${top}px`;
    cScanColorPopover.classList.add('show');
}

function refreshHeatPanels() {
    if (vtkInitialized && !view3D) buildHeatmapScene();
    if (rangeVtkInitialized) buildRangeScene();
    if (bScanVtkInitialized) buildVerticalProfileScene();
    if (longVtkInitialized) buildHorizontalProfileScene();
    if (circVtkInitialized) buildCircScene(true);
    if (view3D) updateReferencePipe();
}

function applyCScanColorRange(min, max) {
    cScanColorRange.min = min;
    cScanColorRange.max = max;
    syncCScanColorControls();
    refreshHeatPanels();
    drawCScanOverlay();
}

function updateCScanColorRangeFromInputs(changedControl) {
    let min = Number(cScanColorMinInput.value) / 100;
    let max = Number(cScanColorMaxInput.value) / 100;
    if (max - min < C_SCAN_COLOR_RANGE_MIN_GAP) {
        if (changedControl === 'min') {
            max = clamp(min + C_SCAN_COLOR_RANGE_MIN_GAP, C_SCAN_COLOR_RANGE_MIN_GAP, 1);
            min = clamp(max - C_SCAN_COLOR_RANGE_MIN_GAP, 0, 1 - C_SCAN_COLOR_RANGE_MIN_GAP);
        } else {
            min = clamp(max - C_SCAN_COLOR_RANGE_MIN_GAP, 0, 1 - C_SCAN_COLOR_RANGE_MIN_GAP);
            max = clamp(min + C_SCAN_COLOR_RANGE_MIN_GAP, C_SCAN_COLOR_RANGE_MIN_GAP, 1);
        }
    }
    cScanColorMinInput.value = `${Math.round(min * 100)}`;
    cScanColorMaxInput.value = `${Math.round(max * 100)}`;
    applyCScanColorRange(min, max);
}

function isInsideCScanColorBar(x, y) {
    return !!cScanColorBarRect
        && x >= cScanColorBarRect.x
        && x <= cScanColorBarRect.x + cScanColorBarRect.w
        && y >= cScanColorBarRect.y
        && y <= cScanColorBarRect.y + cScanColorBarRect.h;
}

cScanPanelBody.addEventListener('click', event => {
    if (cScanColorPopover.contains(event.target)) return;
    const rect = cScanPanelBody.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    if (isInsideCScanColorBar(localX, localY)) {
        showCScanColorPopover();
    } else {
        hideCScanColorPopover();
    }
});

document.addEventListener('pointerdown', event => {
    if (!cScanColorPopover.classList.contains('show')) return;
    if (cScanColorPopover.contains(event.target)) return;
    if (cScanPanelBody.contains(event.target)) return;
    hideCScanColorPopover();
});

cScanColorMinInput.addEventListener('input', () => updateCScanColorRangeFromInputs('min'));
cScanColorMaxInput.addEventListener('input', () => updateCScanColorRangeFromInputs('max'));
cScanColorReset.addEventListener('click', () => {
    applyCScanColorRange(0, 1);
    showCScanColorPopover();
});

vtkContainer.addEventListener('mousemove', e => {
    if (view3D) return;
    const r = vtkContainer.getBoundingClientRect();
    const panelRect = cTip.parentElement.getBoundingClientRect();
    const localX = e.clientX - r.left;
    const localY = e.clientY - r.top;
    const px = localX / r.width, py = localY / r.height;
    csX = clamp(lerp(zoom.x0 * DATA_W, zoom.x1 * DATA_W, px), 0, DATA_W - 1);
    csY = clamp(lerp(zoom.y0 * DATA_H, zoom.y1 * DATA_H, py), 0, DATA_H - 1);
    const v = dataMap[Math.round(csY)][Math.round(csX)];
    const panelX = e.clientX - panelRect.left;
    const panelY = e.clientY - panelRect.top;
    cTip.style.left = (panelX + C_SCAN_TIP_OFFSET_X) + 'px';
    cTip.style.top = (panelY + C_SCAN_TIP_OFFSET_Y) + 'px';
    cTip.style.opacity = '1';
    cTip.textContent = 'X:' + (csX / DATA_W * 100).toFixed(1) + '%  θ:' + (csY / DATA_H * 360).toFixed(1) + '°  WT:' + (10.0 * (1 - v * .85)).toFixed(2) + 'mm';
});
vtkContainer.addEventListener('mouseleave', () => { cTip.style.opacity = '0'; });

function drawCScanOverlay() {
    const p = vtkContainer.parentElement;
    const w = p.clientWidth, h = p.clientHeight;
    if (cOverlay.width !== w || cOverlay.height !== h) {
        cOverlay.width = w; cOverlay.height = h;
    }
    cOX.clearRect(0, 0, w, h);
    if (view3D) {
        cScanColorBarRect = null;
        // Draw color bar legend for 3D reference view
        const barW = 12, barH = Math.min(h * 0.55, 200);
        const barX = w - barW - 10;
        const barY = (h - barH) / 2;
        const bg = cOX.createLinearGradient(0, barY, 0, barY + barH);
        ['#ff1414','#ff5000','#dcc800','#00dc64','#00c8c8','#0050b4','#0a1450'].forEach((c, i) => bg.addColorStop(i / 6, c));
        cOX.fillStyle = bg; cOX.fillRect(barX, barY, barW, barH);
        cOX.strokeStyle = 'rgba(30,51,82,.8)'; cOX.lineWidth = 0.5; cOX.strokeRect(barX, barY, barW, barH);
        cOX.fillStyle = 'rgba(107,138,170,.8)'; cOX.font = '7.5px JetBrains Mono';
        cOX.fillText('100%', barX - 22, barY + 5);
        cOX.fillText('0%', barX - 18, barY + barH + 3);
        cOX.fillStyle = 'rgba(0,212,255,.5)'; cOX.font = '6.5px Inter';
        cOX.fillText('Wall Loss', barX - 22, barY - 4);
        return;
    }
    if (!dataMap) {
        cScanColorBarRect = null;
        return;
    }

    const pad = getCScanPad();
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    const x0 = zoom.x0 * DATA_W, x1 = zoom.x1 * DATA_W;
    const y0 = zoom.y0 * DATA_H, y1 = zoom.y1 * DATA_H;
    const bottomAxisY = pad.t + ph;
    const xTickY = bottomAxisY + CHART_X_TICK_Y;
    const crossX = pad.l + ((csX - x0) / (x1 - x0)) * pw;
    const crossY = pad.t + ((csY - y0) / (y1 - y0)) * ph;

    drawChartAxes(cOX, pad, pw, ph);

    defs.forEach(({ cx, cy, rx, ry, lbl, col }) => {
        const px0 = pad.l + ((cx - rx - zoom.x0) / (zoom.x1 - zoom.x0)) * pw;
        const py0 = pad.t + ((cy - ry - zoom.y0) / (zoom.y1 - zoom.y0)) * ph;
        const pw2 = rx * 2 / (zoom.x1 - zoom.x0) * pw;
        const ph2 = ry * 2 / (zoom.y1 - zoom.y0) * ph;
        if (px0 > -pw2 && px0 < w && py0 > -ph2 && py0 < h) {
            cOX.strokeStyle = col; cOX.lineWidth = 1.5; cOX.strokeRect(px0, py0, pw2, ph2);
            cOX.fillStyle = col; cOX.font = 'bold 9px Inter'; cOX.fillText(lbl, px0 + 2, py0 - 3);
        }
    });

    for (let j = 1; j <= 6; j++) {
        const jfrac = j / 6;
        if (jfrac > zoom.x0 && jfrac < zoom.x1) {
            const jpx = pad.l + ((jfrac - zoom.x0) / (zoom.x1 - zoom.x0)) * pw;
            cOX.strokeStyle = 'rgba(0,212,255,.35)'; cOX.lineWidth = .8;
            cOX.beginPath(); cOX.moveTo(jpx, pad.t); cOX.lineTo(jpx, bottomAxisY); cOX.stroke();
            cOX.fillStyle = 'rgba(0,212,255,.6)'; cOX.font = '8px JetBrains Mono'; cOX.fillText('J' + j, jpx + 2, pad.t - 4);
        }
    }

    const zStartM = zoom.x0 * 2000, zEndM = zoom.x1 * 2000;
    const mStep = (zEndM - zStartM) > 800 ? 250 : (zEndM - zStartM) > 400 ? 100 : 50;
    cOX.fillStyle = 'rgba(107,138,170,.7)'; cOX.font = '7px JetBrains Mono'; cOX.textAlign = 'center';
    for (let m = Math.ceil(zStartM / mStep) * mStep; m <= zEndM; m += mStep) {
        const tx = pad.l + ((m / 2000 - zoom.x0) / (zoom.x1 - zoom.x0)) * pw;
        if (tx > 8 && tx < w - 8) { cOX.strokeStyle = 'rgba(107,138,170,.25)'; cOX.lineWidth = .5; cOX.beginPath(); cOX.moveTo(tx, bottomAxisY); cOX.lineTo(tx, bottomAxisY + 6); cOX.stroke(); cOX.fillText(m + 'm', tx, xTickY); }
    }
    cOX.strokeStyle = 'rgba(107,138,170,.45)'; cOX.lineWidth = .8;
    cOX.beginPath(); cOX.moveTo(pad.l, bottomAxisY); cOX.lineTo(pad.l + pw, bottomAxisY); cOX.stroke();

    const zAngStart = zoom.y0 * 360, zAngEnd = zoom.y1 * 360;
    const aStep = (zAngEnd - zAngStart) > 270 ? 90 : (zAngEnd - zAngStart) > 135 ? 45 : 30;
    cOX.textAlign = 'right';
    for (let a = Math.ceil(zAngStart / aStep) * aStep; a <= zAngEnd; a += aStep) {
        const ty = pad.t + ((a / 360 - zoom.y0) / (zoom.y1 - zoom.y0)) * ph;
        if (ty > pad.t && ty < bottomAxisY) { cOX.strokeStyle = 'rgba(107,138,170,.25)'; cOX.lineWidth = .5; cOX.beginPath(); cOX.moveTo(pad.l, ty); cOX.lineTo(pad.l + pw, ty); cOX.stroke(); cOX.fillStyle = 'rgba(107,138,170,.7)'; cOX.font = '7px JetBrains Mono'; cOX.fillText(a + '°', CHART_AXIS_INSET, ty + 3); }
    }
    cOX.textAlign = 'left';

    cOX.strokeStyle = 'rgba(255,255,255,.55)'; cOX.lineWidth = 1; cOX.setLineDash([3, 3]);
    cOX.beginPath(); cOX.moveTo(crossX, pad.t); cOX.lineTo(crossX, bottomAxisY); cOX.stroke();
    cOX.beginPath(); cOX.moveTo(pad.l, crossY); cOX.lineTo(pad.l + pw, crossY); cOX.stroke();
    cOX.setLineDash([]);

    const axM = (csX / DATA_W * 2000).toFixed(0), angDeg = (csY / DATA_H * 360).toFixed(1);
    const topLblX = clamp(crossX, 36, w - 36);
    cOX.fillStyle = 'rgba(8,16,36,.82)'; cOX.fillRect(topLblX - 24, 3, 48, 13);
    cOX.fillStyle = 'rgba(0,212,255,.95)'; cOX.font = 'bold 7.5px JetBrains Mono'; cOX.textAlign = 'center';
    cOX.fillText(axM + ' m', topLblX, 13);
    const rtLblY = clamp(crossY, 8, h - 8);
    cOX.fillStyle = 'rgba(8,16,36,.82)'; cOX.fillRect(w - 46, rtLblY - 7, 45, 13);
    cOX.fillStyle = 'rgba(255,220,80,.95)'; cOX.font = 'bold 7.5px JetBrains Mono'; cOX.textAlign = 'right';
    cOX.fillText(angDeg + '°', w - 3, rtLblY + 3);
    cOX.textAlign = 'left';
    cOX.fillStyle = 'rgba(255,255,255,.9)'; cOX.beginPath(); cOX.arc(crossX, crossY, 4, 0, PI2); cOX.fill();
    cOX.strokeStyle = 'rgba(0,212,255,.8)'; cOX.lineWidth = 1.2; cOX.beginPath(); cOX.arc(crossX, crossY, 7, 0, PI2); cOX.stroke();

    const barW = 11, barH = h * .65, barX = w - barW - 6, barY = (h - barH) / 2;
    cScanColorBarRect = { x: barX, y: barY, w: barW, h: barH };
    const bg = cOX.createLinearGradient(0, barY, 0, barY + barH);
    ['#ff1414', '#ff5000', '#dcc800', '#00dc64', '#00c8c8', '#0050b4', '#0a1450'].forEach((c, i) => bg.addColorStop(i / 6, c));
    cOX.fillStyle = bg; cOX.fillRect(barX, barY, barW, barH);
    cOX.strokeStyle = cScanColorPopover.classList.contains('show') ? 'rgba(0,212,255,.85)' : 'rgba(30,51,82,.8)';
    cOX.lineWidth = cScanColorPopover.classList.contains('show') ? 1.1 : .5;
    cOX.strokeRect(barX, barY, barW, barH);
    cOX.fillStyle = 'rgba(107,138,170,.8)'; cOX.font = '7.5px JetBrains Mono';
    cOX.fillText(formatScalePct(cScanColorRange.max), barX - 22, barY + 5);
    cOX.fillText(formatScalePct(cScanColorRange.min), barX - 18, barY + barH + 3);
    cOX.fillStyle = 'rgba(0,212,255,.62)';
    cOX.font = '7px Inter';
    cOX.fillText('click', barX - 16, barY - 6);
}

// ── Panel 5: Circular B-Scan ─────────────────────────────────────────────────
const ciC = document.getElementById('circCanvas'), ciX = ciC.getContext('2d');
const circTip = document.getElementById('circTip');

// ── Panel 5: Circular B-Scan — VTK ───────────────────────────────────────────
const circVtkContainer = document.getElementById('circVtkContainer');
const CIRC_R_INNER = 2.0, CIRC_R_OUTER = 2.8;
const CIRC_PARALLEL_SCALE = CIRC_R_OUTER + 0.55;

function initCircVTK() {
    if (circVtkInitialized) return;
    circVtkInitialized = true;

    circVtkRenderer = vtkRenderer.newInstance();
    circVtkRenderer.setBackground(0.024, 0.051, 0.102, 1.0);
    circVtkRenderer.setLightFollowCamera(false);

    circVtkRenderWindow = vtkRenderWindow.newInstance();
    circVtkRenderWindow.addRenderer(circVtkRenderer);

    circVtkOpenGLWindow = vtkOpenGLRenderWindow.newInstance();
    circVtkOpenGLWindow.setContainer(circVtkContainer);
    circVtkRenderWindow.addView(circVtkOpenGLWindow);

    buildCircScene(true);
}

function buildCircScene(force = false) {
    if (!circVtkOpenGLWindow || !dataMap) return;
    const xi = Math.round(clamp(csX, 0, DATA_W - 1));
    const yi = Math.round(clamp(csY, 0, DATA_H - 1));
    if (!force && xi === circLastColumn && yi === circLastRow) return;
    circLastColumn = xi;
    circLastRow = yi;

    circVtkRenderer.removeAllActors();

    const n = DATA_H;
    const positions = new Float64Array(n * 4 * 3);
    const colors = new Uint8Array(n * 4 * 3);
    const cells = new Uint32Array(n * 8);

    for (let i = 0; i < n; i++) {
        const a0 = (i / n) * PI2 - Math.PI / 2;
        const a1 = ((i + 1) / n) * PI2 - Math.PI / 2;
        const v = dataMap[i][xi];
        const rgb = heatRGB(v, cScanColorRange.min, cScanColorRange.max);
        const base = i * 4, posIdx = base * 3;

        positions[posIdx]     = CIRC_R_INNER * Math.cos(a0); positions[posIdx + 1] = CIRC_R_INNER * Math.sin(a0); positions[posIdx + 2] = 0;
        positions[posIdx + 3] = CIRC_R_OUTER * Math.cos(a0); positions[posIdx + 4] = CIRC_R_OUTER * Math.sin(a0); positions[posIdx + 5] = 0;
        positions[posIdx + 6] = CIRC_R_INNER * Math.cos(a1); positions[posIdx + 7] = CIRC_R_INNER * Math.sin(a1); positions[posIdx + 8] = 0;
        positions[posIdx + 9] = CIRC_R_OUTER * Math.cos(a1); positions[posIdx + 10] = CIRC_R_OUTER * Math.sin(a1); positions[posIdx + 11] = 0;

        for (let j = 0; j < 4; j++) {
            colors[(base + j) * 3] = rgb[0]; colors[(base + j) * 3 + 1] = rgb[1]; colors[(base + j) * 3 + 2] = rgb[2];
        }
        const ci = i * 8;
        cells[ci] = 3; cells[ci + 1] = base;     cells[ci + 2] = base + 1; cells[ci + 3] = base + 2;
        cells[ci + 4] = 3; cells[ci + 5] = base + 1; cells[ci + 6] = base + 3; cells[ci + 7] = base + 2;
    }

    const pd = vtkPolyData.newInstance();
    const pts = vtkPoints.newInstance(); pts.setData(positions, 3); pd.setPoints(pts);
    const ca = vtkCellArray.newInstance(); ca.setData(cells); pd.setPolys(ca);
    const colDA = vtkDataArray.newInstance({ name: 'colors', values: colors, numberOfComponents: 3 });
    pd.getPointData().addArray(colDA); pd.getPointData().setActiveScalars('colors');

    const mapper = vtkMapper.newInstance();
    mapper.setInputData(pd); mapper.setScalarVisibility(true);
    mapper.setColorModeToDirectScalars(); mapper.setColorByArrayName('colors');
    mapper.setScalarModeToUsePointData();
    const actor = vtkActor.newInstance(); actor.setMapper(mapper);
    actor.getProperty().setInterpolationToFlat();
    actor.getProperty().setAmbient(1.0); actor.getProperty().setDiffuse(0.0);
    circVtkRenderer.addActor(actor);

    // Angle crosshair line
    const ang = csY / DATA_H * PI2 - Math.PI / 2;
    const lPts = new Float64Array([0, 0, 0, (CIRC_R_OUTER + 0.25) * Math.cos(ang), (CIRC_R_OUTER + 0.25) * Math.sin(ang), 0]);
    const lPd = vtkPolyData.newInstance(); const lPtsObj = vtkPoints.newInstance(); lPtsObj.setData(lPts, 3); lPd.setPoints(lPtsObj);
    const lCell = vtkCellArray.newInstance(); lCell.setData(new Uint32Array([2, 0, 1])); lPd.setLines(lCell);
    const lMapper = vtkMapper.newInstance(); lMapper.setInputData(lPd);
    const lActor = vtkActor.newInstance(); lActor.setMapper(lMapper);
    lActor.getProperty().setColor(1, 1, 1); lActor.getProperty().setLineWidth(1.2);
    circVtkRenderer.addActor(lActor);

    const cam = circVtkRenderer.getActiveCamera();
    cam.setPosition(0, 0, 10); cam.setFocalPoint(0, 0, 0); cam.setViewUp(0, 1, 0);
    cam.setParallelProjection(true); cam.setParallelScale(CIRC_PARALLEL_SCALE); cam.setClippingRange(0.1, 100);

    const { width, height } = circVtkContainer.getBoundingClientRect();
    if (width > 0 && height > 0) circVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
    circVtkRenderWindow.render();
}

function resizeCircVTK() {
    if (!circVtkOpenGLWindow) return;
    const { width, height } = circVtkContainer.getBoundingClientRect();
    if (width > 0 && height > 0) {
        circVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
        circVtkRenderWindow.render();
    }
}

function drawCirc() {
    fit(ciC);
    const w = ciC.width, h = ciC.height, cx = w / 2, cy = h / 2;
    ciX.clearRect(0, 0, w, h);
    if (!dataMap) return;
    // World→screen: parallelScale covers half the min-dimension in world units
    const minDim = Math.min(w, h);
    const wts = (minDim / 2) / CIRC_PARALLEL_SCALE;
    const Ro = CIRC_R_OUTER * wts, Ri = CIRC_R_INNER * wts;
    // Axis lines
    ciX.strokeStyle = 'rgba(107,138,170,.2)'; ciX.lineWidth = .5;
    ciX.beginPath(); ciX.moveTo(cx - Ro - 4, cy); ciX.lineTo(cx + Ro + 4, cy); ciX.stroke();
    ciX.beginPath(); ciX.moveTo(cx, cy - Ro - 4); ciX.lineTo(cx, cy + Ro + 4); ciX.stroke();
    // Ring outlines
    [Ro, Ri].forEach(r => { ciX.beginPath(); ciX.arc(cx, cy, r, 0, PI2); ciX.strokeStyle = 'rgba(0,212,255,.35)'; ciX.lineWidth = .7; ciX.stroke(); });
    // Centre label
    ciX.fillStyle = 'rgba(107,138,170,.7)'; ciX.font = '8.5px JetBrains Mono'; ciX.textAlign = 'center';
    ciX.fillText('304.8mm OD  |  X:' + (csX / DATA_W * 100).toFixed(1) + '%', cx, cy);
    ciX.textAlign = 'left';
    [['TOP', cx - 8, cy - Ro - 6], ['BOT', cx - 8, cy + Ro + 12], ['L', cx - Ro - 14, cy + 4], ['R', cx + Ro + 4, cy + 4]].forEach(([t, tx, ty]) => {
        ciX.fillStyle = 'rgba(107,138,170,.5)'; ciX.font = '7px Inter'; ciX.fillText(t, tx, ty);
    });

    const hoverAng = csY / DATA_H * PI2 - Math.PI / 2;
    const hoverX = cx + Math.cos(hoverAng) * ((Ri + Ro) * 0.5);
    const hoverY = cy + Math.sin(hoverAng) * ((Ri + Ro) * 0.5);
    ciX.fillStyle = 'rgba(255,255,255,.92)';
    ciX.beginPath(); ciX.arc(hoverX, hoverY, 3.5, 0, PI2); ciX.fill();
    ciX.strokeStyle = 'rgba(255,255,255,.45)'; ciX.lineWidth = 1;
    ciX.beginPath(); ciX.arc(hoverX, hoverY, 7, 0, PI2); ciX.stroke();
}

circVtkContainer.addEventListener('mousemove', event => {
    if (!dataMap) return;

    const rect = circVtkContainer.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = localX - cx;
    const dy = localY - cy;
    const minDim = Math.min(rect.width, rect.height);
    const worldToScreen = (minDim / 2) / CIRC_PARALLEL_SCALE;
    const radiusPx = Math.sqrt(dx * dx + dy * dy);
    const innerPx = CIRC_R_INNER * worldToScreen;
    const outerPx = CIRC_R_OUTER * worldToScreen;

    if (radiusPx < innerPx - 8 || radiusPx > outerPx + 8) {
        circTip.style.opacity = '0';
        return;
    }

    const angle = (Math.atan2(dy, dx) + Math.PI / 2 + PI2) % PI2;
    csY = clamp(angle / PI2 * DATA_H, 0, DATA_H - 1);

    const xi = Math.round(clamp(csX, 0, DATA_W - 1));
    const yi = Math.round(clamp(csY, 0, DATA_H - 1));
    const wallLoss = dataMap[yi][xi];
    const wallThickness = 10.0 * (1 - wallLoss * 0.85);

    circTip.style.left = `${localX + 10}px`;
    circTip.style.top = `${localY + 10}px`;
    circTip.style.opacity = '1';
    circTip.textContent = `X:${(csX / DATA_W * 100).toFixed(1)}%  θ:${(csY / DATA_H * 360).toFixed(1)}°  WT:${wallThickness.toFixed(2)}mm`;
});

circVtkContainer.addEventListener('mouseleave', () => {
    circTip.style.opacity = '0';
});

// ── Panel 6: Long B-Scan (Horizontal Profile) ────────────────────────────────
const lOverlay = document.getElementById('longOverlay');
const lX = lOverlay.getContext('2d');
const longVtkContainer = document.getElementById('longVtkContainer');

function getLongPad() {
    return { l: CHART_AXIS_INSET, r: 68, t: 22, b: CHART_AXIS_INSET };
}

function layoutLongVtkContainer() {
    const panelBody = longVtkContainer.parentElement;
    const w = panelBody.clientWidth;
    const h = panelBody.clientHeight;
    const pad = getLongPad();
    const plotW = Math.max(1, w - pad.l - pad.r);
    const plotH = Math.max(1, h - pad.t - pad.b);

    longVtkContainer.style.left = `${pad.l}px`;
    longVtkContainer.style.top = `${pad.t}px`;
    longVtkContainer.style.width = `${plotW}px`;
    longVtkContainer.style.height = `${plotH}px`;

    return { w, h, pad, plotW, plotH };
}

function initLongVTK() {
    if (longVtkInitialized) return;
    longVtkInitialized = true;

    longVtkRenderer = vtkRenderer.newInstance();
    longVtkRenderer.setBackground(0.025, 0.05, 0.1, 1.0);
    longVtkRenderer.setLightFollowCamera(false);

    longVtkRenderWindow = vtkRenderWindow.newInstance();
    longVtkRenderWindow.addRenderer(longVtkRenderer);

    longVtkOpenGLWindow = vtkOpenGLRenderWindow.newInstance();
    longVtkOpenGLWindow.setContainer(longVtkContainer);
    longVtkRenderWindow.addView(longVtkOpenGLWindow);

    layoutLongVtkContainer();
    updateHorizontalProfileVTK(true);
}

function buildHorizontalProfileScene() {
    if (!dataMap || !longVtkOpenGLWindow) return;

    layoutLongVtkContainer();

    const yi = Math.round(clamp(csY, 0, DATA_H - 1));
    const nomWT = 10.0;
    const outerRadius = 152.4;
    const innerRadius = outerRadius - nomWT;
    const yMin = innerRadius - 0.8;
    const yMax = outerRadius + 1.2;
    const yRange = yMax - yMin;

    const { width, height } = longVtkContainer.getBoundingClientRect();
    const aspect = height > 0 ? width / height : 1;

    const worldHeight = 4;
    const worldWidth = worldHeight * aspect;

    const pointCount = DATA_W * 4;
    const positions = new Float64Array(pointCount * 3);
    const scalars = new Float32Array(pointCount);
    const cells = new Uint32Array(DATA_W * 8);

    for (let ix = 0; ix < DATA_W; ix++) {
        const v = dataMap[yi][ix];
        const wt = nomWT * (1 - v * 0.85);
        const x0 = (ix / DATA_W - 0.5) * worldWidth;
        const x1 = ((ix + 1) / DATA_W - 0.5) * worldWidth;
        const y0 = ((innerRadius - yMin) / yRange - 0.5) * worldHeight;
        const y1 = ((innerRadius + wt - yMin) / yRange - 0.5) * worldHeight;
        const base = ix * 4;
        const posIdx = base * 3;

        positions[posIdx] = x0;
        positions[posIdx + 1] = y0;
        positions[posIdx + 2] = 0;
        positions[posIdx + 3] = x1;
        positions[posIdx + 4] = y0;
        positions[posIdx + 5] = 0;
        positions[posIdx + 6] = x0;
        positions[posIdx + 7] = y1;
        positions[posIdx + 8] = 0;
        positions[posIdx + 9] = x1;
        positions[posIdx + 10] = y1;
        positions[posIdx + 11] = 0;

        scalars[base] = v;
        scalars[base + 1] = v;
        scalars[base + 2] = v;
        scalars[base + 3] = v;

        const cellIdx = ix * 8;
        cells[cellIdx] = 3;
        cells[cellIdx + 1] = base;
        cells[cellIdx + 2] = base + 1;
        cells[cellIdx + 3] = base + 2;
        cells[cellIdx + 4] = 3;
        cells[cellIdx + 5] = base + 1;
        cells[cellIdx + 6] = base + 3;
        cells[cellIdx + 7] = base + 2;
    }

    const polyData = vtkPolyData.newInstance();
    const ptsObj = vtkPoints.newInstance();
    ptsObj.setData(positions, 3);
    polyData.setPoints(ptsObj);
    const cellArray = vtkCellArray.newInstance();
    cellArray.setData(cells);
    polyData.setPolys(cellArray);
    const scalarsDA = vtkDataArray.newInstance({ name: 'wallLoss', values: scalars, numberOfComponents: 1 });
    polyData.getPointData().setScalars(scalarsDA);

    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);
    mapper.setLookupTable(buildActiveCTF());
    mapper.setScalarVisibility(true);
    mapper.setColorByArrayName('wallLoss');
    mapper.setScalarRange(cScanColorRange.min, cScanColorRange.max);
    mapper.setUseLookupTableScalarRange(true);
    mapper.setScalarModeToUsePointData();

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);

    longVtkRenderer.removeAllActors();
    longVtkRenderer.addActor(actor);
    longVtkRenderer.resetCamera();
    const cam = longVtkRenderer.getActiveCamera();
    cam.setPosition(0, 0, 18);
    cam.setFocalPoint(0, 0, 0);
    cam.setViewUp(0, 1, 0);
    cam.setParallelProjection(true);
    cam.setParallelScale(worldHeight / 2);
    cam.setClippingRange(0.1, 100);

    if (width > 0 && height > 0) {
        longVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
    }
    longVtkRenderWindow.render();
}

function updateHorizontalProfileVTK(force = false) {
    if (!longVtkInitialized) return;
    const yi = Math.round(clamp(csY, 0, DATA_H - 1));
    if (!force && yi === longLastRow) return;
    longLastRow = yi;
    buildHorizontalProfileScene();
}

function resizeLongVTK() {
    if (!longVtkOpenGLWindow) return;
    layoutLongVtkContainer();
    const { width, height } = longVtkContainer.getBoundingClientRect();
    if (width > 0 && height > 0) {
        longVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
        longVtkRenderWindow.render();
    }
}

function drawHorizontalProfile() {
    fit(lOverlay);
    const w = lOverlay.width, h = lOverlay.height;
    lX.clearRect(0, 0, w, h);
    if (!dataMap) return;
    const pad = getLongPad();
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const xTickY = pad.t + ph + CHART_X_TICK_Y;
    const xAxisTitleY = pad.t + ph + pad.b - CHART_X_AXIS_TITLE_OFFSET;
    const yi = Math.round(clamp(csY, 0, DATA_H - 1));
    const nomWT = 10.0, R_o = 152.4, R_i = R_o - nomWT, yMin = R_i - 0.8, yMax = R_o + 1.2, yRange = yMax - yMin, yScale = ph / yRange;
    lX.strokeStyle = 'rgba(30,51,82,.7)'; lX.lineWidth = .5;
    [0, .25, .5, .75, 1].forEach(f => { const y2 = pad.t + f * ph; lX.beginPath(); lX.moveTo(pad.l, y2); lX.lineTo(pad.l + pw, y2); lX.stroke(); });
    drawChartAxes(lX, pad, pw, ph);
    const riY = pad.t + ph - (R_i - yMin) * yScale;
    lX.strokeStyle = 'rgba(107,138,170,.35)'; lX.lineWidth = .8; lX.setLineDash([2, 4]);
    lX.beginPath(); lX.moveTo(pad.l, riY); lX.lineTo(pad.l + pw, riY); lX.stroke(); lX.setLineDash([]);
    const nomY = pad.t + ph - (R_o - yMin) * yScale;
    lX.strokeStyle = 'rgba(0,212,255,.6)'; lX.lineWidth = 1; lX.setLineDash([4, 3]);
    lX.beginPath(); lX.moveTo(pad.l, nomY); lX.lineTo(pad.l + pw, nomY); lX.stroke(); lX.setLineDash([]);
    const minY = pad.t + ph - (R_i + nomWT * .8 - yMin) * yScale;
    lX.strokeStyle = 'rgba(244,63,94,.5)'; lX.lineWidth = 1; lX.setLineDash([2, 3]);
    lX.beginPath(); lX.moveTo(pad.l, minY); lX.lineTo(pad.l + pw, minY); lX.stroke(); lX.setLineDash([]);
    const cxPx = pad.l + (csX / DATA_W) * pw;
    lX.strokeStyle = 'rgba(255,255,255,.55)'; lX.lineWidth = 1; lX.setLineDash([3, 3]);
    lX.beginPath(); lX.moveTo(cxPx, pad.t); lX.lineTo(cxPx, pad.t + ph); lX.stroke(); lX.setLineDash([]);
    for (let j = 1; j <= 6; j++) { const jx = pad.l + (j / 6) * pw; lX.strokeStyle = 'rgba(0,212,255,.25)'; lX.lineWidth = .6; lX.beginPath(); lX.moveTo(jx, pad.t); lX.lineTo(jx, pad.t + ph); lX.stroke(); lX.fillStyle = 'rgba(0,212,255,.5)'; lX.font = '7px JetBrains Mono'; lX.fillText('J' + j, jx + 1, pad.t + 10); }
    lX.fillStyle = 'rgba(107,138,170,.8)'; lX.font = '7px JetBrains Mono';
    for (let r = Math.ceil(yMin); r <= Math.floor(yMax); r += 2) { const y2 = pad.t + ph - (r - yMin) * yScale; if (y2 >= pad.t && y2 <= pad.t + ph) lX.fillText(r, CHART_Y_TICK_X, y2 + 3); }
    lX.fillStyle = 'rgba(107,138,170,.6)'; lX.font = '7px Inter'; lX.fillText('R mm', CHART_Y_TICK_X, pad.t - 4);
    ['0%', '25%', '50%', '75%', '100%'].forEach((lbl, i) => { lX.fillStyle = 'rgba(107,138,170,.6)'; lX.font = '7px JetBrains Mono'; lX.fillText(lbl, pad.l + i / 4 * pw - 6, xAxisTitleY); });
    lX.fillStyle = 'rgba(0,212,255,.9)'; lX.font = '8px Inter';
    lX.fillText('θ: ' + (csY / DATA_H * 360).toFixed(1) + '°  (circumferential crosshair)', pad.l + 2, pad.t - 4);
    const rightLabelX = w - 6;
    const drawRightMarker = (text, y, fill, stroke) => {
        const cy = clamp(y, pad.t + 10, pad.t + ph - 4);
        const textW = text === 'ID/2' ? 18 : 13;
        const boxW = textW + 8;
        lX.fillStyle = 'rgba(6,13,26,.84)';
        lX.fillRect(rightLabelX - boxW, cy - 7, boxW, 12);
        lX.strokeStyle = stroke;
        lX.lineWidth = .8;
        lX.strokeRect(rightLabelX - boxW, cy - 7, boxW, 12);
        lX.textAlign = 'right';
        lX.fillStyle = fill;
        lX.font = '7px Inter';
        lX.fillText(text, rightLabelX - 4, cy + 2);
    };
    drawRightMarker('NOM', nomY + 3, 'rgba(0,212,255,.82)', 'rgba(0,212,255,.35)');
    drawRightMarker('MIN', minY + 3, 'rgba(244,63,94,.82)', 'rgba(244,63,94,.35)');
    drawRightMarker('ID/2', riY + 3, 'rgba(107,138,170,.82)', 'rgba(107,138,170,.35)');
    lX.textAlign = 'left';
}

// ── Chart 1: Scatter + ERF ───────────────────────────────────────────────────
const scatterOverlay = document.getElementById('scatterOverlay');
const pX = scatterOverlay.getContext('2d');
const scatterVtkContainer = document.getElementById('scatterVtkContainer');
const scatterTip = document.getElementById('scatterTip');
const scatterStatusTag = document.getElementById('scatterStatusTag');
const PIPE = { D_mm: 304.8, T_mm: 10.0, SMYS_psi: 65000, MAOP_psi: 1440, Pdes_psi: 1600, erfMode: 'standard' };
const HISTOGRAM_SETTINGS = { thresholds: { low: 0, middle: 35, high: 55 }, nBins: 12 };
const HISTOGRAM_TIER_ORDER = ['LOW', 'MIDDLE', 'HIGH'];
const HISTOGRAM_SURFACE_ORDER = ['ALL', 'INT', 'EXT'];
const VELOCITY_WINDOW = { minDistance: 640, maxDistance: 2440 };
const VELOCITY_MODE = 'm/s';

histNBins = HISTOGRAM_SETTINGS.nBins;

let histogramTier = 'MIDDLE';
let histogramSurface = 'ALL';

function seededUnit(seed) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
    return value - Math.floor(value);
}

function cycleValue(options, current, delta) {
    const index = options.indexOf(current);
    const next = (index + delta + options.length) % options.length;
    return options[next];
}

function buildLinearTicks(min, max, count) {
    if (!(max > min)) return [min];
    return Array.from({ length: count + 1 }, (_, index) => min + (index / count) * (max - min));
}

function surfaceColor(surface) {
    return surface === 'INT' ? '#f59e0b' : '#60a5fa';
}

function surfaceRgb(surface) {
    return surface === 'INT' ? [245, 158, 11] : [96, 165, 250];
}

function histogramTierColor(tier) {
    if (tier === 'LOW') return [52, 211, 153];
    if (tier === 'HIGH') return [244, 63, 94];
    return [245, 158, 11];
}

function getVelocityUnitLabel() {
    return VELOCITY_MODE;
}

function getVelocityKey() {
    return VELOCITY_MODE === 'm/min' ? 'velocityMpm' : 'velocityMps';
}

function standardErfFraction(lengthMm) {
    const D = PIPE.D_mm;
    const T = PIPE.T_mm;
    const criteria = (lengthMm * lengthMm) / (D * T);
    const depthShort = 1 / Math.sqrt(1 + 0.8 * criteria);
    const R = PIPE.MAOP_psi / (1.1 * PIPE.Pdes_psi);
    const depthShortErf = ((1 - R) / Math.max(1e-9, 1 - R * depthShort)) * 1.5;
    const depthLong = 1 - R;
    return criteria <= 20 ? depthShortErf : depthLong;
}

function modifiedErfFraction(lengthMm) {
    const TIn = PIPE.T_mm / 25.4;
    const DIn = PIPE.D_mm / 25.4;
    const DF = (PIPE.Pdes_psi * DIn) / (2 * TIn * PIPE.SMYS_psi);
    const Pi = (2 * PIPE.T_mm * (PIPE.SMYS_psi + 10000) * DF) / PIPE.D_mm;
    const z = Math.sqrt((lengthMm * lengthMm) / (PIPE.D_mm * PIPE.T_mm));
    const depthShortErf = 1 - PIPE.MAOP_psi / Pi;
    const mLess = 1 / Math.sqrt(Math.max(1e-9, 1 + 0.6275 * z - 0.003375 * z * z));
    const mMore = (0.032 * z + 3.3) ** -1;
    const mullins = z <= 50 ? mLess : mMore;
    const denominator = 1 - (PIPE.MAOP_psi / Pi) * mullins;
    return denominator <= 0 ? 0.8 : (depthShortErf / denominator) * (1 / 0.85);
}

function calculateErfPercent(lengthMm, mode = PIPE.erfMode) {
    const fraction = mode === 'modified' ? modifiedErfFraction(lengthMm) : standardErfFraction(lengthMm);
    const bounded = Math.max(0, fraction);
    return bounded > 0.8 ? 80 : bounded * 100;
}

function erfDepth(lengthMm) {
    return calculateErfPercent(lengthMm);
}

const tooldbRows = (() => {
    let distanceM = 70;
    return Array.from({ length: 72 }, (_, index) => {
        distanceM += 28 + seededUnit(index + 11) * 56;
        const surface = seededUnit(index + 7) > 0.47 ? 'INT' : 'EXT';
        const lengthMm = 18 + seededUnit(index + 29) * 920;
        const erf = calculateErfPercent(lengthMm);
        const variation = (seededUnit(index + 53) - 0.46) * 32 + (surface === 'INT' ? 4 : -2);
        const maxDepthPct = clamp(erf + variation, 4, 80);
        return {
            id: index + 1,
            logDistanceM: distanceM,
            lengthMm,
            maxDepthPct,
            surface,
            erf,
        };
    });
})();

const scatterData = tooldbRows.map(row => ({
    L: row.lengthMm,
    depth: row.maxDepthPct,
    col: surfaceColor(row.surface),
    name: row.surface,
    surface: row.surface,
    erf: row.erf,
    logDistanceM: row.logDistanceM,
}));

function buildErfCurve(rows = scatterData) {
    const Lchart = rows.length ? Math.max(...rows.map(point => point.L)) : 2000;
    const erfCount = Math.max(Math.ceil(Lchart * 1.2), Math.max(2000, rows.length));
    return Array.from({ length: erfCount }, (_, index) => ({ L: index, y: calculateErfPercent(index) }));
}

const erfCurve = buildErfCurve();

function getScatterBounds() {
    const Lchart = scatterData.length ? Math.max(...scatterData.map(point => point.L)) : 2000;
    const xMax = Lchart * 1.1;
    const drawnCurve = erfCurve.filter(point => point.L <= xMax);
    const scatterMax = scatterData.length ? Math.max(...scatterData.map(point => point.depth)) : 100;
    const curveMax = drawnCurve.length ? Math.max(...drawnCurve.map(point => point.y)) : 100;
    const Ymax = 1.1 * Math.max(scatterMax, curveMax, scatterData.length ? 0 : 100);
    return { Lchart, xMax, Ymax };
}

function histogramTierMatch(erf) {
    if (histogramTier === 'LOW') return erf >= HISTOGRAM_SETTINGS.thresholds.low && erf < HISTOGRAM_SETTINGS.thresholds.middle;
    if (histogramTier === 'HIGH') return erf >= HISTOGRAM_SETTINGS.thresholds.high;
    return erf >= HISTOGRAM_SETTINGS.thresholds.middle && erf < HISTOGRAM_SETTINGS.thresholds.high;
}

function getHistogramRows() {
    return tooldbRows.filter(row => histogramTierMatch(row.erf) && (histogramSurface === 'ALL' || row.surface === histogramSurface));
}

const velocityWeldRows = Array.from({ length: 8 }, (_, index) => {
    const distanceM = index * 480;
    const velocityMps = 0.72 + index * 0.035 + (seededUnit(index + 211) - 0.5) * 0.08;
    return {
        distanceM,
        velocityMps: clamp(velocityMps, 0.55, 1.15),
        velocityMpm: clamp(velocityMps, 0.55, 1.15) * 60,
        rowType: 'WELD',
    };
});

const velocityQueryRowsRaw = [
    { distanceM: 1560, velocityMps: 0.88, velocityMpm: 52.8, rowType: 'QUERY' },
];

function interpolateVelocityValue(before, after, distanceM, key) {
    const t = (distanceM - before.distanceM) / Math.max(after.distanceM - before.distanceM, 1e-9);
    return before[key] + t * (after[key] - before[key]);
}

function findVelocityBracket(distanceM) {
    const before = [...velocityWeldRows].reverse().find(row => row.distanceM <= distanceM);
    const after = velocityWeldRows.find(row => row.distanceM >= distanceM);
    if (!before || !after || before.distanceM === after.distanceM) return null;
    return { before, after };
}

function getVelocityDisplayRows() {
    const rows = [...velocityQueryRowsRaw].sort((left, right) => left.distanceM - right.distanceM);
    if (rows.length >= 2) return rows;
    const startBracket = findVelocityBracket(VELOCITY_WINDOW.minDistance);
    const endBracket = findVelocityBracket(VELOCITY_WINDOW.maxDistance);
    const synthesized = [];
    if (startBracket) {
        synthesized.push({
            distanceM: VELOCITY_WINDOW.minDistance,
            velocityMps: interpolateVelocityValue(startBracket.before, startBracket.after, VELOCITY_WINDOW.minDistance, 'velocityMps'),
            velocityMpm: interpolateVelocityValue(startBracket.before, startBracket.after, VELOCITY_WINDOW.minDistance, 'velocityMpm'),
            synthesized: true,
        });
    }
    if (endBracket) {
        synthesized.push({
            distanceM: VELOCITY_WINDOW.maxDistance,
            velocityMps: interpolateVelocityValue(endBracket.before, endBracket.after, VELOCITY_WINDOW.maxDistance, 'velocityMps'),
            velocityMpm: interpolateVelocityValue(endBracket.before, endBracket.after, VELOCITY_WINDOW.maxDistance, 'velocityMpm'),
            synthesized: true,
        });
    }
    return synthesized.sort((left, right) => left.distanceM - right.distanceM);
}

const velData = getVelocityDisplayRows();

function updateChartStatusTags() {
    if (scatterStatusTag) scatterStatusTag.textContent = 'INT / EXT';
    if (histStatusTag) histStatusTag.textContent = `${histogramTier} · ${histogramSurface}`;
    if (velocityStatusTag) velocityStatusTag.textContent = `${velocityQueryRowsRaw.length < 2 ? 'WELD interp' : 'Query pts'} · ${getVelocityUnitLabel()}`;
}

let scatterHover = null;

function getScatterPad() {
    return { l: CHART_AXIS_INSET, r: 10, t: 14, b: CHART_AXIS_INSET };
}

function layoutScatterVtkContainer() {
    const panelBody = scatterVtkContainer.parentElement;
    const w = panelBody.clientWidth;
    const h = panelBody.clientHeight;
    const pad = getScatterPad();
    const plotW = Math.max(1, w - pad.l - pad.r);
    const plotH = Math.max(1, h - pad.t - pad.b);
    scatterVtkContainer.style.left = `${pad.l}px`;
    scatterVtkContainer.style.top = `${pad.t}px`;
    scatterVtkContainer.style.width = `${plotW}px`;
    scatterVtkContainer.style.height = `${plotH}px`;
    return { w, h, pad, plotW, plotH };
}

function setParallelChartCamera(renderer, container, xMin, xMax, yMin, yMax) {
    renderer.resetCamera();
    const cam = renderer.getActiveCamera();
    const { width, height } = container.getBoundingClientRect();
    const aspect = height > 0 ? width / height : 1;
    const worldWidth = xMax - xMin;
    const worldHeight = yMax - yMin;
    cam.setPosition((xMin + xMax) / 2, (yMin + yMax) / 2, 18);
    cam.setFocalPoint((xMin + xMax) / 2, (yMin + yMax) / 2, 0);
    cam.setViewUp(0, 1, 0);
    cam.setParallelProjection(true);
    cam.setParallelScale(Math.max(worldHeight / 2, worldWidth / (2 * Math.max(aspect, 1))));
    cam.setClippingRange(0.1, 100);
}

function createLinePolyData(points) {
    const polyData = vtkPolyData.newInstance();
    const ptsObj = vtkPoints.newInstance();
    const positions = new Float64Array(points.length * 3);
    const lines = [];
    points.forEach((point, index) => {
        positions[index * 3] = point.x;
        positions[index * 3 + 1] = point.y;
        positions[index * 3 + 2] = 0;
        if (index > 0) lines.push(2, index - 1, index);
    });
    ptsObj.setData(positions, 3);
    polyData.setPoints(ptsObj);
    const lineCells = vtkCellArray.newInstance();
    lineCells.setData(new Uint32Array(lines));
    polyData.setLines(lineCells);
    return polyData;
}

function buildScatterScene() {
    if (!scatterVtkOpenGLWindow) return;
    layoutScatterVtkContainer();
    scatterVtkRenderer.removeAllActors();

    const { xMax, Ymax } = getScatterBounds();

    const pointPoly = vtkPolyData.newInstance();
    const pointPositions = new Float64Array(scatterData.length * 3);
    const pointColors = new Uint8Array(scatterData.length * 3);
    const pointVerts = [];
    scatterData.forEach((point, index) => {
        pointPositions[index * 3] = point.L;
        pointPositions[index * 3 + 1] = point.depth;
        pointPositions[index * 3 + 2] = 0;
        pointVerts.push(1, index);
        const rgb = surfaceRgb(point.surface);
        pointColors[index * 3] = rgb[0];
        pointColors[index * 3 + 1] = rgb[1];
        pointColors[index * 3 + 2] = rgb[2];
    });
    const pointPts = vtkPoints.newInstance();
    pointPts.setData(pointPositions, 3);
    pointPoly.setPoints(pointPts);
    const vertCells = vtkCellArray.newInstance();
    vertCells.setData(new Uint32Array(pointVerts));
    pointPoly.setVerts(vertCells);
    const pointColorsDA = vtkDataArray.newInstance({ name: 'colors', values: pointColors, numberOfComponents: 3 });
    pointPoly.getPointData().addArray(pointColorsDA);
    pointPoly.getPointData().setActiveScalars('colors');

    const pointMapper = vtkMapper.newInstance();
    pointMapper.setInputData(pointPoly);
    pointMapper.setScalarVisibility(true);
    pointMapper.setColorModeToDirectScalars();
    pointMapper.setColorByArrayName('colors');
    pointMapper.setScalarModeToUsePointData();

    const pointActor = vtkActor.newInstance();
    pointActor.setMapper(pointMapper);
    pointActor.getProperty().setRepresentationToPoints();
    pointActor.getProperty().setPointSize(6);
    pointActor.getProperty().setOpacity(0.95);
    scatterVtkRenderer.addActor(pointActor);

    const erfPoly = createLinePolyData(erfCurve.filter(point => point.L <= xMax).map(point => ({ x: point.L, y: point.y })));
    const erfMapper = vtkMapper.newInstance();
    erfMapper.setInputData(erfPoly);
    const erfActor = vtkActor.newInstance();
    erfActor.setMapper(erfMapper);
    erfActor.getProperty().setColor(0xf4 / 255, 0x3f / 255, 0x5e / 255);
    erfActor.getProperty().setLineWidth(2);
    scatterVtkRenderer.addActor(erfActor);

    setParallelChartCamera(scatterVtkRenderer, scatterVtkContainer, 0, xMax, 0, Ymax);

    const { width, height } = scatterVtkContainer.getBoundingClientRect();
    if (width > 0 && height > 0) {
        scatterVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
    }
    scatterVtkRenderWindow.render();
}

function initScatterVTK() {
    if (scatterVtkInitialized) return;
    scatterVtkInitialized = true;
    scatterVtkRenderer = vtkRenderer.newInstance();
    scatterVtkRenderer.setBackground(0.025, 0.05, 0.1, 1.0);
    scatterVtkRenderWindow = vtkRenderWindow.newInstance();
    scatterVtkRenderWindow.addRenderer(scatterVtkRenderer);
    scatterVtkOpenGLWindow = vtkOpenGLRenderWindow.newInstance();
    scatterVtkOpenGLWindow.setContainer(scatterVtkContainer);
    scatterVtkRenderWindow.addView(scatterVtkOpenGLWindow);
    buildScatterScene();
}

function drawScatterERF() {
    fit(scatterOverlay);
    const w = scatterOverlay.width, h = scatterOverlay.height;
    const pad = getScatterPad();
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const xTickY = pad.t + ph + CHART_X_TICK_Y;
    const xAxisTitleY = pad.t + ph + pad.b - CHART_X_AXIS_TITLE_OFFSET;
    pX.clearRect(0, 0, w, h);
    const { xMax, Ymax } = getScatterBounds();
    const toX = L => pad.l + (L / xMax) * pw;
    const toY = pct => pad.t + (1 - pct / Ymax) * ph;
    pX.strokeStyle = 'rgba(30,51,82,.6)'; pX.lineWidth = .5;
    buildLinearTicks(0, Math.ceil(Ymax / 10) * 10, 4).forEach(pct => { if (pct > Ymax) return; const y = toY(pct); pX.beginPath(); pX.moveTo(pad.l, y); pX.lineTo(pad.l + pw, y); pX.stroke(); pX.fillStyle = 'rgba(107,138,170,.7)'; pX.font = '7px JetBrains Mono'; pX.fillText(pct.toFixed(0) + '%', CHART_Y_TICK_X, y + 3); });
    buildLinearTicks(0, xMax, 5).forEach(L => { const x = toX(L); pX.beginPath(); pX.moveTo(x, pad.t); pX.lineTo(x, pad.t + ph); pX.stroke(); pX.fillStyle = 'rgba(107,138,170,.6)'; pX.font = '7px JetBrains Mono'; pX.fillText(L.toFixed(0), x - 8, xTickY); });
    drawChartAxes(pX, pad, pw, ph);
    const erfLast = erfCurve.filter(p => p.L <= xMax).slice(-1)[0];
    pX.fillStyle = '#f43f5e'; pX.font = 'bold 7.5px Inter'; pX.fillText('ERF', toX(erfLast.L) + 2, toY(erfLast.y) + 3);
    pX.fillStyle = 'rgba(107,138,170,.8)'; pX.font = '7.5px JetBrains Mono'; pX.fillText('Max depth (%)', pad.l, pad.t - 2);
    pX.fillText('Length (mm)', pad.l + pw - 44, xAxisTitleY);
    [{ col: surfaceColor('INT'), lbl: 'INT' }, { col: surfaceColor('EXT'), lbl: 'EXT' }].forEach(({ col, lbl }, i) => {
        const lx = pad.l + pw - 42, ly = pad.t + 8 + i * 10;
        pX.fillStyle = col; pX.beginPath(); pX.arc(lx, ly, 2.5, 0, PI2); pX.fill();
        pX.fillStyle = 'rgba(107,138,170,.8)'; pX.font = '7px Inter'; pX.fillText(lbl, lx + 5, ly + 3);
    });
    if (scatterHover) {
        const hoverX = toX(scatterHover.point.L);
        const hoverY = toY(scatterHover.point.depth);
        pX.strokeStyle = 'rgba(255,255,255,.4)'; pX.lineWidth = .9; pX.setLineDash([3, 3]);
        pX.beginPath(); pX.moveTo(hoverX, pad.t); pX.lineTo(hoverX, pad.t + ph); pX.stroke();
        pX.beginPath(); pX.moveTo(pad.l, hoverY); pX.lineTo(pad.l + pw, hoverY); pX.stroke();
        pX.setLineDash([]);
        pX.beginPath(); pX.arc(hoverX, hoverY, 5, 0, PI2);
        pX.strokeStyle = scatterHover.point.col; pX.lineWidth = 1.5; pX.stroke();
    }
}

// ── Chart 2: Histogram ───────────────────────────────────────────────────────
const histOverlay = document.getElementById('histOverlay');
const hX = histOverlay.getContext('2d');
const histVtkContainer = document.getElementById('histVtkContainer');
const histTip = document.getElementById('histTip');
const histStatusTag = document.getElementById('histStatusTag');

let histHover = null;

function getHistPad() {
    return { l: CHART_AXIS_INSET, r: 6, t: 14, b: CHART_AXIS_INSET };
}

function layoutHistVtkContainer() {
    const panelBody = histVtkContainer.parentElement;
    const w = panelBody.clientWidth;
    const h = panelBody.clientHeight;
    const pad = getHistPad();
    const plotW = Math.max(1, w - pad.l - pad.r);
    const plotH = Math.max(1, h - pad.t - pad.b);
    histVtkContainer.style.left = `${pad.l}px`;
    histVtkContainer.style.top = `${pad.t}px`;
    histVtkContainer.style.width = `${plotW}px`;
    histVtkContainer.style.height = `${plotH}px`;
    return { w, h, pad, plotW, plotH };
}

function buildHistogramScene() {
    if (!histVtkOpenGLWindow) return;
    layoutHistVtkContainer();
    histVtkRenderer.removeAllActors();

    const { counts, step, dMin, dMax, yAxisMax } = buildHistBins(histNBins);
    const pointCount = histNBins * 4;
    const positions = new Float64Array(pointCount * 3);
    const colors = new Uint8Array(pointCount * 3);
    const cells = new Uint32Array(histNBins * 8);
    const rgb = histogramTierColor(histogramTier);

    counts.forEach((count, index) => {
        const x0 = dMin + index * step;
        const x1 = x0 + step * 0.92;
        const y0 = 0;
        const y1 = count;
        const base = index * 4;
        const posIdx = base * 3;

        positions[posIdx] = x0; positions[posIdx + 1] = y0; positions[posIdx + 2] = 0;
        positions[posIdx + 3] = x1; positions[posIdx + 4] = y0; positions[posIdx + 5] = 0;
        positions[posIdx + 6] = x0; positions[posIdx + 7] = y1; positions[posIdx + 8] = 0;
        positions[posIdx + 9] = x1; positions[posIdx + 10] = y1; positions[posIdx + 11] = 0;

        for (let offset = 0; offset < 4; offset++) {
            colors[(base + offset) * 3] = rgb[0];
            colors[(base + offset) * 3 + 1] = rgb[1];
            colors[(base + offset) * 3 + 2] = rgb[2];
        }

        const cellIdx = index * 8;
        cells[cellIdx] = 3; cells[cellIdx + 1] = base; cells[cellIdx + 2] = base + 1; cells[cellIdx + 3] = base + 2;
        cells[cellIdx + 4] = 3; cells[cellIdx + 5] = base + 1; cells[cellIdx + 6] = base + 3; cells[cellIdx + 7] = base + 2;
    });

    const polyData = vtkPolyData.newInstance();
    const ptsObj = vtkPoints.newInstance();
    ptsObj.setData(positions, 3);
    polyData.setPoints(ptsObj);
    const cellArray = vtkCellArray.newInstance();
    cellArray.setData(cells);
    polyData.setPolys(cellArray);
    const colorsDA = vtkDataArray.newInstance({ name: 'colors', values: colors, numberOfComponents: 3 });
    polyData.getPointData().addArray(colorsDA);
    polyData.getPointData().setActiveScalars('colors');

    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);
    mapper.setScalarVisibility(true);
    mapper.setColorModeToDirectScalars();
    mapper.setColorByArrayName('colors');
    mapper.setScalarModeToUsePointData();

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setInterpolationToFlat();
    histVtkRenderer.addActor(actor);

    setParallelChartCamera(histVtkRenderer, histVtkContainer, dMin, dMax, 0, yAxisMax);
    const { width, height } = histVtkContainer.getBoundingClientRect();
    if (width > 0 && height > 0) {
        histVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
    }
    histVtkRenderWindow.render();
}

function initHistVTK() {
    if (histVtkInitialized) return;
    histVtkInitialized = true;
    histVtkRenderer = vtkRenderer.newInstance();
    histVtkRenderer.setBackground(0.025, 0.05, 0.1, 1.0);
    histVtkRenderWindow = vtkRenderWindow.newInstance();
    histVtkRenderWindow.addRenderer(histVtkRenderer);
    histVtkOpenGLWindow = vtkOpenGLRenderWindow.newInstance();
    histVtkOpenGLWindow.setContainer(histVtkContainer);
    histVtkRenderWindow.addView(histVtkOpenGLWindow);
    buildHistogramScene();
}

function buildHistBins(nBins) {
    const rows = getHistogramRows();
    let dMin = 0;
    let dMax = 1000;
    if (rows.length) {
        dMin = Math.min(...rows.map(row => row.logDistanceM));
        dMax = Math.max(...rows.map(row => row.logDistanceM));
        if (dMax === dMin) dMax = dMin + 100;
    }
    const step = (dMax - dMin) / nBins;
    const counts = new Array(nBins).fill(0);
    rows.forEach(row => {
        const rawIndex = step > 0 ? Math.floor((row.logDistanceM - dMin) / step) : 0;
        const index = Math.max(0, Math.min(nBins - 1, rawIndex));
        counts[index] += 1;
    });
    const maxCount = counts.length ? Math.max(...counts) : 0;
    const yAxisMax = maxCount === 0 ? 5 : maxCount + 2;
    return { rows, counts, step, dMin, dMax, yAxisMax };
}

function drawHistogram() {
    fit(histOverlay);
    const w = histOverlay.width, h = histOverlay.height;
    const pad = getHistPad();
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const xAxisTitleY = pad.t + ph + pad.b - CHART_X_AXIS_TITLE_OFFSET;
    hX.clearRect(0, 0, w, h);
    const { counts, step, dMin, dMax, yAxisMax } = buildHistBins(histNBins);
    const bw = pw / histNBins;
    hX.strokeStyle = 'rgba(30,51,82,.6)'; hX.lineWidth = .5;
    [0, 1].forEach(f => { const y = pad.t + f * ph; hX.beginPath(); hX.moveTo(pad.l, y); hX.lineTo(pad.l + pw, y); hX.stroke(); });
    [0, Math.ceil(yAxisMax / 2), yAxisMax].forEach(c => {
        const y = pad.t + (1 - c / yAxisMax) * ph;
        hX.beginPath(); hX.moveTo(pad.l, y); hX.lineTo(pad.l + pw, y); hX.stroke();
        hX.fillStyle = 'rgba(107,138,170,.7)'; hX.font = '7px JetBrains Mono'; hX.fillText(c, CHART_Y_TICK_X, y + 3);
    });
    drawChartAxes(hX, pad, pw, ph);
    counts.forEach((cnt, k) => {
        const bx = pad.l + k * bw + 1;
        const midDistance = dMin + (k + 0.5) * step;
        if (k % 3 === 0 || k === histNBins - 1) { hX.fillStyle = 'rgba(107,138,170,.6)'; hX.font = '6px JetBrains Mono'; hX.fillText(midDistance.toFixed(0), bx - 2, xAxisTitleY); }
        if (histHover?.index === k) {
            const bh = (cnt / yAxisMax) * ph;
            const by = pad.t + ph - bh;
            hX.strokeStyle = 'rgba(255,255,255,.6)'; hX.lineWidth = 1;
            hX.strokeRect(bx, by, Math.max(bw - 1.5, 1), bh);
        }
    });
    hX.fillStyle = 'rgba(107,138,170,.8)'; hX.font = '7.5px JetBrains Mono'; hX.fillText('Count', pad.l, pad.t - 2);
    hX.fillText('Log distance (m)', pad.l + pw - 58, xAxisTitleY);
    hX.fillStyle = 'rgba(0,212,255,.6)'; hX.font = '7px Inter'; hX.fillText(`${histogramTier} · ${histogramSurface}`, pad.l + 2, pad.t + 8);
    hX.fillStyle = 'rgba(107,138,170,.75)'; hX.fillText(`ERF ${HISTOGRAM_SETTINGS.thresholds.middle}-${HISTOGRAM_SETTINGS.thresholds.high}%`, pad.l + 2, pad.t + 18);
}

document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') {
        histogramTier = cycleValue(HISTOGRAM_TIER_ORDER, histogramTier, -1);
        e.preventDefault();
        updateChartStatusTags();
        buildHistogramScene();
        drawHistogram();
    }
    if (e.key === 'ArrowRight') {
        histogramTier = cycleValue(HISTOGRAM_TIER_ORDER, histogramTier, 1);
        e.preventDefault();
        updateChartStatusTags();
        buildHistogramScene();
        drawHistogram();
    }
    if (e.key === 'ArrowUp') {
        histogramSurface = cycleValue(HISTOGRAM_SURFACE_ORDER, histogramSurface, 1);
        e.preventDefault();
        updateChartStatusTags();
        buildHistogramScene();
        drawHistogram();
    }
    if (e.key === 'ArrowDown') {
        histogramSurface = cycleValue(HISTOGRAM_SURFACE_ORDER, histogramSurface, -1);
        e.preventDefault();
        updateChartStatusTags();
        buildHistogramScene();
        drawHistogram();
    }
});

// ── Chart 3: Tool Velocity ───────────────────────────────────────────────────
const velocityOverlay = document.getElementById('velocityOverlay');
const prX = velocityOverlay.getContext('2d');
const velocityVtkContainer = document.getElementById('velocityVtkContainer');
const velocityTip = document.getElementById('velocityTip');
const velocityStatusTag = document.getElementById('velocityStatusTag');

let velocityHover = null;

function getVelocityPad() {
    return { l: CHART_AXIS_INSET, r: 10, t: 14, b: CHART_AXIS_INSET };
}

function layoutVelocityVtkContainer() {
    const panelBody = velocityVtkContainer.parentElement;
    const w = panelBody.clientWidth;
    const h = panelBody.clientHeight;
    const pad = getVelocityPad();
    const plotW = Math.max(1, w - pad.l - pad.r);
    const plotH = Math.max(1, h - pad.t - pad.b);
    velocityVtkContainer.style.left = `${pad.l}px`;
    velocityVtkContainer.style.top = `${pad.t}px`;
    velocityVtkContainer.style.width = `${plotW}px`;
    velocityVtkContainer.style.height = `${plotH}px`;
    return { w, h, pad, plotW, plotH };
}

function createFilledAreaPolyData(data, xKey, yKey) {
    const polyData = vtkPolyData.newInstance();
    const pointCount = data.length + 2;
    const positions = new Float64Array(pointCount * 3);
    const maxX = data[data.length - 1][xKey];
    positions[0] = 0; positions[1] = 0; positions[2] = 0;
    data.forEach((point, index) => {
        const posIdx = (index + 1) * 3;
        positions[posIdx] = point[xKey];
        positions[posIdx + 1] = point[yKey];
        positions[posIdx + 2] = 0;
    });
    positions[(pointCount - 1) * 3] = maxX;
    positions[(pointCount - 1) * 3 + 1] = 0;
    positions[(pointCount - 1) * 3 + 2] = 0;
    const ptsObj = vtkPoints.newInstance();
    ptsObj.setData(positions, 3);
    polyData.setPoints(ptsObj);
    const polys = vtkCellArray.newInstance();
    const cell = [pointCount];
    for (let index = 0; index < pointCount; index++) cell.push(index);
    polys.setData(new Uint32Array(cell));
    polyData.setPolys(polys);
    return polyData;
}

function buildVelocityScene() {
    if (!velocityVtkOpenGLWindow) return;
    layoutVelocityVtkContainer();
    velocityVtkRenderer.removeAllActors();

    const velocityKey = getVelocityKey();
    const dMin = velData[0].distanceM;
    const dMax = velData[velData.length - 1].distanceM;
    const vMax = 1.1 * Math.max(...velData.map(point => point[velocityKey]));
    const velocityPoly = createLinePolyData(velData.map(point => ({ x: point.distanceM, y: point[velocityKey] })));
    const velocityMapper = vtkMapper.newInstance();
    velocityMapper.setInputData(velocityPoly);
    const velocityActor = vtkActor.newInstance();
    velocityActor.setMapper(velocityMapper);
    velocityActor.getProperty().setColor(0x60 / 255, 0xa5 / 255, 0xfa / 255);
    velocityActor.getProperty().setLineWidth(2.2);
    velocityVtkRenderer.addActor(velocityActor);

    setParallelChartCamera(velocityVtkRenderer, velocityVtkContainer, dMin, dMax, 0, vMax);
    const { width, height } = velocityVtkContainer.getBoundingClientRect();
    if (width > 0 && height > 0) {
        velocityVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
    }
    velocityVtkRenderWindow.render();
}

function initVelocityVTK() {
    if (velocityVtkInitialized) return;
    velocityVtkInitialized = true;
    velocityVtkRenderer = vtkRenderer.newInstance();
    velocityVtkRenderer.setBackground(0.025, 0.05, 0.1, 1.0);
    velocityVtkRenderWindow = vtkRenderWindow.newInstance();
    velocityVtkRenderWindow.addRenderer(velocityVtkRenderer);
    velocityVtkOpenGLWindow = vtkOpenGLRenderWindow.newInstance();
    velocityVtkOpenGLWindow.setContainer(velocityVtkContainer);
    velocityVtkRenderWindow.addView(velocityVtkOpenGLWindow);
    buildVelocityScene();
}

function drawVelocity() {
    fit(velocityOverlay);
    const w = velocityOverlay.width, h = velocityOverlay.height;
    const pad = getVelocityPad();
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const xTickY = pad.t + ph + CHART_X_TICK_Y;
    const xAxisTitleY = pad.t + ph + pad.b - CHART_X_AXIS_TITLE_OFFSET;
    prX.clearRect(0, 0, w, h);
    const velocityKey = getVelocityKey();
    const dMin = velData[0].distanceM;
    const dMax = velData[velData.length - 1].distanceM;
    const vMax = 1.1 * Math.max(...velData.map(point => point[velocityKey]));
    const toX = d => pad.l + ((d - dMin) / Math.max(dMax - dMin, 1e-9)) * pw;
    const toY = v => pad.t + (1 - v / vMax) * ph;
    prX.strokeStyle = 'rgba(30,51,82,.6)'; prX.lineWidth = .5;
    buildLinearTicks(0, Math.ceil(vMax * 10) / 10, 4).forEach(v => { if (v > vMax) return; const y = toY(v); prX.beginPath(); prX.moveTo(pad.l, y); prX.lineTo(pad.l + pw, y); prX.stroke(); prX.fillStyle = 'rgba(107,138,170,.7)'; prX.font = '7px JetBrains Mono'; prX.fillText(v.toFixed(2), CHART_Y_TICK_X, y + 3); });
    buildLinearTicks(dMin, dMax, 4).forEach(distance => { const x = toX(distance); prX.beginPath(); prX.moveTo(x, pad.t); prX.lineTo(x, pad.t + ph); prX.stroke(); prX.fillStyle = 'rgba(107,138,170,.6)'; prX.font = '7px JetBrains Mono'; prX.fillText(distance.toFixed(0), x - 8, xTickY); });
    drawChartAxes(prX, pad, pw, ph);
    prX.fillStyle = 'rgba(107,138,170,.8)'; prX.font = '7.5px JetBrains Mono'; prX.fillText(getVelocityUnitLabel(), pad.l, pad.t - 2);
    prX.fillText('Distance (m)', pad.l + pw - 42, xAxisTitleY);
    prX.fillStyle = 'rgba(107,138,170,.75)'; prX.font = '7px Inter';
    prX.fillText(velocityQueryRowsRaw.length < 2 ? 'WELD interpolation active' : 'Query samples', pad.l + 2, pad.t + 8);
    if (velocityHover) {
        const x = toX(velocityHover.point.distanceM);
        const y = toY(velocityHover.point[velocityKey]);
        prX.strokeStyle = 'rgba(255,255,255,.42)'; prX.lineWidth = .9; prX.setLineDash([3, 3]);
        prX.beginPath(); prX.moveTo(x, pad.t); prX.lineTo(x, pad.t + ph); prX.stroke();
        prX.setLineDash([]);
        prX.fillStyle = '#60a5fa'; prX.beginPath(); prX.arc(x, y, 4, 0, PI2); prX.fill();
    }
}

function resizeScatterVTK() {
    if (!scatterVtkOpenGLWindow) return;
    layoutScatterVtkContainer();
    const { width, height } = scatterVtkContainer.getBoundingClientRect();
    if (width > 0 && height > 0) {
        scatterVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
        buildScatterScene();
    }
}

function resizeHistVTK() {
    if (!histVtkOpenGLWindow) return;
    layoutHistVtkContainer();
    const { width, height } = histVtkContainer.getBoundingClientRect();
    if (width > 0 && height > 0) {
        histVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
        buildHistogramScene();
    }
}

function resizeVelocityVTK() {
    if (!velocityVtkOpenGLWindow) return;
    layoutVelocityVtkContainer();
    const { width, height } = velocityVtkContainer.getBoundingClientRect();
    if (width > 0 && height > 0) {
        velocityVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
        buildVelocityScene();
    }
}

scatterVtkContainer.addEventListener('mousemove', event => {
    const rect = scatterVtkContainer.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const { xMax, Ymax } = getScatterBounds();
    let nearest = null;
    let minDist2 = Infinity;
    scatterData.forEach(point => {
        const x = point.L / xMax * rect.width;
        const y = (1 - point.depth / Ymax) * rect.height;
        const dist2 = (x - px) ** 2 + (y - py) ** 2;
        if (dist2 < minDist2) {
            minDist2 = dist2;
            nearest = point;
        }
    });
    if (!nearest || minDist2 > 484) {
        scatterHover = null;
        scatterTip.style.opacity = '0';
        return;
    }
    scatterHover = { point: nearest };
    scatterTip.style.left = `${event.clientX - rect.left + 10}px`;
    scatterTip.style.top = `${event.clientY - rect.top + 10}px`;
    scatterTip.style.opacity = '1';
    scatterTip.textContent = `${nearest.surface}  L:${nearest.L.toFixed(0)} mm  Depth:${nearest.depth.toFixed(1)}%  ERF:${nearest.erf.toFixed(1)}%`;
});
scatterVtkContainer.addEventListener('mouseleave', () => { scatterHover = null; scatterTip.style.opacity = '0'; });

histVtkContainer.addEventListener('mousemove', event => {
    const rect = histVtkContainer.getBoundingClientRect();
    const px = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 0.9999);
    const { counts, step, dMin } = buildHistBins(histNBins);
    const index = Math.min(histNBins - 1, Math.floor(px * histNBins));
    histHover = { index };
    const low = dMin + index * step;
    const high = low + step;
    histTip.style.left = `${event.clientX - rect.left + 10}px`;
    histTip.style.top = `${event.clientY - rect.top + 10}px`;
    histTip.style.opacity = '1';
    histTip.textContent = `${low.toFixed(0)}-${high.toFixed(0)} m  Count:${counts[index]}  ${histogramTier}/${histogramSurface}`;
});
histVtkContainer.addEventListener('mouseleave', () => { histHover = null; histTip.style.opacity = '0'; });

velocityVtkContainer.addEventListener('mousemove', event => {
    const rect = velocityVtkContainer.getBoundingClientRect();
    const px = event.clientX - rect.left;
    let nearest = velData[0];
    let minDist = Infinity;
    const dMin = velData[0].distanceM;
    const dMax = velData[velData.length - 1].distanceM;
    velData.forEach(point => {
        const x = ((point.distanceM - dMin) / Math.max(dMax - dMin, 1e-9)) * rect.width;
        const dist = Math.abs(x - px);
        if (dist < minDist) {
            minDist = dist;
            nearest = point;
        }
    });
    velocityHover = { point: nearest };
    velocityTip.style.left = `${event.clientX - rect.left + 10}px`;
    velocityTip.style.top = `${event.clientY - rect.top + 10}px`;
    velocityTip.style.opacity = '1';
    velocityTip.textContent = `D:${nearest.distanceM.toFixed(0)} m  Speed:${nearest[getVelocityKey()].toFixed(2)} ${getVelocityUnitLabel()}${nearest.synthesized ? '  Interpolated' : ''}`;
});
velocityVtkContainer.addEventListener('mouseleave', () => { velocityHover = null; velocityTip.style.opacity = '0'; });

// ── Pipe Tally Table ─────────────────────────────────────────────────────────
// Real-data JSON format (loaded via "Load Data" button):
// {
//   "tally": [
//     { "joint":"001", "heatNo":"HT-9982", "odMm":304.8, "wtMm":10.0,
//       "lengthM":9.49, "grade":"X65", "minWtMm":9.86, "lossPct":1.4,
//       "status":"ok" }   // status: "ok" | "warn" | "flag"
//   ],
//   "scans": [            // optional — flat Float32Array per joint, length DATA_W*DATA_H
//     [0.1, 0.12, ...]    // joint index matches tally array index
//   ]
// }
let tallyData = [
    ['001', 'HT-9982', '304.8', '10.00', '9.49', 'X65', '9.86', '1.4', 'ok'],
    ['002', 'HT-9983', '304.8', '10.00', '9.53', 'X65', '9.93', '0.7', 'ok'],
    ['003', 'HT-9982', '304.8', '10.00', '9.43', 'X65', '9.88', '1.2', 'ok'],
    ['004', 'HT-9981', '304.8', '10.00', '9.47', 'X65', '9.83', '1.7', 'ok'],
    ['005', 'HT-9984', '304.8', '10.00', '9.50', 'X65', '9.80', '2.0', 'ok'],
    ['006', 'HT-9985', '304.8', '10.00', '9.41', 'X65', '8.76', '12.4', 'warn'],
    ['007', 'HT-9986', '304.8', '10.00', '9.54', 'X65', '9.92', '0.8', 'ok'],
    ['008', 'HT-9987', '304.8', '10.00', '9.46', 'X65', '8.57', '14.3', 'flag'],
    ['009', 'HT-9988', '304.8', '10.00', '9.52', 'X65', '9.87', '1.3', 'ok'],
    ['010', 'HT-9989', '304.8', '10.00', '9.43', 'X65', '9.82', '1.8', 'ok'],
    ['011', 'HT-9990', '304.8', '10.00', '9.48', 'X65', '9.85', '1.5', 'ok'],
    ['012', 'HT-9991', '304.8', '10.00', '9.51', 'X65', '9.91', '0.9', 'ok'],
    ['013', 'HT-9992', '304.8', '10.00', '9.46', 'X65', '9.81', '1.9', 'ok'],
    ['014', 'HT-9993', '304.8', '10.00', '9.44', 'X65', '9.02', '9.8', 'warn'],
    ['015', 'HT-9994', '304.8', '10.00', '9.50', 'X65', '9.87', '1.3', 'ok'],
    ['016', 'HT-9995', '304.8', '10.00', '9.53', 'X65', '9.94', '0.6', 'ok'],
    ['017', 'HT-9996', '304.8', '10.00', '9.45', 'X65', '9.84', '1.6', 'ok'],
    ['018', 'HT-9997', '304.8', '10.00', '9.49', 'X65', '9.84', '1.7', 'ok'],
];
const statusLabel = { ok: '✓ OK', warn: '⚠ Review', flag: '✕ Flag' };
let tallyRows = tallyData.map(row => ({
    joint: row[0],
    heatNo: row[1],
    odMm: Number(row[2]),
    wtMm: Number(row[3]),
    lengthM: Number(row[4]),
    grade: row[5],
    minWtMm: Number(row[6]),
    lossPct: Number(row[7]),
    status: row[8],
    statusLabel: statusLabel[row[8]],
}));

// ── Joint BLOB Database ───────────────────────────────────────────────────────
function buildJointBlobs() {
    JOINT_DEFECTS = tallyData.map((row, i) => {
        const status = row[8], seed = i + 1;
        if (status === 'ok') return [];
        const defCount = status === 'flag' ? 2 : 1;
        return Array.from({ length: defCount }, (_, d) => ({
            cx: clamp(0.20 + d * 0.42 + seededUnit(seed * 7 + d * 13) * 0.22, 0.08, 0.88),
            cy: clamp(0.18 + seededUnit(seed * 11 + d * 17) * 0.64, 0.08, 0.88),
            rx: 0.055 + seededUnit(seed * 2 + d) * 0.04,
            ry: 0.045 + seededUnit(seed * 3 + d) * 0.03,
            lbl: `${status === 'flag' ? 'DEF' : 'IND'}-${String(d + 1).padStart(2, '0')} · ${(8 + seededUnit(seed * 13 + d) * 14).toFixed(0)}%WT`,
            col: status === 'flag' ? '#f43f5e' : '#f59e0b',
        }));
    });

    JOINT_BLOBS = tallyData.map((row, i) => {
        const status = row[8], seed = i + 1;
        const buf = new Float32Array(DATA_W * DATA_H);
        for (let y = 0; y < DATA_H; y++) {
            for (let x = 0; x < DATA_W; x++) {
                const tx = x / DATA_W, ty = y / DATA_H;
                let v = 0.10
                    + Math.sin(tx * 22 + seed * 1.27) * 0.03
                    + Math.sin(ty * 18 + seed * 0.83) * 0.025
                    + Math.sin(tx * 6 + seed) * Math.sin(ty * 8 + seed * 0.6) * 0.018;
                // Weld seam at regular intervals
                const weldFrac = (tx * 6) % 1;
                if (weldFrac < 0.008) v = Math.max(v, 0.22);
                buf[y * DATA_W + x] = clamp(v, 0, 1);
            }
        }
        JOINT_DEFECTS[i].forEach(d => {
            const severity = status === 'flag' ? 0.62 + seededUnit(i * 31) * 0.18 : 0.38 + seededUnit(i * 17) * 0.12;
            for (let y = 0; y < DATA_H; y++) {
                for (let x = 0; x < DATA_W; x++) {
                    const tx = x / DATA_W, ty = y / DATA_H;
                    const ex = (tx - d.cx) / Math.max(d.rx, 0.01);
                    const ey = (ty - d.cy) / Math.max(d.ry, 0.01);
                    const dist2 = ex * ex + ey * ey;
                    if (dist2 < 2.25) buf[y * DATA_W + x] = clamp(buf[y * DATA_W + x] + severity * Math.exp(-dist2 * 1.4), 0, 1);
                }
            }
        });
        return buf;
    });
}

// ── Real-Data File Loader ─────────────────────────────────────────────────────
window.openLoadData = function openLoadData() {
    document.getElementById('dataFileInput').click();
};

document.getElementById('dataFileInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
        try {
            const json = JSON.parse(ev.target.result);
            applyLoadedData(json);
            showToast('✅', 'Data loaded', file.name);
        } catch (err) {
            showToast('❌', 'Load failed', err.message);
        }
        e.target.value = '';
    };
    reader.readAsText(file);
});

function applyLoadedData(json) {
    if (!json.tally || !Array.isArray(json.tally)) throw new Error('Missing "tally" array');

    // Rebuild tallyData / tallyRows from loaded JSON
    tallyData = json.tally.map(r => [
        String(r.joint ?? ''),
        String(r.heatNo ?? ''),
        String(r.odMm ?? 0),
        String(r.wtMm ?? 0),
        String(r.lengthM ?? 0),
        String(r.grade ?? ''),
        String(r.minWtMm ?? 0),
        String(r.lossPct ?? 0),
        String(r.status ?? 'ok'),
    ]);

    tallyRows = tallyData.map(row => ({
        joint: row[0], heatNo: row[1],
        odMm: Number(row[2]), wtMm: Number(row[3]), lengthM: Number(row[4]),
        grade: row[5], minWtMm: Number(row[6]), lossPct: Number(row[7]),
        status: row[8], statusLabel: statusLabel[row[8]] ?? row[8],
    }));

    // If real scan data provided, inject it into JOINT_BLOBS directly
    if (json.scans && Array.isArray(json.scans) && json.scans.length === tallyData.length) {
        JOINT_BLOBS = json.scans.map(flat => Float32Array.from(flat));
        JOINT_DEFECTS = tallyData.map(() => []);
    } else {
        buildJointBlobs();
    }

    // Rebuild grid and reload first joint
    buildDataMap();
    if (tallyGridApi) {
        tallyGridApi.setGridOption('rowData', tallyRows);
    }
    broadcastTallyToFloat(tallyRows);
    loadJointScan(0);
    updateDashboardLayout();
}


function loadJointScan(jointIdx) {
    if (!JOINT_BLOBS) return;
    activeJointIdx = jointIdx;
    const blob = JOINT_BLOBS[jointIdx];
    // Reconstruct dataMap from BLOB
    for (let y = 0; y < DATA_H; y++) {
        for (let x = 0; x < DATA_W; x++) dataMap[y][x] = blob[y * DATA_W + x];
    }
    // Swap defect overlays (2D canvas + 3D pipe)
    const meta = JOINT_DEFECTS[jointIdx];
    defs.length = 0;
    meta.forEach(d => defs.push(d));
    DEFECTS = meta.map((d, i) => ({
        cx: d.cx, cy: d.cy,
        label: `DEF-${String(i + 1).padStart(2, '0')}`,
        severity: 0.5 + i * 0.15,
        col: d.col,
        w: d.rx * 2,
        h: d.ry * 2,
    }));

    // Update panel 4 defect tag
    const cTag = document.getElementById('cScanPanelBody')?.closest('.panel')?.querySelector('.panel-tag');
    if (cTag) cTag.textContent = meta.length ? `${meta.length} Defect${meta.length > 1 ? 's' : ''}` : 'No Defects';

    // Update circ panel joint tag
    const circTag = document.getElementById('circJointTag');
    const row = tallyRows[jointIdx];
    if (circTag && row) circTag.textContent = `Joint ${row.joint} · ${row.status.toUpperCase()}`;

    circLastColumn = -1; // force redraw
    circLastRow = -1;
    bScanLastColumn = -1;
    longLastRow = -1;

    if (vtkInitialized) { if (view3D) updateReferencePipe(); else buildHeatmapScene(); }
    if (rangeVtkInitialized) buildRangeScene();
    if (bScanVtkInitialized) buildVerticalProfileScene();
    if (longVtkInitialized) buildHorizontalProfileScene();
    if (circVtkInitialized) buildCircScene(true);
}

const tallyPanel = document.getElementById('tallyPanel');
const tallyGridHost = document.getElementById('tallyGrid');
const tallyJointCount = document.getElementById('tallyJointCount');
const tallyTotalLength = document.getElementById('tallyTotalLength');
const tallyFlaggedCount = document.getElementById('tallyFlaggedCount');
const mainWrap = document.querySelector('.main-wrap');
const scanGrid = document.querySelector('.scan-grid');
const plotsRow = document.querySelector('.plots-row');

let tallyGridApi = null;
let lastDockedTableHeight = 312;

// ── True Float Tab — Move table to separate window; Dock brings it back ─────
const FLOAT_CHANNEL = 'pipe-tally-float';
const floatChannel = new BroadcastChannel(FLOAT_CHANNEL);
let tallyFloated = false;
let savedTableDisplay = null;

function applyFloatState(floated) {
    if (floated === tallyFloated) return; // guard: already in that state
    tallyFloated = floated;
    if (floated) {
        // Save display state and hide the table section
        savedTableDisplay = tallyPanel.style.display;
        tallyPanel.style.display = 'none';
        // Hide the splitter too
        const mainSplitter2 = document.getElementById('mainSplitter2');
        if (mainSplitter2) mainSplitter2.style.display = 'none';
        // Immediately redistribute space: scans+plots fill the gap
        updateDashboardLayout();
    } else {
        // Restore table
        tallyPanel.style.display = savedTableDisplay || '';
        tallyPanel.style.removeProperty('display');
        const mainSplitter2 = document.getElementById('mainSplitter2');
        if (mainSplitter2) mainSplitter2.style.removeProperty('display');
        updateDashboardLayout();
    }
}

floatChannel.addEventListener('message', event => {
    const msg = event.data;
    if (!msg) return;
    switch (msg.type) {
        case 'floatReady':
            // Float tab opened — send current data (table already hidden by click)
            broadcastTallyToFloat();
            break;
        case 'pong':
            break;
        case 'selectJoint':
            if (msg.idx >= 0 && tallyRows && msg.idx < tallyRows.length) {
                loadJointScan(msg.idx);
            }
            break;
        case 'dockTally':
            // Dock requested from float tab — show table back
            applyFloatState(false);
            // Tell float tab to close itself
            floatChannel.postMessage({ type: 'closeMe' });
            break;
        case 'floatClosed':
            // Float tab was closed without docking — show table back
            if (tallyFloated) applyFloatState(false);
            break;
    }
});

window.openTallyFloatTab = function openTallyFloatTab() {
    if (tallyFloated) return; // guard: already floated
    // 1. Save data to localStorage so the float tab can grab it instantly
    localStorage.setItem('tallyFloatData', JSON.stringify(tallyRows));
    // 2. Open the tab FIRST so popup blockers don't interfere
    const url = new URL('pages/tally-float.html', window.location.origin + import.meta.env.BASE_URL).href;
    const w = Math.min(1100, window.screen.availWidth - 60);
    const h = Math.min(700, window.screen.availHeight - 60);
    const left = Math.max(0, window.screen.availWidth - w - 30);
    const top = 30;
    const features = `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`;
    const win = window.open(url, 'tallyFloatTab', features);
    // 3. If popup was blocked, don't hide the table
    if (!win || win.closed || typeof win.closed === 'undefined') {
        console.warn('Float tab blocked — check popup settings');
        return;
    }
    // 4. Hide the table immediately — no waiting
    applyFloatState(true);
};

function broadcastTallyToFloat(data) {
    const rows = data || tallyRows;
    localStorage.setItem('tallyFloatData', JSON.stringify(rows));
    floatChannel.postMessage({ type: 'updateData', data: rows });
}

// ── A-Scan Float ─────────────────────────────────────────────────────────────
const ASCAN_FLOAT_CHANNEL = 'aScan-float';
const aScanFloatChannel = new BroadcastChannel(ASCAN_FLOAT_CHANNEL);
let aScanFloated = false;
const aScanPanel = document.getElementById('aScanPanel');

function applyAScanFloatState(floated) {
    aScanFloated = floated;
    if (floated) {
        mainWrap.classList.add('ascan-floated');
    } else {
        mainWrap.classList.remove('ascan-floated');
    }
    // Re-render Range (panel-2) which fills the void
    setTimeout(() => {
        resizeAScanVTK();
        if (rangeVtkInitialized) { buildRangeScene(); drawRangeOverlay(); }
        updateDashboardLayout();
    }, 50);
}

aScanFloatChannel.addEventListener('message', event => {
    const msg = event.data;
    if (!msg) return;
    switch (msg.type) {
        case 'floatReady':
            // Send current A-Scan state to the float tab
            aScanFloatChannel.postMessage({
                type: 'updateState',
                state: {
                    peaks: A_PEAKS,
                    gates: A_GATES,
                    tMin: A_TMIN, tMax: A_TMAX, vMax: A_VMAX,
                    thresholdSolid: aThresholdSolid,
                    thresholdDash: aThresholdDash,
                    cursorT: aCursorT,
                    startGateT: aStartGateT,
                    endGateT: aEndGateT,
                }
            });
            break;
        case 'updateState':
            // Sync state back from float tab interactions
            if (msg.state) {
                aThresholdSolid = msg.state.thresholdSolid;
                aThresholdDash = msg.state.thresholdDash;
                aStartGateT = msg.state.startGateT;
                aEndGateT = msg.state.endGateT;
                if (msg.state.gates) {
                    A_GATES[0][0] = msg.state.gates[0][0];
                    A_GATES[0][1] = msg.state.gates[0][1];
                    A_GATES[1][0] = msg.state.gates[1][0];
                    A_GATES[1][1] = msg.state.gates[1][1];
                }
                aCursorT = msg.state.cursorT;
                resizeAScanVTK();
            }
            break;
        case 'dockAScan':
            applyAScanFloatState(false);
            aScanFloatChannel.postMessage({ type: 'closeMe' });
            break;
        case 'floatClosed':
            if (aScanFloated) applyAScanFloatState(false);
            break;
    }
});

window.openAScanFloatTab = function openAScanFloatTab() {
    applyAScanFloatState(true);
    // Save state to localStorage so float tab can grab it instantly (no race condition)
    localStorage.setItem('aScanFloatState', JSON.stringify({
        peaks: A_PEAKS,
        gates: A_GATES,
        tMin: A_TMIN, tMax: A_TMAX, vMax: A_VMAX,
        thresholdSolid: aThresholdSolid,
        thresholdDash: aThresholdDash,
        cursorT: aCursorT,
        startGateT: aStartGateT,
        endGateT: aEndGateT,
    }));
    const url = new URL('pages/aScan-float.html', window.location.origin + import.meta.env.BASE_URL).href;
    const w = Math.min(900, window.screen.availWidth - 60);
    const h = Math.min(680, window.screen.availHeight - 80);
    const left = Math.max(0, window.screen.availWidth - w - 30);
    const top = 40;
    const features = `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`;
    window.open(url, 'aScanFloatTab', features);
};

const DASHBOARD_PLOT_SHARE = 130 / (729 + 130);
const DASHBOARD_MIN_PLOTS_HEIGHT = 130;
const DASHBOARD_MIN_SCAN_HEIGHT = 420;

function updateTallySummary() {
    const jointCount = tallyRows.length;
    const flaggedCount = tallyRows.filter(row => row.status !== 'ok').length;
    const totalLength = tallyRows.reduce((sum, row) => sum + row.lengthM, 0);
    tallyJointCount.textContent = String(jointCount);
    tallyFlaggedCount.textContent = String(flaggedCount);
    tallyTotalLength.textContent = totalLength.toFixed(2) + ' m';
}

function syncTallyGridLayout() {
    if (!tallyGridApi) return;
    tallyGridApi.sizeColumnsToFit({ defaultMinWidth: 90 });
}

function updateDashboardLayout() {
    if (!mainWrap || !scanGrid || !plotsRow || !tallyPanel) return;

    const wrapHeight = mainWrap.clientHeight;
    const wrapWidth = mainWrap.clientWidth;

    // When floated, table is hidden — allocate all vertical space to scans+plots
    const tableHeight = tallyFloated ? 0 : lastDockedTableHeight;
    const splitterSpace = tallyFloated ? 6 : 12;
    const availableBandsHeight = Math.max(
        DASHBOARD_MIN_SCAN_HEIGHT + DASHBOARD_MIN_PLOTS_HEIGHT,
        wrapHeight - tableHeight - splitterSpace
    );

    if (!tallyFloated) {
        tallyPanel.style.height = tableHeight + 'px';
        tallyPanel.style.flex = 'none';
    } else {
        tallyPanel.style.removeProperty('height');
        tallyPanel.style.removeProperty('flex');
    }

    // Scan Grid vs Plots Row vertical split
    const scanHeight = Math.max(
        DASHBOARD_MIN_SCAN_HEIGHT,
        Math.round(availableBandsHeight * scanGridHeightRatio)
    );
    const plotsHeight = Math.max(
        DASHBOARD_MIN_PLOTS_HEIGHT,
        availableBandsHeight - scanHeight
    );

    scanGrid.style.height = scanHeight + 'px';
    plotsRow.style.height = plotsHeight + 'px';

    // Scan Grid columns (first column, 6px splitter, second column)
    const firstColWidth = Math.max(280, Math.round((wrapWidth - 6) * leftColRatio));
    const secondColWidth = Math.max(320, wrapWidth - 6 - firstColWidth);
    scanGrid.style.gridTemplateColumns = `${firstColWidth}px 6px ${secondColWidth}px`;

    // Scan Grid rows (row1, 6px splitter, row2, 6px splitter, row3)
    const availableScanHeight = scanHeight - 12;
    const r1Height = clamp(Math.round(availableScanHeight * scanRowRatios[0]), 100, availableScanHeight - 200);
    const r2Height = clamp(Math.round(availableScanHeight * scanRowRatios[1]), 100, availableScanHeight - r1Height - 100);
    const r3Height = availableScanHeight - r1Height - r2Height;
    scanGrid.style.gridTemplateRows = `${r1Height}px 6px ${r2Height}px 6px ${r3Height}px`;

    // Plots Row columns (chart1, 6px splitter, chart2, 6px splitter, chart3)
    const availablePlotsWidth = wrapWidth - 12;
    const c1Width = clamp(Math.round(availablePlotsWidth * chartWidthRatios[0]), 150, availablePlotsWidth - 300);
    const c2Width = clamp(Math.round(availablePlotsWidth * chartWidthRatios[1]), 150, availablePlotsWidth - c1Width - 150);
    const c3Width = availablePlotsWidth - c1Width - c2Width;
    plotsRow.style.gridTemplateColumns = `${c1Width}px 6px ${c2Width}px 6px ${c3Width}px`;

    // Call layout helpers to update container dimensions
    layoutCScanContainer();
    layoutRangeContainer();
    layoutBScanVtkContainer();
    layoutLongVtkContainer();
    layoutScatterVtkContainer();
    layoutHistVtkContainer();
    layoutVelocityVtkContainer();

    requestAnimationFrame(() => {
        resizeVTK();
        resizeRangeVTK();
        resizeBScanVTK();
        resizeLongVTK();
        resizeScatterVTK();
        resizeHistVTK();
        resizeVelocityVTK();
        resizeCircVTK();
        syncTallyGridLayout();
    });
}

function initTallyGrid() {
    if (tallyGridApi) return;

    updateTallySummary();

    tallyGridApi = createGrid(tallyGridHost, {
        theme: 'legacy',
        rowData: tallyRows,
        defaultColDef: {
            sortable: true,
            filter: true,
            resizable: true,
            suppressHeaderMenuButton: true,
        },
        columnDefs: [
            { headerName: 'Joint', field: 'joint', pinned: 'left', maxWidth: 96 },
            { headerName: 'Heat No.', field: 'heatNo', minWidth: 116 },
            { headerName: 'O.D. mm', field: 'odMm', valueFormatter: p => p.value.toFixed(1), type: 'numericColumn', maxWidth: 108 },
            { headerName: 'W.T. mm', field: 'wtMm', valueFormatter: p => p.value.toFixed(2), type: 'numericColumn', maxWidth: 108 },
            { headerName: 'Length m', field: 'lengthM', valueFormatter: p => p.value.toFixed(2), type: 'numericColumn', maxWidth: 108 },
            { headerName: 'Grade', field: 'grade', maxWidth: 92 },
            { headerName: 'Min WT mm', field: 'minWtMm', valueFormatter: p => p.value.toFixed(2), type: 'numericColumn', minWidth: 120 },
            { headerName: 'Loss %', field: 'lossPct', valueFormatter: p => p.value.toFixed(1), type: 'numericColumn', maxWidth: 96 },
            { headerName: 'Status', field: 'statusLabel', minWidth: 118, cellClass: 'status-cell' },
        ],
        rowClassRules: {
            'tally-row-ok': params => params.data.status === 'ok',
            'tally-row-warn': params => params.data.status === 'warn',
            'tally-row-flag': params => params.data.status === 'flag',
        },
        animateRows: true,
        enableCellTextSelection: true,
        headerHeight: 30,
        rowHeight: 32,
        rowSelection: 'single',
        onFirstDataRendered: () => syncTallyGridLayout(),
        onRowClicked: params => {
            const idx = tallyRows.indexOf(params.data);
            if (idx >= 0) {
                loadJointScan(idx);
                floatChannel.postMessage({ type: 'selectJoint', idx });
            }
        },
    });
}

// initLayoutResizing is defined below

function initLayoutResizing() {
    function bindDrag(element, onDrag, onStart, onEnd) {
        if (!element) return;
        let isDragging = false;
        
        element.addEventListener('pointerdown', e => {
            isDragging = true;
            element.classList.add('active');
            element.setPointerCapture(e.pointerId);
            if (onStart) onStart(e);
            e.preventDefault();
        });
        
        element.addEventListener('pointermove', e => {
            if (!isDragging) return;
            onDrag(e);
            e.preventDefault();
        });
        
        const stopDrag = e => {
            if (!isDragging) return;
            isDragging = false;
            element.classList.remove('active');
            if (element.hasPointerCapture(e.pointerId)) {
                element.releasePointerCapture(e.pointerId);
            }
            if (onEnd) onEnd(e);
        };
        
        element.addEventListener('pointerup', stopDrag);
        element.addEventListener('pointercancel', stopDrag);
    }

    // 1. Column Splitter in Scan Grid: #scanColSplitter
    bindDrag(document.getElementById('scanColSplitter'), e => {
        const rect = scanGrid.getBoundingClientRect();
        const px = e.clientX - rect.left;
        leftColRatio = clamp(px / rect.width, 0.15, 0.85);
        updateDashboardLayout();
    });

    // 2. Row Splitters in Scan Grid: #scanRowSplitter1, #scanRowSplitter2
    bindDrag(document.getElementById('scanRowSplitter1'), e => {
        const rect = scanGrid.getBoundingClientRect();
        const py = e.clientY - rect.top;
        const availableHeight = rect.height - 12;
        const r1Ratio = clamp(py / availableHeight, 0.15, 0.85);
        const remaining = 1.0 - r1Ratio;
        const sum23 = scanRowRatios[1] + scanRowRatios[2];
        const r2Ratio = (scanRowRatios[1] / sum23) * remaining;
        const r3Ratio = remaining - r2Ratio;
        
        scanRowRatios = [r1Ratio, r2Ratio, r3Ratio];
        updateDashboardLayout();
    });

    bindDrag(document.getElementById('scanRowSplitter2'), e => {
        const rect = scanGrid.getBoundingClientRect();
        const py = e.clientY - rect.top;
        const availableHeight = rect.height - 12;
        const splitRatio = clamp(py / availableHeight, 0.15, 0.85);
        const r1Ratio = scanRowRatios[0];
        const minRatio = 0.1;
        const newR2Ratio = clamp(splitRatio - r1Ratio, minRatio, 1.0 - r1Ratio - minRatio);
        const newR3Ratio = 1.0 - r1Ratio - newR2Ratio;
        
        scanRowRatios = [r1Ratio, newR2Ratio, newR3Ratio];
        updateDashboardLayout();
    });

    // 3. Vertical Main Splitters: #mainSplitter1, #mainSplitter2
    bindDrag(document.getElementById('mainSplitter1'), e => {
        const rect = mainWrap.getBoundingClientRect();
        const py = e.clientY - rect.top;
        const tableHeight = tallyFloated ? 0 : lastDockedTableHeight;
        const splitterSpace = tallyFloated ? 6 : 12;
        const availableBandsHeight = rect.height - tableHeight - splitterSpace;
        
        scanGridHeightRatio = clamp(py / availableBandsHeight, 0.20, 0.90);
        updateDashboardLayout();
    });

    const mainSplitter2 = document.getElementById('mainSplitter2');
    if (mainSplitter2) {
        bindDrag(mainSplitter2, e => {
            const rect = mainWrap.getBoundingClientRect();
            const py = e.clientY - rect.top;
            const totalHeight = rect.height;
            const newTableHeight = clamp(totalHeight - py - 6, 80, totalHeight - 300);
            lastDockedTableHeight = newTableHeight;
            updateDashboardLayout();
        });
    }

    // 4. Horizontal Chart Splitters: #plotsSplitter1, #plotsSplitter2
    bindDrag(document.getElementById('plotsSplitter1'), e => {
        const rect = plotsRow.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const availableWidth = rect.width - 12;
        const c1Ratio = clamp(px / availableWidth, 0.15, 0.85);
        const remaining = 1.0 - c1Ratio;
        const sum23 = chartWidthRatios[1] + chartWidthRatios[2];
        const c2Ratio = (chartWidthRatios[1] / sum23) * remaining;
        const c3Ratio = remaining - c2Ratio;
        
        chartWidthRatios = [c1Ratio, c2Ratio, c3Ratio];
        updateDashboardLayout();
    });

    bindDrag(document.getElementById('plotsSplitter2'), e => {
        const rect = plotsRow.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const availableWidth = rect.width - 12;
        const splitRatio = clamp(px / availableWidth, 0.15, 0.85);
        const c1Ratio = chartWidthRatios[0];
        const minRatio = 0.1;
        const newC2Ratio = clamp(splitRatio - c1Ratio, minRatio, 1.0 - c1Ratio - minRatio);
        const newC3Ratio = 1.0 - c1Ratio - newC2Ratio;
        
        chartWidthRatios = [c1Ratio, newC2Ratio, newC3Ratio];
        updateDashboardLayout();
    });
}

// ── Digsheet Modal ───────────────────────────────────────────────────────────
function openDigsheet() { document.getElementById('digsheetModal').classList.add('show'); }
function closeDigsheet() { document.getElementById('digsheetModal').classList.remove('show'); }
function generateDigsheet() {
    closeDigsheet();
    const fmt = document.querySelector('input[name="fmt"]:checked')?.value || 'pdf';
    showToast('✅', 'Digsheet exported', 'POF-2021-07_digsheet.' + fmt);
}
function showToast(icon, text, sub) {
    const t = document.getElementById('toast');
    document.getElementById('toastIcon').textContent = icon;
    document.getElementById('toastText').textContent = text;
    document.getElementById('toastSub').textContent = sub;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3500);
}
window.openDigsheet = openDigsheet;
window.closeDigsheet = closeDigsheet;
window.generateDigsheet = generateDigsheet;

// Defect locations for 3D pipe scene — synced with defs on joint load
let DEFECTS = [
    { cx: .30, cy: .40, label: 'DEF-01', severity: 0.82, col: '#f43f5e', w: 0.14, h: 0.12 },
    { cx: .70, cy: .65, label: 'DEF-02', severity: 0.68, col: '#f59e0b', w: 0.10, h: 0.09 },
];

function buildPipeScene() {
    if (!dataMap) return;

    vtkRendererInstance.removeAllActors();
    vtkSceneMode = 'pipe';

    // ── 1. Main pipe surface ──────────────────────────────────────────────────
    const nAxial = 180;
    const nCirc = 90;
    const pipeLen = 10;
    const baseRadius = 2.0;
    const indentScale = 0.3;

    const x0 = zoom.x0 * DATA_W, x1 = zoom.x1 * DATA_W;
    const y0 = zoom.y0 * DATA_H, y1 = zoom.y1 * DATA_H;

    const totalPts = nAxial * nCirc;
    const positions = new Float64Array(totalPts * 3);
    const scalars = new Float32Array(totalPts);
    const normals = new Float32Array(totalPts * 3);

    for (let ia = 0; ia < nAxial; ia++) {
        const t = ia / (nAxial - 1);
        const dx = clamp(Math.floor(x0 + t * (x1 - x0)), 0, DATA_W - 1);
        const z = (t - 0.5) * pipeLen;

        for (let ic = 0; ic < nCirc; ic++) {
            const theta = (ic / nCirc) * PI2;
            const dy = clamp(Math.floor(y0 + (ic / nCirc) * (y1 - y0)), 0, DATA_H - 1);
            const v = dataMap[dy][dx];
            const wallLoss = v * 0.85;
            const r = baseRadius - wallLoss * indentScale;

            const idx = (ia * nCirc + ic) * 3;
            const ct = Math.cos(theta), st = Math.sin(theta);
            positions[idx] = r * ct;
            positions[idx + 1] = r * st;
            positions[idx + 2] = z;

            normals[idx] = ct;
            normals[idx + 1] = st;
            normals[idx + 2] = 0;

            const sidx = ia * nCirc + ic;
            scalars[sidx] = v;
        }
    }

    // Geometry depression at defect locations
    const defRadius = 0.075;
    DEFECTS.forEach(d => {
        const cxData = x0 + d.cx * (x1 - x0);
        const cyData = y0 + d.cy * (y1 - y0);
        const dataSpan = Math.max(x1 - x0, y1 - y0);
        for (let ia = 0; ia < nAxial; ia++) {
            const t = ia / (nAxial - 1);
            const dxVal = x0 + t * (x1 - x0);
            const aDist = (dxVal - cxData) / dataSpan;
            if (Math.abs(aDist) > defRadius) continue;
            for (let ic = 0; ic < nCirc; ic++) {
                const dyVal = y0 + (ic / nCirc) * (y1 - y0);
                const cDist = (dyVal - cyData) / dataSpan;
                const dist = Math.sqrt(aDist * aDist + cDist * cDist);
                if (dist < defRadius) {
                    const w = Math.exp(-dist * dist * 100);
                    const idx = (ia * nCirc + ic) * 3;
                    positions[idx] *= (1 - w * 0.35);
                    positions[idx + 1] *= (1 - w * 0.35);
                }
            }
        }
    });

    const cells = [];
    for (let ia = 0; ia < nAxial - 1; ia++) {
        for (let ic = 0; ic < nCirc; ic++) {
            const ic_next = (ic + 1) % nCirc;
            const i0 = ia * nCirc + ic;
            const i1 = ia * nCirc + ic_next;
            const i2 = (ia + 1) * nCirc + ic;
            const i3 = (ia + 1) * nCirc + ic_next;
            cells.push(3, i0, i1, i2);
            cells.push(3, i1, i3, i2);
        }
    }

    const polyData = vtkPolyData.newInstance();
    const ptsObj = vtkPoints.newInstance();
    ptsObj.setData(positions, 3);
    polyData.setPoints(ptsObj);
    const cellArray = vtkCellArray.newInstance();
    cellArray.setData(new Uint32Array(cells));
    polyData.setPolys(cellArray);
    const scalarsDA = vtkDataArray.newInstance({ name: 'wallLoss', values: scalars, numberOfComponents: 1 });
    polyData.getPointData().addArray(scalarsDA);
    const normalsDA = vtkDataArray.newInstance({ name: 'Normals', values: normals, numberOfComponents: 3 });
    polyData.getPointData().addArray(normalsDA);

    // Build RGB color array: use heatRGB for background, brand colors for defects
    const colors = new Uint8Array(totalPts * 3);
    const defBrand = {
        'DEF-01': { sev: 0.82, rgb: [0xf4, 0x3f, 0x5e] },
        'DEF-02': { sev: 0.68, rgb: [0xf5, 0x9e, 0x0b] },
    };
    const innerR = 0.035, outerR = defRadius;
    const dataSpan = Math.max(x1 - x0, y1 - y0);
    const cxData = {}, cyData = {};
    DEFECTS.forEach(d => {
        cxData[d.label] = x0 + d.cx * (x1 - x0);
        cyData[d.label] = y0 + d.cy * (y1 - y0);
    });
    for (let ia = 0; ia < nAxial; ia++) {
        const t = ia / (nAxial - 1);
        const dxVal = x0 + t * (x1 - x0);
        for (let ic = 0; ic < nCirc; ic++) {
            const sidx = ia * nCirc + ic;
            const baseRGB = heatRGB(scalars[sidx], cScanColorRange.min, cScanColorRange.max);
            let useBrand = null, brandBlend = 0;
            for (const d of DEFECTS) {
                const aDist = (dxVal - cxData[d.label]) / dataSpan;
                const dyVal = y0 + (ic / nCirc) * (y1 - y0);
                const cDist = (dyVal - cyData[d.label]) / dataSpan;
                const dist = Math.sqrt(aDist * aDist + cDist * cDist);
                if (dist < innerR) { useBrand = d.label; brandBlend = 1; break; }
                if (dist < outerR) {
                    const b = 1 - (dist - innerR) / (outerR - innerR);
                    if (b > brandBlend) { useBrand = d.label; brandBlend = b; }
                }
            }
            if (useBrand) {
                const b = defBrand[useBrand];
                colors[sidx * 3] = Math.round(baseRGB[0] * (1 - brandBlend) + b.rgb[0] * brandBlend);
                colors[sidx * 3 + 1] = Math.round(baseRGB[1] * (1 - brandBlend) + b.rgb[1] * brandBlend);
                colors[sidx * 3 + 2] = Math.round(baseRGB[2] * (1 - brandBlend) + b.rgb[2] * brandBlend);
            } else {
                colors[sidx * 3] = baseRGB[0];
                colors[sidx * 3 + 1] = baseRGB[1];
                colors[sidx * 3 + 2] = baseRGB[2];
            }
        }
    }

    const colorsDA = vtkDataArray.newInstance({ name: 'colors', values: colors, numberOfComponents: 3 });
    polyData.getPointData().addArray(colorsDA);
    polyData.getPointData().setActiveScalars('colors');

    const vtkPipeMapper = vtkMapper.newInstance();
    vtkPipeMapper.setInputData(polyData);
    vtkPipeMapper.setScalarVisibility(true);
    vtkPipeMapper.setColorModeToDirectScalars();
    vtkPipeMapper.setColorByArrayName('colors');
    vtkPipeMapper.setScalarModeToUsePointData();

    const vtkPipeActor = vtkActor.newInstance();
    vtkPipeActor.setMapper(vtkPipeMapper);
    vtkPipeActor.getProperty().setInterpolationToPhong();
    vtkPipeActor.getProperty().setSpecular(0.5);
    vtkPipeActor.getProperty().setSpecularPower(35);
    vtkPipeActor.getProperty().setDiffuse(0.7);
    vtkPipeActor.getProperty().setAmbient(0.3);
    vtkPipeActor.getProperty().setEdgeVisibility(false);
    vtkRendererInstance.addActor(vtkPipeActor);

    // ── 2. End caps ──────────────────────────────────────────────────────────
    function addEndCap(zPos, reversed) {
        const capRes = 48;
        const capPts = new Float64Array((capRes + 1) * 3);
        for (let i = 0; i <= capRes; i++) {
            const theta = (i / capRes) * PI2;
            capPts[i * 3] = baseRadius * Math.cos(theta);
            capPts[i * 3 + 1] = baseRadius * Math.sin(theta);
            capPts[i * 3 + 2] = zPos;
        }
        const capPoly = vtkPolyData.newInstance();
        const capPtsObj = vtkPoints.newInstance();
        capPtsObj.setData(capPts, 3);
        capPoly.setPoints(capPtsObj);
        const capCells = vtkCellArray.newInstance();
        const capCellArr = [];
        for (let i = 0; i < capRes; i++) {
            if (reversed) {
                capCellArr.push(3, capRes, (i + 1) % capRes, i);
            } else {
                capCellArr.push(3, capRes, i, (i + 1) % capRes);
            }
        }
        capCells.setData(new Uint32Array(capCellArr));
        capPoly.setPolys(capCells);
        const capMapper = vtkMapper.newInstance();
        capMapper.setInputData(capPoly);
        const capActor = vtkActor.newInstance();
        capActor.setMapper(capMapper);
        capActor.getProperty().setColor(0.04, 0.08, 0.2);
        capActor.getProperty().setInterpolationToPhong();
        capActor.getProperty().setSpecular(0.4);
        capActor.getProperty().setSpecularPower(30);
        capActor.getProperty().setDiffuse(0.7);
        capActor.getProperty().setAmbient(0.3);
        vtkRendererInstance.addActor(capActor);
    }
    addEndCap(-pipeLen / 2, false);
    addEndCap(pipeLen / 2, true);

    // ── 3. Ground grid ────────────────────────────────────────────────────────
    const gridRes = 20;
    const gridExt = pipeLen * 0.75;
    const gridY = -(baseRadius + 0.3);
    const gridPts = new Float64Array((gridRes * 2 + gridRes * 2) * 3);
    let gi = 0;
    for (let i = 0; i <= gridRes; i++) {
        const t = -gridExt + (i / gridRes) * 2 * gridExt;
        gridPts[gi * 3] = t; gridPts[gi * 3 + 1] = gridY; gridPts[gi * 3 + 2] = -gridExt; gi++;
        gridPts[gi * 3] = t; gridPts[gi * 3 + 1] = gridY; gridPts[gi * 3 + 2] = gridExt; gi++;
    }
    for (let i = 0; i <= gridRes; i++) {
        const t = -gridExt + (i / gridRes) * 2 * gridExt;
        gridPts[gi * 3] = -gridExt; gridPts[gi * 3 + 1] = gridY; gridPts[gi * 3 + 2] = t; gi++;
        gridPts[gi * 3] = gridExt; gridPts[gi * 3 + 1] = gridY; gridPts[gi * 3 + 2] = t; gi++;
    }
    const gridPoly = vtkPolyData.newInstance();
    const gridPtsObj = vtkPoints.newInstance();
    gridPtsObj.setData(gridPts, 3);
    gridPoly.setPoints(gridPtsObj);
    const gridCell = vtkCellArray.newInstance();
    const gridIdx = [];
    const totalLines = (gridRes + 1) * 2 + (gridRes + 1) * 2;
    for (let i = 0; i < totalLines; i++) gridIdx.push(2, i * 2, i * 2 + 1);
    gridCell.setData(new Uint32Array(gridIdx));
    gridPoly.setLines(gridCell);
    const gridMapper = vtkMapper.newInstance();
    gridMapper.setInputData(gridPoly);
    const gridActor = vtkActor.newInstance();
    gridActor.setMapper(gridMapper);
    gridActor.getProperty().setColor(0.15, 0.25, 0.4);
    gridActor.getProperty().setOpacity(0.35);
    gridActor.getProperty().setLineWidth(0.5);
    vtkRendererInstance.addActor(gridActor);

    vtkPipeBuilt = true;
    vtkRendererInstance.resetCamera();
    const cam = vtkRendererInstance.getActiveCamera();
    cam.setPosition(8, 6, 9);
    cam.setFocalPoint(0, 0, 0);
    cam.setViewUp(0, 0, 1);
    cam.setParallelProjection(false);
    cam.setClippingRange(0.1, 100);
    vtkRenderWindowInstance.render();
}

function update3DPipe() {
    if (!vtkInitialized) return;
    buildPipeScene();
    vtkPipeBuilt = true;
    if (vtkRenderWindowInstance) {
        const { width, height } = vtkContainer.getBoundingClientRect();
        if (width > 0 && height > 0) {
            vtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
        }
        vtkRenderWindowInstance.render();
    }
}

function updateHeatmap() {
    if (!vtkInitialized) return;
    buildHeatmapScene();
    vtkHeatmapBuilt = true;
    if (vtkRenderWindowInstance) {
        const { width, height } = vtkContainer.getBoundingClientRect();
        if (width > 0 && height > 0) {
            vtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
        }
        vtkRenderWindowInstance.render();
    }
}

function resizeVTK() {
    if (!vtkOpenGLWindow) return;
    layoutCScanContainer();
    const { width, height } = vtkContainer.getBoundingClientRect();
    if (width > 0 && height > 0) {
        vtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
        vtkRenderWindowInstance.render();
    }
}

// ── Reference / FEA-Style 3D Pipe Scene ─────────────────────────────────────
let vtkReferenceActors = [];

function buildReferencePipeScene() {
    if (!dataMap) return;

    // Clear ALL previous actors from renderer
    vtkRendererInstance.removeAllActors();
    vtkReferenceActors = [];
    vtkSceneMode = 'reference';
    // White/light engineering background
    vtkRendererInstance.setBackground(1.0, 1.0, 1.0, 1.0);

    // Replace lights with pure white engineering lighting for proper scalar color rendering
    vtkRendererInstance.removeAllLights();
    const engLight1 = vtkLight.newInstance();
    engLight1.setPosition(-5, 8, 10);
    engLight1.setIntensity(0.8);
    engLight1.setColor(1, 1, 1);
    vtkRendererInstance.addLight(engLight1);

    const engLight2 = vtkLight.newInstance();
    engLight2.setPosition(6, -4, -6);
    engLight2.setIntensity(0.4);
    engLight2.setColor(1, 1, 1);
    vtkRendererInstance.addLight(engLight2);

    const engLight3 = vtkLight.newInstance();
    engLight3.setPosition(0, 0, 14);
    engLight3.setIntensity(0.25);
    engLight3.setColor(1, 1, 1);
    vtkRendererInstance.addLight(engLight3);

    const x0 = zoom.x0 * DATA_W, x1 = zoom.x1 * DATA_W;
    const y0 = zoom.y0 * DATA_H, y1 = zoom.y1 * DATA_H;

    // ── Geometry parameters ────────────────────────────────────────────────
    const pipeLen = 10;
    const R_outer = 2.0;
    const wallThk = 0.45;
    const R_inner = R_outer - wallThk;

    const nAxial = 120;
    const nCirc = 90;   // full 360° resolution

    // Helper to build quad cells for a grid (nU-1 × nV-1 quads → 2 tris each)
    function buildGridCells(nU, nV) {
        const cells = [];
        for (let iu = 0; iu < nU - 1; iu++) {
            for (let iv = 0; iv < nV - 1; iv++) {
                const i0 = iu * nV + iv;
                const i1 = iu * nV + iv + 1;
                const i2 = (iu + 1) * nV + iv;
                const i3 = (iu + 1) * nV + iv + 1;
                cells.push(3, i0, i1, i2);
                cells.push(3, i1, i3, i2);
            }
        }
        return cells;
    }

    // Create a scalar-colored surface actor — use interpolated color mapped via lookup table
    function makeScalarActor(positions, scalars, cells) {
        const totalPts = positions.length / 3;
        const pd = vtkPolyData.newInstance();
        const pts = vtkPoints.newInstance();
        pts.setData(positions, 3);
        pd.setPoints(pts);
        const ca = vtkCellArray.newInstance();
        ca.setData(new Uint32Array(cells));
        pd.setPolys(ca);

        const sDA = vtkDataArray.newInstance({ name: 'wallLoss', values: scalars, numberOfComponents: 1 });
        pd.getPointData().setScalars(sDA);

        const mapper = vtkMapper.newInstance();
        mapper.setInputData(pd);
        mapper.setLookupTable(buildActiveCTF());
        mapper.setScalarVisibility(true);
        mapper.setColorByArrayName('wallLoss');
        mapper.setScalarRange(cScanColorRange.min, cScanColorRange.max);
        mapper.setUseLookupTableScalarRange(true);
        mapper.setScalarModeToUsePointData();

        const actor = vtkActor.newInstance();
        actor.setMapper(mapper);
        return actor;
    }

    // ── 1. Outer Wall Surface (full 360°) ────────────────────────────────
    const outerTotal = nAxial * nCirc;
    const outerPos = new Float64Array(outerTotal * 3);
    const outerScal = new Float32Array(outerTotal);

    for (let ia = 0; ia < nAxial; ia++) {
        const t = ia / (nAxial - 1);
        const z = (t - 0.5) * pipeLen;
        const dx = clamp(Math.floor(x0 + t * (x1 - x0)), 0, DATA_W - 1);
        for (let ic = 0; ic < nCirc; ic++) {
            const theta = (ic / nCirc) * PI2;
            const dy = clamp(Math.floor(y0 + (ic / nCirc) * (y1 - y0)), 0, DATA_H - 1);
            const v = dataMap[dy][dx];
            const idx = (ia * nCirc + ic) * 3;
            outerPos[idx] = R_outer * Math.cos(theta);
            outerPos[idx + 1] = R_outer * Math.sin(theta);
            outerPos[idx + 2] = z;
            outerScal[ia * nCirc + ic] = v;
        }
    }
    const outerCells = buildGridCells(nAxial, nCirc);
    const outerActor = makeScalarActor(outerPos, outerScal, outerCells);
    outerActor.getProperty().setInterpolationToPhong();
    outerActor.getProperty().setSpecular(0.08);
    outerActor.getProperty().setSpecularPower(15);
    outerActor.getProperty().setDiffuse(0.45);
    outerActor.getProperty().setAmbient(0.6);
    outerActor.getProperty().setEdgeVisibility(true);
    outerActor.getProperty().setEdgeColor(0.3, 0.3, 0.35);
    outerActor.getProperty().setLineWidth(0.4);
    vtkRendererInstance.addActor(outerActor);
    vtkReferenceActors.push(outerActor);

    // ── 2. Inner Wall Surface (full 360°) ────────────────────────────────
    const innerTotal = nAxial * nCirc;
    const innerPos = new Float64Array(innerTotal * 3);
    const innerScal = new Float32Array(innerTotal);

    for (let ia = 0; ia < nAxial; ia++) {
        const t = ia / (nAxial - 1);
        const z = (t - 0.5) * pipeLen;
        const dx = clamp(Math.floor(x0 + t * (x1 - x0)), 0, DATA_W - 1);
        for (let ic = 0; ic < nCirc; ic++) {
            const theta = (ic / nCirc) * PI2;
            const dy = clamp(Math.floor(y0 + (ic / nCirc) * (y1 - y0)), 0, DATA_H - 1);
            const v = dataMap[dy][dx];
            const idx = (ia * nCirc + ic) * 3;
            innerPos[idx] = R_inner * Math.cos(theta);
            innerPos[idx + 1] = R_inner * Math.sin(theta);
            innerPos[idx + 2] = z;
            innerScal[ia * nCirc + ic] = v * 0.6;
        }
    }
    const innerCells = buildGridCells(nAxial, nCirc);
    const innerActor = makeScalarActor(innerPos, innerScal, innerCells);
    innerActor.getProperty().setInterpolationToPhong();
    innerActor.getProperty().setSpecular(0.05);
    innerActor.getProperty().setSpecularPower(10);
    innerActor.getProperty().setDiffuse(0.4);
    innerActor.getProperty().setAmbient(0.6);
    innerActor.getProperty().setEdgeVisibility(true);
    innerActor.getProperty().setEdgeColor(0.25, 0.25, 0.3);
    innerActor.getProperty().setLineWidth(0.3);
    vtkRendererInstance.addActor(innerActor);
    vtkReferenceActors.push(innerActor);

    // ── 3. Axis Triad ────────────────────────────────────────────────────
    function buildAxisLine(from, to, color) {
        const pts = vtkPoints.newInstance();
        pts.setData(new Float64Array([from[0], from[1], from[2], to[0], to[1], to[2]]), 3);
        const pd = vtkPolyData.newInstance();
        pd.setPoints(pts);
        const ca = vtkCellArray.newInstance();
        ca.setData(new Uint32Array([2, 0, 1]));
        pd.setLines(ca);
        const mapper = vtkMapper.newInstance();
        mapper.setInputData(pd);
        mapper.setScalarVisibility(false);
        const actor = vtkActor.newInstance();
        actor.setMapper(mapper);
        actor.getProperty().setColor(...color);
        actor.getProperty().setLineWidth(2.5);
        return actor;
    }

    const triadOrigin = [-pipeLen / 2 - 0.6, -R_outer - 0.6, -pipeLen / 2 - 0.6];
    const triadLen = 0.8;
    const axisActors = [
        buildAxisLine(triadOrigin, [triadOrigin[0] + triadLen, triadOrigin[1], triadOrigin[2]], [0.8, 0.15, 0.15]),
        buildAxisLine(triadOrigin, [triadOrigin[0], triadOrigin[1] + triadLen, triadOrigin[2]], [0.15, 0.8, 0.15]),
        buildAxisLine(triadOrigin, [triadOrigin[0], triadOrigin[1], triadOrigin[2] + triadLen], [0.2, 0.35, 0.9]),
    ];
    axisActors.forEach(a => { vtkRendererInstance.addActor(a); vtkReferenceActors.push(a); });

    // ── 4. Subtle ground reference ring ──────────────────────────────────
    const ringPts = new Float64Array(49 * 3);
    const ringRad = R_outer + 0.15;
    const ringY = -R_outer - 0.15;
    for (let i = 0; i < 49; i++) {
        const theta = (i / 48) * PI2;
        ringPts[i * 3] = ringRad * Math.cos(theta);
        ringPts[i * 3 + 1] = ringY;
        ringPts[i * 3 + 2] = ringRad * Math.sin(theta);
    }
    const ringPd = vtkPolyData.newInstance();
    const ringPtsObj = vtkPoints.newInstance();
    ringPtsObj.setData(ringPts, 3);
    ringPd.setPoints(ringPtsObj);
    const ringCell = vtkCellArray.newInstance();
    const ringIdx = [];
    for (let i = 0; i < 48; i++) ringIdx.push(2, i, (i + 1) % 48);
    ringCell.setData(new Uint32Array(ringIdx));
    ringPd.setLines(ringCell);
    const ringMapper = vtkMapper.newInstance();
    ringMapper.setInputData(ringPd);
    ringMapper.setScalarVisibility(false);
    const ringActor = vtkActor.newInstance();
    ringActor.setMapper(ringMapper);
    ringActor.getProperty().setColor(0.4, 0.4, 0.5);
    ringActor.getProperty().setOpacity(0.3);
    ringActor.getProperty().setLineWidth(0.5);
    vtkRendererInstance.addActor(ringActor);
    vtkReferenceActors.push(ringActor);

    // ── Camera ──────────────────────────────────────────────────────────
    vtkRendererInstance.resetCamera();
    const cam = vtkRendererInstance.getActiveCamera();
    cam.setPosition(7, 5, 8);
    cam.setFocalPoint(0, 0, 0);
    cam.setViewUp(0, 0, 1);
    cam.setParallelProjection(false);
    cam.setClippingRange(0.1, 100);
    vtkRenderWindowInstance.render();
}

function updateReferencePipe() {
    if (!vtkInitialized) return;
    buildReferencePipeScene();
    if (vtkRenderWindowInstance) {
        const { width, height } = vtkContainer.getBoundingClientRect();
        if (width > 0 && height > 0) {
            vtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
        }
        vtkRenderWindowInstance.render();
    }
}

// ── 3D Toggle ────────────────────────────────────────────────────────────────
window.toggle3D = function toggle3D() {
    view3D = !view3D;
    const btn = document.getElementById('btn3D');
    btn.classList.toggle('active', view3D);
    btn.innerHTML = view3D
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> 2D View'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> 3D View';

    // Toggle 2D panel visibility — hide all panels in 3D mode, show in 2D mode
    const mainWrap = document.querySelector('.main-wrap');
    if (mainWrap) mainWrap.classList.toggle('view3d-mode', view3D);

    if (view3D) {
        hideCScanColorPopover();
        cTip.style.opacity = '0';
        // Clear 2D overlay canvas elements
        const cOverlayEl = document.getElementById('cScanOverlay');
        if (cOverlayEl) {
            const ctx = cOverlayEl.getContext('2d');
            ctx.clearRect(0, 0, cOverlayEl.width, cOverlayEl.height);
        }
        if (!vtkInitialized) initVTK();
        if (vtkInteractorInstance) vtkInteractorInstance.setEnabled(true);
        updateReferencePipe();
        requestAnimationFrame(() => resizeVTK());
    } else {
        if (!vtkInitialized) initVTK();
        if (vtkInteractorInstance) vtkInteractorInstance.setEnabled(false);
        updateHeatmap();
    }
}

// ── Animation Loop ───────────────────────────────────────────────────────────
function loop() {
    frame++;
    if (frame % 4 === 0) updateAScanVTK();
    if (frame % 2 === 0) {
        if (!view3D) drawCScanOverlay();
        updateVerticalProfileVTK();
        updateHorizontalProfileVTK();
        drawVerticalProfile();
        drawHorizontalProfile();
        drawRangeOverlay();
    }
    if (frame % 3 === 0) { drawCirc(); if (circVtkInitialized) buildCircScene(); }
    if (frame % 12 === 0) { drawScatterERF(); drawHistogram(); drawVelocity(); }
    if (frame % 15 === 0 && vtkOpenGLWindow) {
        const { width, height } = vtkContainer.getBoundingClientRect();
        const [curW, curH] = vtkOpenGLWindow.getSize();
        if (Math.round(width) !== curW || Math.round(height) !== curH) {
            vtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
            vtkRenderWindowInstance.render();
        }
    }
    if (frame % 15 === 0 && rangeVtkOpenGLWindow) {
        const { width, height } = rangeVtkContainer.getBoundingClientRect();
        const [curW, curH] = rangeVtkOpenGLWindow.getSize();
        if (Math.round(width) !== curW || Math.round(height) !== curH) {
            rangeVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
            rangeVtkRenderWindow.render();
        }
    }
    if (frame % 15 === 0 && bScanVtkOpenGLWindow) {
        const { width, height } = bScanVtkContainer.getBoundingClientRect();
        const [curW, curH] = bScanVtkOpenGLWindow.getSize();
        if (Math.round(width) !== curW || Math.round(height) !== curH) {
            bScanVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
            bScanVtkRenderWindow.render();
        }
    }
    if (frame % 15 === 0 && longVtkOpenGLWindow) {
        const { width, height } = longVtkContainer.getBoundingClientRect();
        const [curW, curH] = longVtkOpenGLWindow.getSize();
        if (Math.round(width) !== curW || Math.round(height) !== curH) {
            longVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
            longVtkRenderWindow.render();
        }
    }
    if (frame % 15 === 0 && circVtkOpenGLWindow) {
        const { width, height } = circVtkContainer.getBoundingClientRect();
        const [curW, curH] = circVtkOpenGLWindow.getSize();
        if (Math.round(width) !== curW || Math.round(height) !== curH) {
            circVtkOpenGLWindow.setSize(Math.round(width), Math.round(height));
            circVtkRenderWindow.render();
        }
    }
    requestAnimationFrame(loop);
}

// ── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
    buildDataMap();
    buildJointBlobs();
    initLayoutResizing();
    updateDashboardLayout();   // establish pixel layout BEFORE any vtk init
    initVTK();
    initScatterVTK();
    initHistVTK();
    initVelocityVTK();
    initTallyGrid();
    window.setTimeout(() => initAScanVTK(), 60);
    window.setTimeout(() => initRangeVTK(), 100);
    window.setTimeout(() => initBScanVTK(), 120);
    window.setTimeout(() => initLongVTK(), 140);
    window.setTimeout(() => initCircVTK(), 160);
    // deferred full-resize to catch any panel that initialised before layout settled
    window.setTimeout(() => {
        resizeVTK();
        resizeAScanVTK();
        resizeRangeVTK();
        resizeBScanVTK();
        resizeLongVTK();
        resizeScatterVTK();
        resizeHistVTK();
        resizeVelocityVTK();
        resizeCircVTK();
    }, 250);
    drawScatterERF();
    drawHistogram();
    drawVelocity();
    loop();
});

window.addEventListener('resize', () => {
    updateDashboardLayout();
    resizeVTK();
    resizeAScanVTK();
    resizeRangeVTK();
    resizeBScanVTK();
    resizeLongVTK();
    resizeScatterVTK();
    resizeHistVTK();
    resizeVelocityVTK();
    resizeCircVTK();
});

console.log('C-Scan & Pipe Tally Suite — vtk.js Enhanced');
