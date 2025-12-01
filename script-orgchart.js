// ==================== ORG CHART MODULE ====================
// Separate file for organizational chart functionality
// This file handles: parsing, hierarchy building, rendering, and interactions

// Global variables for org chart
let orgChartData = null;
let currentOrgZoom = 1;
const ORG_ZOOM_STEP = 0.1;

// Panning variables
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let currentTranslateX = 0;
let currentTranslateY = 0;

// ==================== PARSING FUNCTIONS ====================

// Parse org chart Excel file (대학기구표2.xlsx format)
async function parseOrgChartFile(file) {
    const buffer = await readFile(file);
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Expected format: [Employee Name, Employee ID, Supervisor ID, English Name]
    const orgNodes = [];

    for (let i = 1; i < data.length; i++) { // Skip header
        const row = data[i];
        if (!row || row.length < 3) continue;

        const node = {
            name: row[0], // Korean name
            id: row[1], // Employee ID
            supervisorId: row[2], // Supervisor ID (parent)
            englishName: row[3] || ''
        };

        if (node.name && node.id !== null && node.id !== undefined) {
            orgNodes.push(node);
        }
    }

    return orgNodes;
}

// Build tree structure from flat org chart data
function buildOrgHierarchyFromFile(orgNodes) {
    const nodeMap = new Map();
    const roots = [];

    // Create map of all nodes
    orgNodes.forEach(node => {
        nodeMap.set(node.id, {
            ...node,
            children: [],
            type: 'org-position'
        });
    });

    // Build parent-child relationships
    orgNodes.forEach(node => {
        const currentNode = nodeMap.get(node.id);

        if (node.supervisorId === null || node.supervisorId === undefined || !nodeMap.has(node.supervisorId)) {
            // This is a root node
            roots.push(currentNode);
        } else {
            // Add as child to parent
            const parent = nodeMap.get(node.supervisorId);
            if (parent) {
                parent.children.push(currentNode);
            }
        }
    });

    return roots;
}

// Match professor data with org chart nodes
function matchProfessorDataToOrgChart(orgRoots, professorData) {
    // Create a map of position names to professors
    const positionMap = new Map();

    professorData.rows.forEach(row => {
        ['left', 'right'].forEach(side => {
            const item = row[side];
            if (item.position && item.name) {
                if (!positionMap.has(item.position)) {
                    positionMap.set(item.position, []);
                }
                positionMap.get(item.position).push({
                    name: item.name,
                    period: item.period,
                    category: item.category
                });
            }
        });
    });

    // Recursively match org nodes with professor data
    function matchNode(node) {
        // Try to match by position name
        const matches = positionMap.get(node.name);
        if (matches && matches.length > 0) {
            node.professors = matches;
        }

        // Recursively match children
        if (node.children) {
            node.children.forEach(child => matchNode(child));
        }
    }

    orgRoots.forEach(root => matchNode(root));
    return orgRoots;
}

// ==================== RENDERING FUNCTIONS ====================

// Main render function for org chart
function renderOrgChartWithHierarchy(data) {
    const canvas = document.getElementById('org-chart-canvas');
    const svg = document.getElementById('org-connections');

    if (!canvas || !svg) {
        console.error('Org chart elements not found');
        return;
    }

    // Clear existing nodes (keep SVG)
    Array.from(canvas.children).forEach(child => {
        if (child.tagName !== 'svg' && child.tagName !== 'SVG') {
            canvas.removeChild(child);
        }
    });
    svg.innerHTML = '';

    // Use org chart hierarchy if available, otherwise fall back to simple structure
    let hierarchy;
    if (data.orgChart && data.orgChart.length > 0) {
        hierarchy = data.orgChart;
    } else {
        // Fallback: build simple hierarchy from data
        hierarchy = buildSimpleHierarchy(data);
    }

    // Store for later use
    orgChartData = hierarchy;

    // Layout calculation - Tighter layout
    const LEVEL_HEIGHT = 100; // Reduced from 120
    const NODE_WIDTH = 140;   // Reduced from 160
    const SIBLING_GAP = 20;   // Reduced from 30

    let maxX = 0;
    let maxY = 0;

    function calculateLayout(node, level, startX) {
        let currentX = startX;
        let width = NODE_WIDTH;

        if (node.children && node.children.length > 0) {
            let childrenWidth = 0;
            node.children.forEach(child => {
                const childDims = calculateLayout(child, level + 1, currentX);
                currentX += childDims.width + SIBLING_GAP;
                childrenWidth += childDims.width + SIBLING_GAP;
            });
            childrenWidth -= SIBLING_GAP;

            node.x = startX + (childrenWidth / 2) - (NODE_WIDTH / 2);
            width = Math.max(NODE_WIDTH, childrenWidth);
        } else {
            node.x = startX;
        }

        node.y = level * LEVEL_HEIGHT + 50;

        maxX = Math.max(maxX, node.x + NODE_WIDTH);
        maxY = Math.max(maxY, node.y + LEVEL_HEIGHT);

        return { width: width, x: node.x };
    }

    // Position root nodes
    let currentRootX = 50;
    hierarchy.forEach(root => {
        const dims = calculateLayout(root, 0, currentRootX);
        currentRootX += dims.width + 80;
    });

    // Draw nodes and connections
    hierarchy.forEach(root => {
        drawOrgTree(root, canvas, svg);
    });

    // Calculate fit-to-screen zoom
    const container = document.getElementById('org-chart-container');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const contentWidth = currentRootX + 100;
    const contentHeight = maxY + 100;

    const scaleX = containerWidth / contentWidth;
    const scaleY = containerHeight / contentHeight;
    const initialZoom = Math.min(scaleX, scaleY, 1) * 0.9; // 90% fit

    currentOrgZoom = initialZoom;

    // Center the chart initially
    currentTranslateX = (containerWidth - contentWidth * currentOrgZoom) / 2;
    currentTranslateY = 50; // Top padding

    // Apply transform
    applyOrgTransform();

    // Initialize panning
    initOrgChartPanning();
}

// Fallback: build simple hierarchy from professor data
function buildSimpleHierarchy(data) {
    const roots = [];
    const categoryMap = {};

    function getCategoryNode(catName) {
        if (!categoryMap[catName]) {
            const node = {
                id: `cat-${catName}`,
                type: 'category',
                name: catName,
                label: catName,
                children: []
            };
            categoryMap[catName] = node;
            roots.push(node);
        }
        return categoryMap[catName];
    }

    data.rows.forEach(row => {
        ['left', 'right'].forEach(side => {
            const item = row[side];
            if (item.category && item.position) {
                const catNode = getCategoryNode(item.category);

                let posNode = catNode.children.find(c => c.label === item.position);

                if (!posNode) {
                    posNode = {
                        id: `pos-${item.category}-${item.position}`,
                        type: 'position',
                        name: item.position,
                        label: item.position,
                        person: item.name,
                        period: item.period,
                        children: []
                    };
                    catNode.children.push(posNode);
                } else if (item.name && (!posNode.person || posNode.person === '')) {
                    posNode.person = item.name;
                    posNode.period = item.period;
                }
            }
        });
    });

    return roots;
}

// Draw individual tree node and its children
function drawOrgTree(node, container, svg) {
    const el = document.createElement('div');
    el.className = `org-node ${node.type || 'position'}-node`;
    el.id = node.id || `node-${node.name}`;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.dataset.personName = ''; // For concurrent position tracking

    let html = `<div class="node-header">${node.label || node.name}</div>`;

    // Show professor info if available
    if (node.professors && node.professors.length > 0) {
        html += '<div class="node-body">';
        node.professors.forEach(prof => {
            html += `<div class="node-name">${prof.name}</div>`;
            if (prof.period) {
                html += `<div class="node-period">${prof.period}</div>`;
            }
            el.dataset.personName = prof.name; // Store for concurrent highlighting
        });
        html += '</div>';
    } else if (node.person) {
        html += `
            <div class="node-body">
                <div class="node-name">${node.person}</div>
                <div class="node-period">${node.period || ''}</div>
            </div>
        `;
        el.dataset.personName = node.person;
    }

    el.innerHTML = html;

    // Add click handler for concurrent positions
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.org-node').forEach(n => n.classList.remove('selected'));
        el.classList.add('selected');

        // Show concurrent connections if person has multiple positions
        const personName = el.dataset.personName;
        if (personName) {
            highlightConcurrentPositions(personName);
        }
    });

    // Add hover tooltip for concurrent positions
    el.addEventListener('mouseenter', (e) => {
        const personName = el.dataset.personName;
        if (personName) {
            showConcurrentTooltip(e, personName);
        }
    });

    el.addEventListener('mouseleave', () => {
        hideConcurrentTooltip();
    });

    container.appendChild(el);

    // Draw children
    if (node.children) {
        node.children.forEach(child => {
            drawOrgTree(child, container, svg);
            drawOrgConnection(node, child, svg);
        });
    }
}

// Draw connection line between parent and child
function drawOrgConnection(parent, child, svg) {
    const parentX = parent.x + 70; // Center of 140px width
    const parentY = parent.y + 50; // Bottom of node approx

    const childX = child.x + 70;
    const childY = child.y;

    const midY = (parentY + childY) / 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = `M ${parentX} ${parentY} 
               L ${parentX} ${midY} 
               L ${childX} ${midY} 
               L ${childX} ${childY}`;

    path.setAttribute('d', d);
    path.setAttribute('class', 'connection-line');

    svg.appendChild(path);
}

// ==================== INTERACTION FUNCTIONS ====================

// Zoom functions
function orgZoomIn() {
    currentOrgZoom += ORG_ZOOM_STEP;
    applyOrgTransform();
}

function orgZoomOut() {
    if (currentOrgZoom > 0.1) {
        currentOrgZoom -= ORG_ZOOM_STEP;
        applyOrgTransform();
    }
}

function orgResetZoom() {
    // Recalculate fit-to-screen
    const container = document.getElementById('org-chart-container');
    const canvas = document.getElementById('org-chart-canvas');
    // ... logic similar to initial render ...
    // For simplicity, just reset to 1.0 or call render again
    if (orgChartData) {
        renderOrgChartWithHierarchy({ orgChart: orgChartData });
    }
}

function applyOrgTransform() {
    const canvas = document.getElementById('org-chart-canvas');
    if (canvas) {
        canvas.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px) scale(${currentOrgZoom})`;
    }
}

// Panning Logic
function initOrgChartPanning() {
    const container = document.getElementById('org-chart-container');
    if (!container) return;

    // Remove existing listeners to avoid duplicates (naive approach)
    const newContainer = container.cloneNode(true);
    container.parentNode.replaceChild(newContainer, container);

    // Re-select
    const freshContainer = document.getElementById('org-chart-container');

    freshContainer.addEventListener('mousedown', (e) => {
        // Ignore if clicking on a node
        if (e.target.closest('.org-node')) return;

        isPanning = true;
        panStartX = e.clientX - currentTranslateX;
        panStartY = e.clientY - currentTranslateY;
        freshContainer.style.cursor = 'grabbing';
    });

    freshContainer.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        e.preventDefault();

        currentTranslateX = e.clientX - panStartX;
        currentTranslateY = e.clientY - panStartY;

        applyOrgTransform();
    });

    freshContainer.addEventListener('mouseup', () => {
        isPanning = false;
        freshContainer.style.cursor = 'grab';
    });

    freshContainer.addEventListener('mouseleave', () => {
        isPanning = false;
        freshContainer.style.cursor = 'grab';
    });

    // Wheel Zoom
    freshContainer.addEventListener('wheel', (e) => {
        e.preventDefault();

        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;
        const newZoom = Math.max(0.1, currentOrgZoom + delta);

        // Zoom towards mouse pointer
        const rect = freshContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculate world coordinates before zoom
        const worldX = (mouseX - currentTranslateX) / currentOrgZoom;
        const worldY = (mouseY - currentTranslateY) / currentOrgZoom;

        // Update zoom
        currentOrgZoom = newZoom;

        // Calculate new translate to keep mouse pointer at same world coordinates
        currentTranslateX = mouseX - worldX * currentOrgZoom;
        currentTranslateY = mouseY - worldY * currentOrgZoom;

        applyOrgTransform();
    });
}

// Highlight concurrent positions for a person
function highlightConcurrentPositions(personName) {
    // Clear previous highlights
    document.querySelectorAll('.concurrent-connection').forEach(el => el.remove());

    // Find all nodes with this person
    const nodes = Array.from(document.querySelectorAll('.org-node')).filter(node => {
        return node.dataset.personName === personName;
    });

    if (nodes.length < 2) return;

    // Draw dotted lines between all positions
    const svg = document.getElementById('org-connections');
    nodes.sort((a, b) => {
        const aY = parseFloat(a.style.top);
        const bY = parseFloat(b.style.top);
        return aY - bY;
    });

    for (let i = 0; i < nodes.length - 1; i++) {
        const startNode = nodes[i];
        const endNode = nodes[i + 1];

        const startX = parseFloat(startNode.style.left) + 70;
        const startY = parseFloat(startNode.style.top) + 50;

        const endX = parseFloat(endNode.style.left) + 70;
        const endY = parseFloat(endNode.style.top);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${startX} ${startY} L ${endX} ${endY}`;

        path.setAttribute('d', d);
        path.setAttribute('class', 'connection-line concurrent-connection');
        path.setAttribute('stroke-dasharray', '5,5');
        path.setAttribute('stroke', '#fbbf24');
        path.setAttribute('stroke-width', '2');

        svg.appendChild(path);
    }
}

// Show tooltip for concurrent positions
function showConcurrentTooltip(event, personName) {
    const nodes = Array.from(document.querySelectorAll('.org-node')).filter(node => {
        return node.dataset.personName === personName;
    });

    if (nodes.length < 2) return;

    const tooltip = document.getElementById('custom-tooltip');
    if (!tooltip) return;

    const positions = nodes.map(node => {
        const header = node.querySelector('.node-header');
        return header ? header.textContent : '';
    }).filter(p => p);

    tooltip.innerHTML = `
        <strong>${personName}</strong><br>
        겸직: ${positions.join(', ')}
    `;

    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 10 + 'px';
    tooltip.style.top = event.pageY + 10 + 'px';
}

function hideConcurrentTooltip() {
    const tooltip = document.getElementById('custom-tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

// Clear concurrent highlights when clicking elsewhere
document.addEventListener('click', (e) => {
    if (!e.target.closest('.org-node')) {
        document.querySelectorAll('.concurrent-connection').forEach(el => el.remove());
        document.querySelectorAll('.org-node').forEach(n => n.classList.remove('selected'));
    }
});

// Initialize mouse wheel zoom when org chart section is shown
// Note: This is now handled inside renderOrgChartWithHierarchy via initOrgChartPanning

console.log('Org chart module loaded');
