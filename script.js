// Load and render professor data
async function loadData() {
    try {
        const response = await fetch('professor_data.json?t=' + new Date().getTime());
        const data = await response.json();

        // Update title and date
        document.getElementById('page-title').textContent = data.title;
        document.getElementById('page-date').textContent = data.date;

        renderTable(data);
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('table-container').innerHTML =
            '<p style="color: red; text-align: center;">데이터를 불러오는 중 오류가 발생했습니다.</p>';
    }
}

// Global data for tooltips and summary
let professorPositions = {};

// Render the table with two-column layout
function renderTable(data) {
    const container = document.getElementById('table-container');

    // Create table
    const table = document.createElement('table');
    table.className = 'two-column-table';

    // Create table header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    // Left section headers
    data.headers.left.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        th.className = getColumnClass(header);
        headerRow.appendChild(th);
    });

    // Gap header
    const gapTh = document.createElement('th');
    gapTh.className = 'gap-cell col-gap';
    headerRow.appendChild(gapTh);

    // Right section headers
    data.headers.right.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        th.className = getColumnClass(header);
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // 1. Analyze Data (Count and collect positions)
    const nameCount = {};
    professorPositions = {}; // Reset

    data.rows.forEach(row => {
        ['left', 'right'].forEach(side => {
            const name = row[side].name;
            const position = row[side].position;
            if (name && name.trim()) {
                nameCount[name] = (nameCount[name] || 0) + 1;

                if (!professorPositions[name]) professorPositions[name] = [];
                professorPositions[name].push(position);
            }
        });
    });

    // Create table body
    const tbody = document.createElement('tbody');

    // Track category for rowspan
    let lastLeftCategory = '';
    let leftCategoryGroups = {};

    let lastRightCategory = '';
    let rightCategoryGroups = {};

    // First pass: count rowspans
    data.rows.forEach((row, index) => {
        const leftCat = row.left.category;
        const rightCat = row.right.category;

        if (leftCat && leftCat !== '구분') {
            if (!leftCategoryGroups[leftCat]) {
                leftCategoryGroups[leftCat] = { start: index, count: 0 };
            }
            leftCategoryGroups[leftCat].count++;
        }

        if (rightCat && rightCat !== '구분') {
            if (!rightCategoryGroups[rightCat]) {
                rightCategoryGroups[rightCat] = { start: index, count: 0 };
            }
            rightCategoryGroups[rightCat].count++;
        }
    });

    // Second pass: render rows
    data.rows.forEach((row, index) => {

        const tr = document.createElement('tr');

        // --- Left Section ---
        const leftCat = row.left.category;

        // Category cell (with rowspan)
        if (leftCat && leftCat !== lastLeftCategory) {
            const td = document.createElement('td');
            td.textContent = leftCat;
            td.className = 'category-cell col-category';

            if (leftCategoryGroups[leftCat] && leftCategoryGroups[leftCat].count > 1) {
                td.rowSpan = leftCategoryGroups[leftCat].count;
            }

            tr.appendChild(td);
            lastLeftCategory = leftCat;
        } else if (!leftCat) {
            // Empty category, don't add cell (part of rowspan)
        }

        // Position
        const leftPosCell = document.createElement('td');
        leftPosCell.textContent = row.left.position;
        leftPosCell.className = 'col-position';
        tr.appendChild(leftPosCell);

        // Name
        const leftNameCell = document.createElement('td');
        leftNameCell.className = 'col-name';

        if (row.left.name) {
            const name = row.left.name;
            leftNameCell.setAttribute('data-name', name);

            // Concurrent logic
            if (nameCount[name] > 1) {
                leftNameCell.classList.add('concurrent-highlight');
                leftNameCell.innerHTML = `${name} <span class="concurrent-badge">⭐${nameCount[name]}</span>`;
            } else {
                leftNameCell.textContent = name;
            }
        }
        tr.appendChild(leftNameCell);

        // Period
        const leftPeriodCell = document.createElement('td');
        leftPeriodCell.textContent = row.left.period;
        leftPeriodCell.className = 'col-period';
        tr.appendChild(leftPeriodCell);

        // --- Gap Column ---
        const gapTd = document.createElement('td');
        gapTd.className = 'gap-cell col-gap';
        tr.appendChild(gapTd);

        // --- Right Section ---
        const rightCat = row.right.category;

        // Category cell (with rowspan)
        if (rightCat && rightCat !== lastRightCategory) {
            const td = document.createElement('td');
            td.textContent = rightCat;
            td.className = 'category-cell col-category';

            if (rightCategoryGroups[rightCat] && rightCategoryGroups[rightCat].count > 1) {
                td.rowSpan = rightCategoryGroups[rightCat].count;
            }

            tr.appendChild(td);
            lastRightCategory = rightCat;
        } else if (!rightCat) {
            // Empty category, don't add cell (part of rowspan)
        }

        // Position
        const rightPosCell = document.createElement('td');
        rightPosCell.textContent = row.right.position;
        rightPosCell.className = 'col-position';
        tr.appendChild(rightPosCell);

        // Name
        const rightNameCell = document.createElement('td');
        rightNameCell.className = 'col-name';

        if (row.right.name) {
            const name = row.right.name;
            rightNameCell.setAttribute('data-name', name);

            // Concurrent logic
            if (nameCount[name] > 1) {
                rightNameCell.classList.add('concurrent-highlight');
                rightNameCell.innerHTML = `${name} <span class="concurrent-badge">⭐${nameCount[name]}</span>`;
            } else {
                rightNameCell.textContent = name;
            }
        }
        tr.appendChild(rightNameCell);

        // Period
        const rightPeriodCell = document.createElement('td');
        rightPeriodCell.textContent = row.right.period;
        rightPeriodCell.className = 'col-period';
        tr.appendChild(rightPeriodCell);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);

    // Initialize interactions (tooltip, highlight)
    initInteractions();

    // Update summary modal
    updateSummary(nameCount);
}

function initInteractions() {
    const tooltip = document.getElementById('custom-tooltip');
    const nameCells = document.querySelectorAll('.col-name[data-name]');

    nameCells.forEach(cell => {
        const name = cell.getAttribute('data-name');

        // Tooltip & Highlight
        cell.addEventListener('mouseenter', (e) => { // Changed to mouseenter/leave for better performance
            const positions = professorPositions[name];

            // Highlight
            const sameNameCells = document.querySelectorAll(`.col-name[data-name="${name}"]`);
            sameNameCells.forEach(el => el.classList.add('highlight-concurrent'));

            // Tooltip (only if concurrent)
            if (positions && positions.length > 1) {
                tooltip.style.display = 'block';
                // Initial position, will be updated by mousemove
                tooltip.style.left = (e.pageX + 15) + 'px';
                tooltip.style.top = (e.pageY + 15) + 'px';

                let html = `<span class="tooltip-title">${name} (총 ${positions.length}개)</span>`;
                positions.forEach(pos => {
                    html += `• ${pos}<br>`;
                });
                tooltip.innerHTML = html;
            }
        });

        cell.addEventListener('mousemove', (e) => {
            if (tooltip.style.display === 'block') {
                tooltip.style.left = (e.pageX + 15) + 'px';
                tooltip.style.top = (e.pageY + 15) + 'px';
            }
        });

        cell.addEventListener('mouseleave', () => {
            // Remove Highlight
            const sameNameCells = document.querySelectorAll(`.col-name[data-name="${name}"]`);
            sameNameCells.forEach(el => el.classList.remove('highlight-concurrent'));

            // Hide Tooltip
            tooltip.style.display = 'none';
        });
    });
}

function updateSummary(nameCount) {
    const list = document.getElementById('summary-list');
    list.innerHTML = '';

    // Sort by count desc
    const sorted = Object.keys(nameCount)
        .filter(name => nameCount[name] > 1)
        .sort((a, b) => nameCount[b] - nameCount[a]);

    sorted.forEach(name => {
        const li = document.createElement('li');
        li.className = 'summary-item';
        li.innerHTML = `<span>${name}</span> <span class="summary-count">⭐${nameCount[name]}</span>`;
        list.appendChild(li);
    });
}

function toggleSummaryModal() {
    const modal = document.getElementById('summary-modal');
    modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
}

// --- Arrow Drawing Logic ---

let arrowsVisible = false;

function toggleConcurrentArrows() {
    const arrowLayer = document.getElementById('arrow-layer');
    arrowsVisible = !arrowsVisible;

    if (arrowsVisible) {
        arrowLayer.style.display = 'block';
        drawArrows();
        // Redraw on resize
        window.addEventListener('resize', drawArrows);
    } else {
        arrowLayer.style.display = 'none';
        window.removeEventListener('resize', drawArrows);
    }
}

function drawArrows() {
    const svg = document.getElementById('arrow-layer');
    svg.innerHTML = ''; // Clear existing

    // Define arrow marker
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', '#333');
    polygon.setAttribute('opacity', '0.6');

    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);

    // Find concurrent positions
    const nameCells = Array.from(document.querySelectorAll('.col-name[data-name]'));
    const nameGroups = {};

    nameCells.forEach(cell => {
        const name = cell.getAttribute('data-name');
        if (!nameGroups[name]) nameGroups[name] = [];
        nameGroups[name].push(cell);
    });

    // Draw arrows
    Object.keys(nameGroups).forEach(name => {
        const cells = nameGroups[name];
        if (cells.length < 2) return;

        // Sort by vertical position
        cells.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            return rectA.top - rectB.top;
        });

        for (let i = 0; i < cells.length - 1; i++) {
            const startCell = cells[i];
            const endCell = cells[i + 1];

            const startRect = startCell.getBoundingClientRect();
            const endRect = endCell.getBoundingClientRect();
            const containerRect = document.querySelector('.page-container').getBoundingClientRect();

            // Calculate coordinates relative to container
            // Start from bottom center of start cell
            const startX = startRect.left + startRect.width / 2 - containerRect.left;
            const startY = startRect.bottom - containerRect.top;

            // End at top center of end cell
            const endX = endRect.left + endRect.width / 2 - containerRect.left;
            const endY = endRect.top - containerRect.top;

            // Create path
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('class', 'arrow-path');

            // Curve logic
            const controlY1 = startY + 20;
            const controlY2 = endY - 20;

            // If cells are far apart horizontally, curve more
            const d = `M ${startX} ${startY} C ${startX} ${controlY1}, ${endX} ${controlY2}, ${endX} ${endY}`;

            path.setAttribute('d', d);
            svg.appendChild(path);
        }
    });
}

// Get column class based on header name
function getColumnClass(header) {
    if (header === '구분') return 'col-category';
    if (header === '보 직 명') return 'col-position';
    if (header === '성 명') return 'col-name';
    if (header === '기 간') return 'col-period';
    return '';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Load data
    loadData();
});
