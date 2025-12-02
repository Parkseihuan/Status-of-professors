// Org Chart Module - Tree Structure (Simple Design)
console.log('Org chart module loaded');

// Namespace for org chart
const OrgChartApp = {
    data: null,
    selectedPerson: null
};

// Main render function
function renderOrgChartWithHierarchy(data) {
    const container = document.getElementById('org-chart-canvas');
    if (!container) {
        console.error('Org chart container not found');
        return;
    }

    // Clear existing content
    container.innerHTML = '';

    // Build hierarchy from data
    let hierarchy;
    if (data.orgChart && data.orgChart.length > 0) {
        hierarchy = data.orgChart;
    } else {
        hierarchy = buildSimpleHierarchy(data);
    }

    OrgChartApp.data = hierarchy;

    // Create tree structure
    const treeContainer = document.createElement('div');
    treeContainer.className = 'org-tree-container';

    hierarchy.forEach(root => {
        const treeElement = buildTreeElement(root);
        treeContainer.appendChild(treeElement);
    });

    container.appendChild(treeContainer);

    // Add click handlers
    initOrgChartInteractions();
}

// Build simple hierarchy from table data
function buildSimpleHierarchy(data) {
    const roots = [];
    const categoryMap = {};

    if (!data.rows || data.rows.length === 0) {
        return roots;
    }

    // Process rows to build hierarchy
    data.rows.forEach(row => {
        ['left', 'right'].forEach(side => {
            const item = row[side];
            if (!item || !item.category) return;

            const category = item.category;
            const position = item.position;
            const name = item.name;
            const period = item.period;

            if (!categoryMap[category]) {
                const catNode = {
                    label: category,
                    type: 'category',
                    children: []
                };
                categoryMap[category] = catNode;
                roots.push(catNode);
            }

            const catNode = categoryMap[category];

            if (position) {
                // Find or create position node
                let posNode = catNode.children.find(c => c.label === position);
                if (!posNode) {
                    posNode = {
                        label: position,
                        type: 'position',
                        person: name || '',
                        period: period || '',
                        children: []
                    };
                    catNode.children.push(posNode);
                } else if (name && (!posNode.person || posNode.person === '')) {
                    posNode.person = name;
                    posNode.period = period;
                }
            }
        });
    });

    return roots;
}

// Build tree HTML element
function buildTreeElement(node, level = 0) {
    const ul = document.createElement('ul');
    ul.className = 'tree';

    const li = document.createElement('li');

    const nodeSpan = document.createElement('span');
    nodeSpan.className = `org-node ${node.type || 'position'}-node`;

    if (level === 0) {
        nodeSpan.classList.add('root');
    } else if (level === 1) {
        nodeSpan.classList.add('level1');
    } else {
        nodeSpan.classList.add('level2');
    }

    // Set node content
    let nodeText = node.label || node.name || '';
    if (node.person && node.person !== nodeText) {
        nodeText += ` - ${node.person}`;
    }
    nodeSpan.textContent = nodeText;

    // Store person name for click handling
    if (node.person) {
        nodeSpan.dataset.personName = node.person;
    }

    li.appendChild(nodeSpan);

    // Add children
    if (node.children && node.children.length > 0) {
        const childUl = document.createElement('ul');
        node.children.forEach(child => {
            const childLi = buildTreeElement(child, level + 1).querySelector('li');
            if (childLi) {
                childUl.appendChild(childLi);
            }
        });
        li.appendChild(childUl);
    }

    ul.appendChild(li);
    return ul;
}

// Initialize interactions
function initOrgChartInteractions() {
    const nodes = document.querySelectorAll('.org-node[data-person-name]');

    nodes.forEach(node => {
        const personName = node.dataset.personName;

        // Hover tooltip
        node.addEventListener('mouseenter', (e) => {
            showTooltip(e, personName);
        });

        node.addEventListener('mouseleave', () => {
            hideTooltip();
        });

        // Click to highlight
        node.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleHighlight(personName);
        });
    });

    // Click outside to clear
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.org-node')) {
            clearAllHighlights();
        }
    });
}

// Show tooltip
function showTooltip(event, personName) {
    const tooltip = document.getElementById('custom-tooltip');
    if (!tooltip) return;

    const nodes = document.querySelectorAll(`.org-node[data-person-name="${personName}"]`);
    if (nodes.length > 1) {
        const positions = Array.from(nodes).map(n => {
            // Get position from parent or node text
            const text = n.textContent;
            return text.split(' - ')[0];
        });

        tooltip.innerHTML = `<strong>${personName}</strong> (겸직 ${positions.length}개)<br>`;
        positions.forEach(pos => {
            tooltip.innerHTML += `• ${pos}<br>`;
        });

        tooltip.style.display = 'block';
        tooltip.style.left = (event.pageX + 15) + 'px';
        tooltip.style.top = (event.pageY + 15) + 'px';
    }
}

// Hide tooltip
function hideTooltip() {
    const tooltip = document.getElementById('custom-tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

// Toggle highlight
function toggleHighlight(personName) {
    const nodes = document.querySelectorAll(`.org-node[data-person-name="${personName}"]`);

    if (nodes.length < 2) return; // No concurrent positions

    if (OrgChartApp.selectedPerson === personName) {
        // Deselect
        clearAllHighlights();
    } else {
        // Clear previous and select new
        clearAllHighlights();
        nodes.forEach(node => {
            node.classList.add('selected');
        });
        OrgChartApp.selectedPerson = personName;
    }
}

// Clear all highlights
function clearAllHighlights() {
    document.querySelectorAll('.org-node.selected').forEach(node => {
        node.classList.remove('selected');
    });
    OrgChartApp.selectedPerson = null;
}

// Dummy functions for compatibility (not used in tree view)
function orgZoomIn() {
    console.log('Zoom not applicable in tree view');
}

function orgZoomOut() {
    console.log('Zoom not applicable in tree view');
}

function orgResetZoom() {
    console.log('Zoom not applicable in tree view');
}
