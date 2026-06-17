import '@kitware/vtk.js';
import { buildCTF, heatColor, heatRGB } from '../src/vtk-shared.js';

const vtk = window.vtk;

const vtkRenderer = vtk.Rendering.Core.vtkRenderer;
const vtkRenderWindow = vtk.Rendering.Core.vtkRenderWindow;
const vtkOpenGLRenderWindow = vtk.Rendering.OpenGL.vtkRenderWindow;
const vtkActor = vtk.Rendering.Core.vtkActor;
const vtkMapper = vtk.Rendering.Core.vtkMapper;
const vtkPolyData = vtk.Common.DataModel.vtkPolyData;
const vtkPoints = vtk.Common.Core.vtkPoints;
const vtkCellArray = vtk.Common.Core.vtkCellArray;
const vtkDataArray = vtk.Common.Core.vtkDataArray;
const vtkColorTransferFunction = vtk.Rendering.Core.vtkColorTransferFunction;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const CHART_AXIS_INSET = 36;
const CHART_Y_TICK_X = 6;
const CHART_X_TICK_Y = 12;
const CHART_X_AXIS_TITLE_OFFSET = 6;

// ── State kept in-sync via BroadcastChannel ──
let state = {
    peaks: [],
    gates: [[126.0, 128.5], [128.5, 131.2]],
    tMin: 121, tMax: 145, vMax: 880,
    thresholdSolid: 100,
    thresholdDash: 50,
    cursorT: 136.0,
    startGateT: 124.0,
    endGateT: 137.0,
};

let vtkRendererInst = null;
let vtkRenderWindowInst = null;
let vtkOpenGLWindowInst = null;
let vtkInitialized = false;
let lastAspect = -1;

const floatOverlay = document.getElementById('floatOverlay');
const fOX = floatOverlay.getContext('2d');
const floatVtkContainer = document.getElementById('floatVtkContainer');
const floatDockBtn = document.getElementById('floatDockBtn');
const floatThreshDisplay = document.getElementById('floatThreshDisplay');
const floatStatusMsg = document.getElementById('floatStatusMsg');

const FLOAT_CHANNEL = 'aScan-float';
const channel = new BroadcastChannel(FLOAT_CHANNEL);

function getPad() {
    return { l: CHART_AXIS_INSET, r: 8, t: 28, b: CHART_AXIS_INSET };
}

function layoutContainer() {
    const panelBody = floatVtkContainer.parentElement;
    const pad = getPad();
    floatVtkContainer.style.left = `${pad.l}px`;
    floatVtkContainer.style.top = `${pad.t}px`;
    floatVtkContainer.style.width = `${Math.max(1, panelBody.clientWidth - pad.l - pad.r)}px`;
    floatVtkContainer.style.height = `${Math.max(1, panelBody.clientHeight - pad.t - pad.b)}px`;
}

function makeLines(coords, rgb, lineWidth, opacity = 1) {
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

function makeQuad(x0, x1, y0, y1, rgb, opacity) {
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

function makePoints(coords, rgb, pointSize) {
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

function toWX(t, worldW, hwW) { return (t - state.tMin) / (state.tMax - state.tMin) * worldW - hwW; }
function toWY(v, worldH, hwH) { return v / state.vMax * worldH - hwH; }

function buildScene() {
    if (!vtkOpenGLWindowInst) return;
    layoutContainer();
    const { width, height } = floatVtkContainer.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;

    const aspect = width / height;
    const worldH = 8.0;
    const worldW = worldH * aspect;
    const hwH = worldH / 2, hwW = worldW / 2;
    const _toWX = t => toWX(t, worldW, hwW);
    const _toWY = v => toWY(v, worldH, hwH);
    const y0W = _toWY(0);

    vtkRendererInst.removeAllActors();

    // Fine grid
    const fineGrid = [];
    for (let t = state.tMin; t <= state.tMax; t += 0.5) {
        const x = _toWX(t); fineGrid.push(x, -hwH, 0, x, hwH, 0);
    }
    for (let v = 0; v <= state.vMax; v += 20) {
        const y = _toWY(v); fineGrid.push(-hwW, y, 0, hwW, y, 0);
    }
    vtkRendererInst.addActor(makeLines(fineGrid, [0.12, 0.20, 0.32], 0.4, 0.45));

    // Coarse grid
    const coarseGrid = [];
    for (let t = state.tMin; t <= state.tMax; t += 1) {
        const x = _toWX(t); coarseGrid.push(x, -hwH, 0, x, hwH, 0);
    }
    for (let v = 0; v <= state.vMax; v += 80) {
        const y = _toWY(v); coarseGrid.push(-hwW, y, 0, hwW, y, 0);
    }
    vtkRendererInst.addActor(makeLines(coarseGrid, [0.20, 0.31, 0.47], 0.5, 0.70));

    // Gate fills
    const gateColors = [
        { rgb: [130/255, 210/255, 230/255], opacity: 0.18 },
        { rgb: [250/255, 200/255, 100/255], opacity: 0.15 },
    ];
    state.gates.forEach(([t0, t1], i) => {
        const gx0 = _toWX(t0), gx1 = _toWX(t1);
        vtkRendererInst.addActor(makeQuad(gx0, gx1, -hwH, hwH, gateColors[i].rgb, gateColors[i].opacity));
        vtkRendererInst.addActor(makeLines(
            [gx0, -hwH, 0, gx0, hwH, 0, gx1, -hwH, 0, gx1, hwH, 0],
            gateColors[i].rgb, 0.8, 0.7
        ));
    });

    // Solid threshold (PW1: Start Gate → Gate A right)
    const tSolidL = _toWX(state.startGateT);
    const tSolidR = _toWX(state.gates[0][1]);
    vtkRendererInst.addActor(makeLines(
        [tSolidL, _toWY(state.thresholdSolid), 0, tSolidR, _toWY(state.thresholdSolid), 0],
        [244/255, 63/255, 94/255], 1.0, 0.8
    ));

    // Dashed threshold (PW2: Gate B left → End Gate)
    const dashY = _toWY(state.thresholdDash);
    const tDashL = _toWX(state.gates[1][0]);
    const tDashR = _toWX(state.endGateT);
    const dashSegs = [];
    for (let x = tDashL; x < tDashR; x += 0.28) {
        dashSegs.push(x, dashY, 0, Math.min(x + 0.14, tDashR), dashY, 0);
    }
    vtkRendererInst.addActor(makeLines(dashSegs, [244/255, 63/255, 94/255], 0.8, 0.55));

    // Stems / peaks
    if (state.peaks.length) {
        const stems = { noise: [], entry: [], gate_max: [], notable: [], bw: [] };
        state.peaks.forEach(([t, v, type]) => {
            const key = stems[type] !== undefined ? type : 'noise';
            stems[key].push(_toWX(t), y0W, 0, _toWX(t), _toWY(v), 0);
        });
        if (stems.noise.length)    vtkRendererInst.addActor(makeLines(stems.noise,    [74/255, 107/255, 150/255], 0.8, 0.6));
        if (stems.entry.length)    vtkRendererInst.addActor(makeLines(stems.entry,    [74/255, 107/255, 150/255], 0.8, 0.6));
        if (stems.gate_max.length) vtkRendererInst.addActor(makeLines(stems.gate_max, [244/255, 63/255, 94/255],  0.8, 0.5));
        if (stems.notable.length)  vtkRendererInst.addActor(makeLines(stems.notable,  [163/255, 230/255, 53/255], 0.8, 0.4));
        if (stems.bw.length)       vtkRendererInst.addActor(makeLines(stems.bw,       [251/255, 191/255, 36/255], 0.8, 0.4));

        const ptNoise = [], ptGateMax = [], ptNotable = [], ptBw = [];
        state.peaks.forEach(([t, v, type]) => {
            const wx = _toWX(t), wy = _toWY(v);
            if (type === 'gate_max') ptGateMax.push(wx, wy, 0);
            else if (type === 'notable') ptNotable.push(wx, wy, 0);
            else if (type === 'bw') ptBw.push(wx, wy, 0);
            else ptNoise.push(wx, wy, 0);
        });
        if (ptNoise.length)   vtkRendererInst.addActor(makePoints(ptNoise,   [74/255, 140/255, 196/255], 4.5));
        if (ptGateMax.length) vtkRendererInst.addActor(makePoints(ptGateMax, [239/255, 68/255, 68/255],  8.0));
        if (ptNotable.length) vtkRendererInst.addActor(makePoints(ptNotable, [163/255, 230/255, 53/255], 7.0));
        if (ptBw.length)      vtkRendererInst.addActor(makePoints(ptBw,      [251/255, 191/255, 36/255], 6.0));
    }

    // Cursor line
    vtkRendererInst.addActor(makeLines(
        [_toWX(state.cursorT), -hwH, 0, _toWX(state.cursorT), hwH, 0],
        [52/255, 211/255, 153/255], 0.9, 0.75
    ));
    // Start Gate / End Gate
    vtkRendererInst.addActor(makeLines(
        [_toWX(state.startGateT), -hwH, 0, _toWX(state.startGateT), hwH, 0],
        [130/255, 210/255, 230/255], 1.2, 0.85
    ));
    vtkRendererInst.addActor(makeLines(
        [_toWX(state.endGateT), -hwH, 0, _toWX(state.endGateT), hwH, 0],
        [250/255, 200/255, 100/255], 1.2, 0.85
    ));

    const cam = vtkRendererInst.getActiveCamera();
    cam.setPosition(0, 0, 18);
    cam.setFocalPoint(0, 0, 0);
    cam.setViewUp(0, 1, 0);
    cam.setParallelProjection(true);
    cam.setParallelScale(hwH);
    cam.setClippingRange(0.1, 100);

    vtkOpenGLWindowInst.setSize(Math.round(width), Math.round(height));
    vtkRenderWindowInst.render();
    lastAspect = aspect;
}

function drawChartAxes(ctx, pad, pw, ph) {
    ctx.strokeStyle = 'rgba(107,138,170,.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + ph);
    ctx.lineTo(pad.l + pw, pad.t + ph);
    ctx.stroke();
}

function fit(c) {
    const p = c.parentElement;
    const w = p.clientWidth, h = p.clientHeight;
    if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
    }
}

function drawOverlay() {
    fit(floatOverlay);
    const w = floatOverlay.width, h = floatOverlay.height;
    fOX.clearRect(0, 0, w, h);
    const pad = getPad();
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const xTickY = pad.t + ph + CHART_X_TICK_Y;
    const xAxisTitleY = pad.t + ph + pad.b - CHART_X_AXIS_TITLE_OFFSET;
    const toX = t => pad.l + (t - state.tMin) / (state.tMax - state.tMin) * pw;
    const toY = v => pad.t + (1 - v / state.vMax) * ph;

    drawChartAxes(fOX, pad, pw, ph);

    fOX.fillStyle = 'rgba(107,138,170,.8)'; fOX.font = '7px JetBrains Mono';
    for (let v = 0; v <= state.vMax; v += 80) fOX.fillText(v, CHART_Y_TICK_X, toY(v) + 3);
    fOX.save();
    fOX.translate(10, pad.t + ph / 2); fOX.rotate(-Math.PI / 2);
    fOX.fillStyle = 'rgba(107,138,170,.7)'; fOX.font = '8px Inter';
    fOX.textAlign = 'center'; fOX.fillText('Signal, mV', 0, 0);
    fOX.textAlign = 'left'; fOX.restore();

    for (let t = state.tMin; t <= state.tMax; t += 1) {
        fOX.fillStyle = 'rgba(107,138,170,.7)'; fOX.font = '7px JetBrains Mono';
        fOX.fillText(t, toX(t) - 5, xTickY);
    }
    fOX.fillStyle = 'rgba(107,138,170,.7)'; fOX.font = '8px Inter';
    fOX.textAlign = 'center'; fOX.fillText('µs', pad.l + pw / 2, xAxisTitleY);
    fOX.textAlign = 'left';

    state.gates.forEach(([t0, t1], i) => {
        const stroke = i === 0 ? 'rgba(130,210,230,.7)' : 'rgba(250,200,100,.7)';
        fOX.fillStyle = stroke; fOX.font = '7px JetBrains Mono';
        fOX.fillText(i === 0 ? '‹Gate A' : '‹Gate B', toX(t0) + 3, pad.t + 10);
        fOX.fillText(i === 0 ? 'Gate A›' : 'Gate B›', toX(t1) + 3, pad.t + 10);
    });
    // Gate fill name centered at bottom
    state.gates.forEach(([t0, t1], i) => {
        const fill = i === 0 ? 'rgba(130,210,230,.18)' : 'rgba(250,200,100,.15)';
        const lbl = i === 0 ? 'Gate A' : 'Gate B';
        fOX.font = 'bold 6.5px JetBrains Mono';
        fOX.fillStyle = fill;
        fOX.textAlign = 'center';
        fOX.fillText(lbl, (toX(t0) + toX(t1)) / 2, pad.t + ph - 8);
        fOX.textAlign = 'left';
    });

    fOX.font = '7px JetBrains Mono';
    fOX.fillStyle = 'rgba(130,210,230,.9)';
    fOX.fillText('Start', toX(state.startGateT) - 10, pad.t + ph - 2);
    fOX.fillStyle = 'rgba(250,200,100,.9)';
    fOX.fillText('End', toX(state.endGateT) - 6, pad.t + ph - 2);

    fOX.fillStyle = 'rgba(244,63,94,.8)'; fOX.font = '7px JetBrains Mono';
    fOX.fillText(String(state.thresholdSolid), pad.l + pw + 2, toY(state.thresholdSolid) + 3);
    // Drag indicator circle on solid threshold
    if (fHoverThreshold || fDragThreshold) {
        fOX.beginPath();
        fOX.arc(pad.l + pw - 4, toY(state.thresholdSolid), 4, 0, Math.PI * 2);
        fOX.fillStyle = 'rgba(244,63,94,.9)';
        fOX.fill();
        fOX.strokeStyle = 'rgba(244,63,94,1)';
        fOX.lineWidth = 1.5;
        fOX.stroke();
    }
    fOX.fillStyle = 'rgba(244,63,94,.6)';
    fOX.fillText(` ${state.thresholdDash}`, pad.l + pw + 2, toY(state.thresholdDash) + 3);
    // Drag indicator circle on dashed threshold
    if (fHoverThresholdDash || fDragThresholdDash) {
        fOX.beginPath();
        fOX.arc(pad.l + pw - 4, toY(state.thresholdDash), 4, 0, Math.PI * 2);
        fOX.fillStyle = 'rgba(244,63,94,.7)';
        fOX.fill();
        fOX.strokeStyle = 'rgba(244,63,94,.9)';
        fOX.lineWidth = 1.2;
        fOX.stroke();
    }

    // Start / End Gate hover indicators
    if (fHoverStartGate || fDragStartGate) {
        const x = toX(state.startGateT);
        fOX.strokeStyle = 'rgba(130,210,230,1)';
        fOX.lineWidth = 2.5;
        fOX.beginPath();
        fOX.moveTo(x, pad.t + 4); fOX.lineTo(x, pad.t + ph - 4);
        fOX.stroke();
        fOX.fillStyle = 'rgba(130,210,230,1)';
        fOX.beginPath();
        fOX.arc(x, pad.t + 4, 3.5, 0, Math.PI * 2);
        fOX.arc(x, pad.t + ph - 4, 3.5, 0, Math.PI * 2);
        fOX.fill();
    }
    if (fHoverEndGate || fDragEndGate) {
        const x = toX(state.endGateT);
        fOX.strokeStyle = 'rgba(250,200,100,1)';
        fOX.lineWidth = 2.5;
        fOX.beginPath();
        fOX.moveTo(x, pad.t + 4); fOX.lineTo(x, pad.t + ph - 4);
        fOX.stroke();
        fOX.fillStyle = 'rgba(250,200,100,1)';
        fOX.beginPath();
        fOX.arc(x, pad.t + 4, 3.5, 0, Math.PI * 2);
        fOX.arc(x, pad.t + ph - 4, 3.5, 0, Math.PI * 2);
        fOX.fill();
    }
    // Gate edge hover indicators
    if (fHoverGate || fDragGate) {
        const h = fHoverGate || fDragGate;
        const g = state.gates[h.gateIdx];
        const isLeft = h.edge === 'left';
        const edgeX = toX(isLeft ? g[0] : g[1]);
        const color = h.gateIdx === 0 ? '130,210,230' : '250,200,100';
        const name = h.gateIdx === 0 ? 'Gate A' : 'Gate B';
        const side = isLeft ? '‹' : '›';
        fOX.strokeStyle = `rgba(${color},1)`;
        fOX.lineWidth = 2.5;
        fOX.beginPath();
        fOX.moveTo(edgeX, pad.t + 4); fOX.lineTo(edgeX, pad.t + ph - 4);
        fOX.stroke();
        fOX.fillStyle = `rgba(${color},1)`;
        fOX.beginPath();
        fOX.arc(edgeX, pad.t + 4, 3.5, 0, Math.PI * 2);
        fOX.arc(edgeX, pad.t + ph - 4, 3.5, 0, Math.PI * 2);
        fOX.fill();
        fOX.font = 'bold 8px JetBrains Mono';
        fOX.fillStyle = `rgba(${color},1)`;
        fOX.textAlign = 'center';
        fOX.fillText(`${side}${name}`, edgeX, pad.t + 20);
        fOX.textAlign = 'left';
    }

    fOX.fillStyle = 'rgba(6,13,26,.7)'; fOX.fillRect(pad.l + 2, pad.t, 140, 55);
    fOX.fillStyle = 'rgba(180,200,220,.85)'; fOX.font = '8px JetBrains Mono';
    fOX.fillText('U(r) : 0.00 us',      pad.l + 5, pad.t + 11);
    fOX.fillText('U(m) : 135.73 us',    pad.l + 5, pad.t + 22);
    fOX.fillText('U(m-r)/2 : 67.87 us', pad.l + 5, pad.t + 33);
    fOX.fillStyle = 'rgba(244,63,94,.7)'; fOX.font = '6px JetBrains Mono';
    fOX.fillText(`PW1: ${state.thresholdSolid}mV`, pad.l + 5, pad.t + 44);
    fOX.fillStyle = 'rgba(244,63,94,.5)'; fOX.font = '6px JetBrains Mono';
    fOX.fillText(`PW2: ${state.thresholdDash}mV`, pad.l + 5, pad.t + 52);

    fOX.fillStyle = 'rgba(0,212,255,.7)'; fOX.font = '7.5px JetBrains Mono';
    fOX.textAlign = 'right';
    fOX.fillText('T=7.30  N=7.80  WI=6.41%', pad.l + pw, pad.t - 4);
    fOX.textAlign = 'left';
}

function init() {
    if (vtkInitialized) return;
    vtkInitialized = true;

    vtkRendererInst = vtkRenderer.newInstance();
    vtkRendererInst.setBackground(0.039, 0.082, 0.125, 1.0);
    vtkRenderWindowInst = vtkRenderWindow.newInstance();
    vtkRenderWindowInst.addRenderer(vtkRendererInst);
    vtkOpenGLWindowInst = vtkOpenGLRenderWindow.newInstance();
    vtkOpenGLWindowInst.setContainer(floatVtkContainer);
    vtkRenderWindowInst.addView(vtkOpenGLWindowInst);

    layoutContainer();
    buildScene();
    drawOverlay();
}

function resize() {
    if (!vtkOpenGLWindowInst) return;
    layoutContainer();
    const { width, height } = floatVtkContainer.getBoundingClientRect();
    if (width > 0 && height > 0) buildScene();
    drawOverlay();
}

function updateScene() {
    drawOverlay();
    if (!vtkOpenGLWindowInst) return;
    const { width, height } = floatVtkContainer.getBoundingClientRect();
    const aspect = height > 0 ? width / height : 1.5;
    if (Math.abs(aspect - lastAspect) > 0.005) {
        buildScene();
    }
}

// ── Resize observer ──
new ResizeObserver(() => resize()).observe(floatVtkContainer.parentElement);

// ── Mouse Interactions (same as main A-Scan) ──

let fDragThreshold = false;
let fHoverThreshold = false;
let fDragThresholdDash = false;
let fHoverThresholdDash = false;
let fDragGate = null;
let fHoverGate = null;
let fDragStartGate = false;
let fHoverStartGate = false;
let fDragEndGate = false;
let fHoverEndGate = false;
const F_EDGE_SNAP = 8;

function fScreenToValue(clientY) {
    const r = floatOverlay.getBoundingClientRect();
    const pad = getPad();
    const ph = r.height - pad.t - pad.b;
    const frac = 1 - (clientY - r.top - pad.t) / ph;
    return clamp(Math.round(frac * state.vMax), 0, state.vMax);
}

function fScreenToTime(clientX) {
    const r = floatOverlay.getBoundingClientRect();
    const pad = getPad();
    const pw = r.width - pad.l - pad.r;
    const frac = (clientX - r.left - pad.l) / pw;
    return clamp(state.tMin + frac * (state.tMax - state.tMin), state.tMin, state.tMax);
}

function fFindHoverGate(clientX) {
    const r = floatOverlay.getBoundingClientRect();
    const pad = getPad();
    const pw = r.width - pad.l - pad.r;
    const toX = t => pad.l + (t - state.tMin) / (state.tMax - state.tMin) * pw;
    for (let i = 0; i < state.gates.length; i++) {
        const g = state.gates[i];
        const gx0 = r.left + toX(g[0]), gx1 = r.left + toX(g[1]);
        if (Math.abs(clientX - gx0) < F_EDGE_SNAP) return { gateIdx: i, edge: 'left' };
        if (Math.abs(clientX - gx1) < F_EDGE_SNAP) return { gateIdx: i, edge: 'right' };
    }
    return null;
}

function fBroadcastState() {
    channel.postMessage({ type: 'updateState', state: { ...state } });
}

floatOverlay.addEventListener('mousedown', e => {
    const nx = e.clientX, ny = e.clientY;
    const r = floatOverlay.getBoundingClientRect();
    const pad = getPad();
    const toX = t => r.left + pad.l + (t - state.tMin) / (state.tMax - state.tMin) * (r.width - pad.l - pad.r);
    const sx = toX(state.startGateT), ex = toX(state.endGateT);
    const dS = Math.abs(nx - sx), dE = Math.abs(nx - ex);
    const mouseT = fScreenToTime(nx);

    // Start Gate
    if (dS < F_EDGE_SNAP && dS <= dE) { fDragStartGate = true; floatOverlay.style.cursor = 'ew-resize'; return; }
    // End Gate
    if (dE < F_EDGE_SNAP) { fDragEndGate = true; floatOverlay.style.cursor = 'ew-resize'; return; }
    // Gate edges
    const gateHit = fFindHoverGate(nx);
    if (gateHit) { fDragGate = gateHit; floatOverlay.style.cursor = 'ew-resize'; return; }
    // Dashed threshold (PW2: Gate B left → End Gate)
    const inDashSpan = mouseT >= state.gates[1][0] && mouseT <= state.endGateT;
    const dashYpx = pad.t + (1 - state.thresholdDash / state.vMax) * (r.height - pad.t - pad.b);
    const dDash = Math.abs(ny - (r.top + dashYpx));
    if (inDashSpan && dDash < 8) {
        fDragThresholdDash = true;
        floatOverlay.style.cursor = 'ns-resize';
        state.thresholdDash = fScreenToValue(ny);
        buildScene(); drawOverlay();
        fBroadcastState();
        return;
    }
    // Solid threshold (PW1: Start Gate → Gate A right)
    const inSolidSpan = mouseT >= state.startGateT && mouseT <= state.gates[0][1];
    const solidYpx = pad.t + (1 - state.thresholdSolid / state.vMax) * (r.height - pad.t - pad.b);
    const dSolid = Math.abs(ny - (r.top + solidYpx));
    if (inSolidSpan && dSolid < 8) {
        fDragThreshold = true;
        floatOverlay.style.cursor = 'ns-resize';
        state.thresholdSolid = fScreenToValue(ny);
        buildScene(); drawOverlay();
        fBroadcastState();
        return;
    }
});

window.addEventListener('mousemove', e => {
    const nx = e.clientX, ny = e.clientY;

    if (fDragStartGate) {
        state.startGateT = fScreenToTime(nx);
        buildScene(); drawOverlay();
        fBroadcastState();
        return;
    }
    if (fDragEndGate) {
        state.endGateT = fScreenToTime(nx);
        buildScene(); drawOverlay();
        fBroadcastState();
        return;
    }
    if (fDragGate) {
        const newT = fScreenToTime(nx);
        const g = state.gates[fDragGate.gateIdx];
        if (fDragGate.edge === 'left') { g[0] = clamp(newT, state.tMin, g[1] - 0.5); }
        else { g[1] = clamp(newT, g[0] + 0.5, state.tMax); }
        if (fDragGate.gateIdx === 0) {
            state.gates[0][1] = Math.min(state.gates[0][1], state.gates[1][0] - 0.3);
            state.gates[1][0] = Math.max(state.gates[1][0], state.gates[0][1] + 0.3);
        }
        if (fDragGate.gateIdx === 1) {
            state.gates[1][0] = Math.max(state.gates[1][0], state.gates[0][1] + 0.3);
            state.gates[0][1] = Math.min(state.gates[0][1], state.gates[1][0] - 0.3);
        }
        buildScene(); drawOverlay();
        fBroadcastState();
        return;
    }
    if (fDragThresholdDash) {
        state.thresholdDash = fScreenToValue(ny);
        buildScene(); drawOverlay();
        fBroadcastState();
        return;
    }
    if (fDragThreshold) {
        state.thresholdSolid = fScreenToValue(ny);
        buildScene(); drawOverlay();
        fBroadcastState();
        return;
    }

    // Hover feedback
    const r = floatOverlay.getBoundingClientRect();
    const pad = getPad();
    const pw = r.width - pad.l - pad.r;
    const ph = r.height - pad.t - pad.b;
    const toX = t => r.left + pad.l + (t - state.tMin) / (state.tMax - state.tMin) * pw;
    const toY = v => pad.t + (1 - v / state.vMax) * ph;

    const sx = toX(state.startGateT), ex = toX(state.endGateT);
    const dS = Math.abs(nx - sx), dE = Math.abs(nx - ex);
    let cursor = 'default';
    let redraw = false;

    const nearStart = dS < F_EDGE_SNAP && dS <= dE;
    if (nearStart !== fHoverStartGate) { fHoverStartGate = nearStart; redraw = true; }
    if (nearStart) cursor = 'ew-resize';

    const nearEnd = dE < F_EDGE_SNAP && (!nearStart || dE <= dS);
    if (nearEnd !== fHoverEndGate) { fHoverEndGate = nearEnd; redraw = true; }
    if (nearEnd) cursor = 'ew-resize';

    if (!nearStart && !nearEnd) {
        let newHoverGate = null;
        for (let i = 0; i < state.gates.length; i++) {
            const g = state.gates[i];
            const gx0 = toX(g[0]), gx1 = toX(g[1]);
            if (Math.abs(nx - gx0) < F_EDGE_SNAP) { newHoverGate = { gateIdx: i, edge: 'left' }; break; }
            if (Math.abs(nx - gx1) < F_EDGE_SNAP) { newHoverGate = { gateIdx: i, edge: 'right' }; break; }
        }
        if (newHoverGate !== fHoverGate) { fHoverGate = newHoverGate; redraw = true; }
        if (newHoverGate) cursor = 'ew-resize';

        const mouseT = fScreenToTime(nx);
        const inSolidSpan = mouseT >= state.startGateT && mouseT <= state.gates[0][1];
        const inDashSpan = mouseT >= state.gates[1][0] && mouseT <= state.endGateT;
        const solidYpx = r.top + toY(state.thresholdSolid);
        const dashYpx = r.top + toY(state.thresholdDash);

        const nearSolid = inSolidSpan && Math.abs(ny - solidYpx) < 8;
        if (nearSolid !== fHoverThreshold) { fHoverThreshold = nearSolid; redraw = true; }
        if (nearSolid && !newHoverGate) cursor = 'ns-resize';

        const nearDash = inDashSpan && Math.abs(ny - dashYpx) < 8;
        if (nearDash !== fHoverThresholdDash) { fHoverThresholdDash = nearDash; redraw = true; }
        if (nearDash && !newHoverGate && !nearSolid) cursor = 'ns-resize';
    } else {
        if (fHoverGate) { fHoverGate = null; redraw = true; }
        if (fHoverThreshold) { fHoverThreshold = false; redraw = true; }
        if (fHoverThresholdDash) { fHoverThresholdDash = false; redraw = true; }
    }

    floatOverlay.style.cursor = cursor;
    if (redraw) drawOverlay();
});

window.addEventListener('mouseup', () => {
    if (fDragThreshold || fDragThresholdDash || fDragStartGate || fDragEndGate || fDragGate) {
        fBroadcastState();
    }
    fDragThreshold = false;
    fDragThresholdDash = false;
    fDragGate = null;
    fDragStartGate = false;
    fDragEndGate = false;
    floatThreshDisplay.textContent = `${state.thresholdSolid}/${state.thresholdDash} mV`;
});

floatOverlay.addEventListener('mouseleave', () => {
    if (!fDragThreshold && !fDragThresholdDash && !fDragGate && !fDragStartGate && !fDragEndGate) {
        fHoverThreshold = false;
        fHoverThresholdDash = false;
        fHoverGate = null;
        fHoverStartGate = false;
        fHoverEndGate = false;
        floatOverlay.style.cursor = 'default';
        drawOverlay();
    }
});

// ── Load initialState from localStorage (saved by main page before window.open) ──
(function loadSavedState() {
    try {
        const saved = localStorage.getItem('aScanFloatState');
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(state, parsed);
            localStorage.removeItem('aScanFloatState');
        }
    } catch(e) { /* ignore */ }
})();

// ── BroadcastChannel ──
channel.addEventListener('message', event => {
    const msg = event.data;
    if (!msg) return;
    switch (msg.type) {
        case 'updateState':
            Object.assign(state, msg.state);
            buildScene();
            drawOverlay();
            floatThreshDisplay.textContent = `${state.thresholdSolid}/${state.thresholdDash} mV`;
            break;
        case 'closeMe':
            window.close();
            break;
    }
});

// Tell main page we're ready
channel.postMessage({ type: 'floatReady' });
floatStatusMsg.textContent = 'Synced with main dashboard';
floatThreshDisplay.textContent = `${state.thresholdSolid}/${state.thresholdDash} mV`;

// Dock button
floatDockBtn.addEventListener('click', () => {
    channel.postMessage({ type: 'dockAScan' });
});

// Handle manual close
window.addEventListener('beforeunload', () => {
    channel.postMessage({ type: 'floatClosed' });
});

init();
