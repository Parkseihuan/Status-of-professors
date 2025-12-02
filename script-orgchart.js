// ==================== ORG CHART MODULE ====================
// Separate file for organizational chart functionality

const OrgChartApp = {
    data: null,
    zoom: 1,
    zoomStep: 0.1,
    panning: {
        isPanning: false,
        startX: 0,
        startY: 0,
        translateX: 0,
        translateY: 0
    }
};

// ==================== PARSING FUNCTIONS ====================

// Parse org chart Excel file
async function parseOrgChartFile(file) {
    // Ensure readFile is available (it should be from script.js)
    if (typeof readFile !== 'function') {
        console.error('readFile function is not defined. Make sure script.js is loaded.');
        throw new Error('readFile function missing');
    }

    const buffer = await readFile(file);
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const orgNodes = [];
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length < 3) continue;

        const node = {
            name: row[0],
            id: row[1],
            supervisorId: row[2],
            englishName: row[3] || ''
        };

        if (node.name && node.id !== null) {
            orgNodes.push(node);
        }
    }
    return orgNodes;
}

// Build tree structure
function buildOrgHierarchyFromFile(orgNodes) {
    const nodeMap = new Map();
    const roots = [];

    orgNodes.forEach(node => {
        nodeMap.set(node.id, { ...node, children: [], type: 'org-position' });
    });

    orgNodes.forEach(node => {
        const currentNode = nodeMap.get(node.id);
        if (node.supervisorId === null || !nodeMap.has(node.supervisorId)) {
            roots.push(currentNode);
        } else {
            const parent = nodeMap.get(node.supervisorId);
            if (parent) parent.children.push(currentNode);
        }
    });

    return roots;
}

// Match professor data
function matchProfessorDataToOrgChart(orgRoots, professorData) {
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

    function matchNode(node) {
        const matches = positionMap.get(node.name);
        if (matches && matches.length > 0) {
            node.professors = matches;
        }
        if (node.children) {
            node.children.forEach(child => matchNode(child));
        }
    }

    orgRoots.forEach(root => matchNode(root));
    return orgRoots;
}

// ==================== RENDERING FUNCTIONS ====================

function renderOrgChartWithHierarchy(data) {
    const canvas = document.getElementById('org-chart-canvas');
    const svg = document.getElementById('org-connections');

    if (!canvas || !svg) {
        console.error('Org chart elements not found');
        return;
    }

    // Clear existing
    canvas.innerHTML = '';
    canvas.appendChild(svg); // Keep SVG inside
    svg.innerHTML = '';

    // Build hierarchy
    let hierarchy;
    if (data.orgChart && data.orgChart.length > 0) {
        hierarchy = data.orgChart;
    } else {
        hierarchy = buildSimpleHierarchy(data);
    }
    OrgChartApp.data = hierarchy;

    // Layout settings
    const LEVEL_HEIGHT = 120;
    const NODE_WIDTH = 160;
    const SIBLING_GAP = 30;

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

    // Position roots
    let currentRootX = 50;
    hierarchy.forEach(root => {
        const dims = calculateLayout(root, 0, currentRootX);
        currentRootX += dims.width + 100;
    });

    // Draw
    hierarchy.forEach(root => {
        drawOrgTree(root, canvas, svg);
    });

    // Fit to screen
    const container = document.getElementById('org-chart-container');
    if (container.clientWidth > 0) {
        const contentWidth = currentRootX;
        const contentHeight = maxY + 100;
        const scaleX = container.clientWidth / contentWidth;
        const scaleY = container.clientHeight / contentHeight;
        OrgChartApp.zoom = Math.min(scaleX, scaleY, 1) * 0.9;

        const scaledWidth = contentWidth * OrgChartApp.zoom;
        OrgChartApp.panning.translateX = (container.clientWidth - scaledWidth) / 2;
        OrgChartApp.panning.translateY = 50;

        applyOrgTransform();
    }

    initOrgChartPanning();
}

function buildSimpleHierarchy(data) {
    const roots = [];
    const categoryMap = {};

    function getCategoryNode(catName) {
        if (!categoryMap[catName]) {
            const node = {
                id: `cat-${catName}`,
                type: 'category',
                label: catName,
                name: catName,
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
                        label: item.position,
                        name: item.position,
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

function drawOrgTree(node, container, svg) {
    const el = document.createElement('div');
    el.className = `org-node ${node.type || 'position'}-node`;
    el.id = node.id || `node-${Math.random().toString(36).substr(2, 9)}`;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;

    let html = `<div class="node-header">${node.label || node.name}</div>`;

    if (node.professors && node.professors.length > 0) {
        html += '<div class="node-body">';
        node.professors.forEach(prof => {
            html += `<div class="node-name">${prof.name}</div>`;
            if (prof.period) html += `<div class="node-period">${prof.period}</div>`;
            el.dataset.personName = prof.name;
        });
        html += '</div>';
    } else if (node.person) {
        html += `<div class="node-body">
            <div class="node-name">${node.person}</div>
            <div class="node-period">${node.period || ''}</div>
        </div>`;
        el.dataset.personName = node.person;
    }

    el.innerHTML = html;

    // Interactions
    el.addEventListener('click', (e) => {
        e.stopPropagation();

        // Remove previous selection
        document.querySelectorAll('.org-node').forEach(n => n.classList.remove('selected'));
        el.classList.add('selected');

        // Show concurrent lines only for this person
        if (el.dataset.personName) {
            const personName = el.dataset.personName;
            const nodes = Array.from(document.querySelectorAll('.org-node')).filter(n => n.dataset.personName === personName);

            if (nodes.length > 1) {
                highlightConcurrentPositions(personName);
            } else {
                // Clear concurrent lines if no concurrent positions
                document.querySelectorAll('.concurrent-connection').forEach(el => el.remove());
            }
        }
    });

    el.addEventListener('mouseenter', (e) => {
        if (el.dataset.personName) showConcurrentTooltip(e, el.dataset.personName);
    });

    el.addEventListener('mouseleave', hideConcurrentTooltip);

    container.appendChild(el);

    if (node.children) {
        node.children.forEach(child => {
            drawOrgTree(child, container, svg);
            drawOrgConnection(node, child, svg);
        });
    }
}

function drawOrgConnection(parent, child, svg) {
    const parentX = parent.x + 80; // Half of NODE_WIDTH (160)
    const parentY = parent.y + 50; // Approx height
    const childX = child.x + 80;
    const childY = child.y;
    const midY = (parentY + childY) / 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = `M ${parentX} ${parentY} L ${parentX} ${midY} L ${childX} ${midY} L ${childX} ${childY}`;
    path.setAttribute('d', d);
    path.setAttribute('class', 'connection-line');
    svg.appendChild(path);
}

// ==================== INTERACTION FUNCTIONS ====================

function orgZoomIn() {
    OrgChartApp.zoom += OrgChartApp.zoomStep;
    applyOrgTransform();
}

function orgZoomOut() {
    if (OrgChartApp.zoom > 0.1) {
        OrgChartApp.zoom -= OrgChartApp.zoomStep;
        applyOrgTransform();
    }
}

function orgResetZoom() {
    if (OrgChartApp.data) renderOrgChartWithHierarchy({ orgChart: OrgChartApp.data, rows: window.processedData.rows });
}

function applyOrgTransform() {
    const canvas = document.getElementById('org-chart-canvas');
    if (canvas) {
        canvas.style.transform = `translate(${OrgChartApp.panning.translateX}px, ${OrgChartApp.panning.translateY}px) scale(${OrgChartApp.zoom})`;
    }
}

function initOrgChartPanning() {
    const container = document.getElementById('org-chart-container');
    if (!container) return;

    const newContainer = container.cloneNode(true);
    container.parentNode.replaceChild(newContainer, container);
    const freshContainer = document.getElementById('org-chart-container');

    freshContainer.addEventListener('mousedown', (e) => {
        if (e.target.closest('.org-node')) return;
        OrgChartApp.panning.isPanning = true;
        OrgChartApp.panning.startX = e.clientX - OrgChartApp.panning.translateX;
        OrgChartApp.panning.startY = e.clientY - OrgChartApp.panning.translateY;
        freshContainer.style.cursor = 'grabbing';
    });

    freshContainer.addEventListener('mousemove', (e) => {
        if (!OrgChartApp.panning.isPanning) return;
        e.preventDefault();
        OrgChartApp.panning.translateX = e.clientX - OrgChartApp.panning.startX;
        OrgChartApp.panning.translateY = e.clientY - OrgChartApp.panning.startY;
        applyOrgTransform();
    });

    freshContainer.addEventListener('mouseup', () => {
        OrgChartApp.panning.isPanning = false;
        freshContainer.style.cursor = 'grab';
    });

    freshContainer.addEventListener('mouseleave', () => {
        OrgChartApp.panning.isPanning = false;
        freshContainer.style.cursor = 'grab';
    });

    freshContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        const newZoom = Math.max(0.1, OrgChartApp.zoom + delta);

        const rect = freshContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - OrgChartApp.panning.translateX) / OrgChartApp.zoom;
        const worldY = (mouseY - OrgChartApp.panning.translateY) / OrgChartApp.zoom;

        OrgChartApp.zoom = newZoom;
        OrgChartApp.panning.translateX = mouseX - worldX * OrgChartApp.zoom;
        OrgChartApp.panning.translateY = mouseY - worldY * OrgChartApp.zoom;

        applyOrgTransform();
    });
}

function highlightConcurrentPositions(personName) {
    document.querySelectorAll('.concurrent-connection').forEach(el => el.remove());
    const nodes = Array.from(document.querySelectorAll('.org-node')).filter(n => n.dataset.personName === personName);
    if (nodes.length < 2) return;

    const svg = document.getElementById('org-connections');
    nodes.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));

    for (let i = 0; i < nodes.length - 1; i++) {
        const start = nodes[i];
        const end = nodes[i + 1];
        const startX = parseFloat(start.style.left) + 80;
        const startY = parseFloat(start.style.top) + 50;
        const endX = parseFloat(end.style.left) + 80;
        const endY = parseFloat(end.style.top);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${startX} ${startY} L ${endX} ${endY}`);
        path.setAttribute('class', 'connection-line concurrent-connection');
        path.setAttribute('stroke-dasharray', '5,5');
        path.setAttribute('stroke', '#fbbf24');
        path.setAttribute('stroke-width', '2');
        svg.appendChild(path);
    }
}

function showConcurrentTooltip(event, personName) {
    const nodes = Array.from(document.querySelectorAll('.org-node')).filter(n => n.dataset.personName === personName);
    if (nodes.length < 2) return;

    const tooltip = document.getElementById('custom-tooltip');
    const positions = nodes.map(n => n.querySelector('.node-header').textContent).filter(p => p);

    tooltip.innerHTML = `<strong>${personName}</strong><br>겸직: ${positions.join(', ')}`;
    tooltip.style.display = 'block';
    tooltip.style.left = (event.pageX + 10) + 'px';
    tooltip.style.top = (event.pageY + 10) + 'px';
}

function hideConcurrentTooltip() {
    const tooltip = document.getElementById('custom-tooltip');
    if (tooltip) tooltip.style.display = 'none';
}

// Click outside to hide concurrent connections
document.addEventListener('click', (e) => {
    if (!e.target.closest('.org-node')) {
        document.querySelectorAll('.concurrent-connection').forEach(el => el.remove());
        document.querySelectorAll('.org-node').forEach(n => n.classList.remove('selected'));
    }
});

console.log('Org chart module loaded');
