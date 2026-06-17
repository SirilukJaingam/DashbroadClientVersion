import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { AllCommunityModule, ModuleRegistry, createGrid } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

const CHANNEL_NAME = 'pipe-tally-float';
const channel = new BroadcastChannel(CHANNEL_NAME);
let floatGridApi = null;
let currentData = [];

function syncTallyLayout() {
    if (floatGridApi) floatGridApi.sizeColumnsToFit({ defaultMinWidth: 90 });
}

function doDock() {
    channel.postMessage({ type: 'dockTally' });
}

function updateSummary(data) {
    const jointCount = data.length;
    const flaggedCount = data.filter(r => r.status !== 'ok').length;
    const totalLength = data.reduce((sum, r) => sum + r.lengthM, 0);
    document.getElementById('floatJointCount').textContent = String(jointCount);
    document.getElementById('floatFlaggedCount').textContent = String(flaggedCount);
    document.getElementById('floatTotalLength').textContent = totalLength.toFixed(2) + ' m';
}

function buildOrUpdateGrid(data) {
    currentData = data;
    if (!floatGridApi) {
        floatGridApi = createGrid(document.getElementById('floatGrid'), {
            theme: 'legacy',
            rowData: data,
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
            onFirstDataRendered: () => syncTallyLayout(),
            onRowClicked: params => {
                const idx = currentData.indexOf(params.data);
                if (idx >= 0) {
                    channel.postMessage({ type: 'selectJoint', idx });
                }
            },
        });
    } else {
        floatGridApi.setGridOption('rowData', data);
        syncTallyLayout();
    }
    updateSummary(data);
    document.getElementById('floatStatusMsg').textContent =
        data.length + ' joints · Click ⤓ Dock to return table to main dashboard';
}

channel.addEventListener('message', event => {
    const msg = event.data;
    if (!msg) return;
    switch (msg.type) {
        case 'init':
        case 'updateData':
            buildOrUpdateGrid(msg.data);
            document.getElementById('floatSyncBadge').className = 'sync-indicator live';
            document.getElementById('floatSyncBadge').textContent = '● Synced';
            break;
        case 'selectJoint':
            if (floatGridApi && msg.idx >= 0 && msg.idx < currentData.length) {
                floatGridApi.selectIndex(msg.idx, false, true);
                const node = floatGridApi.getDisplayedRowAtIndex(msg.idx);
                if (node) floatGridApi.ensureNodeVisible(node);
            }
            break;
        case 'ping':
            channel.postMessage({ type: 'pong' });
            break;
        case 'closeMe':
            window.close();
            break;
    }
});

document.getElementById('floatDockBtn').addEventListener('click', doDock);

// Load from localStorage immediately (saved by main window before opening tab)
function loadFromLocal() {
    try {
        const stored = localStorage.getItem('tallyFloatData');
        if (stored) {
            const data = JSON.parse(stored);
            if (Array.isArray(data) && data.length > 0) {
                buildOrUpdateGrid(data);
                document.getElementById('floatStatusMsg').textContent =
                    data.length + ' joints · Click ⤓ Dock to return table to main dashboard';
                return true;
            }
        }
    } catch (_) { /* ignore */ }
    return false;
}

// Try local first, then signal main window
const loaded = loadFromLocal();
channel.postMessage({ type: 'floatReady' });
// If local didn't have data, try fallback after a delay
setTimeout(() => {
    if (!currentData.length) {
        if (!loadFromLocal()) {
            document.getElementById('floatStatusMsg').textContent =
                'Awaiting data from main dashboard...';
        }
    }
}, 300);

// Periodic sync ping
setInterval(() => {
    channel.postMessage({ type: 'ping' });
}, 15000);

window.addEventListener('resize', () => {
    if (floatGridApi) syncTallyLayout();
});

window.addEventListener('beforeunload', () => {
    channel.postMessage({ type: 'floatClosed' });
});