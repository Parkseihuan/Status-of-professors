// Global variables
let criteriaFile = null;
let dataFile = null;
let professorPositions = {}; // For tooltips
let currentProcessedData = null; // For download

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const setupContainer = document.getElementById('setup-container');

    if (setupContainer) {
        // Admin Mode
        initDragAndDrop();
        document.getElementById('input-criteria').addEventListener('change', (e) => handleFileSelect(e, 'criteria'));
        document.getElementById('input-data').addEventListener('change', (e) => handleFileSelect(e, 'data'));
        document.getElementById('btn-generate').addEventListener('click', generateReport);
    } else {
        // Viewer Mode
        loadData();
    }
});

// --- Viewer Mode Logic ---
async function loadData() {
    try {
        const response = await fetch('professor_data.json?t=' + new Date().getTime());
        if (!response.ok) throw new Error('데이터 파일을 찾을 수 없습니다.');

        const data = await response.json();

        // Update title and date
        document.getElementById('page-title').textContent = data.title;
        document.getElementById('page-date').textContent = data.date;

        renderTable(data);
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('table-container').innerHTML =
            '<p style="color: red; text-align: center; padding: 20px;">데이터를 불러오는 중 오류가 발생했습니다.<br>관리자 페이지에서 데이터를 생성하여 업로드해주세요.</p>';
    }
}

// --- Admin Mode Logic ---

// Drag & Drop
function initDragAndDrop() {
    const zones = ['drop-zone-criteria', 'drop-zone-data'];

    zones.forEach(id => {
        const zone = document.getElementById(id);
        const input = zone.querySelector('input');

        zone.addEventListener('click', () => input.click());

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');

            if (e.dataTransfer.files.length) {
                const file = e.dataTransfer.files[0];
                const type = id === 'drop-zone-criteria' ? 'criteria' : 'data';
                handleFile(file, type);
            }
        });
    });
}

function handleFileSelect(e, type) {
    if (e.target.files.length) {
        handleFile(e.target.files[0], type);
    }
}

function handleFile(file, type) {
    // Update UI
    const zoneId = type === 'criteria' ? 'drop-zone-criteria' : 'drop-zone-data';
    const nameId = type === 'criteria' ? 'file-name-criteria' : 'file-name-data';

    document.getElementById(zoneId).classList.add('uploaded');
    document.getElementById(nameId).textContent = file.name;

    // Store file
    if (type === 'criteria') criteriaFile = file;
    else dataFile = file;

    // Enable button if both files present
    if (criteriaFile && dataFile) {
        document.getElementById('btn-generate').disabled = false;
    }
}

async function generateReport() {
    const btn = document.getElementById('btn-generate');
    const status = document.getElementById('status-message');

    btn.disabled = true;
    status.textContent = '파일을 분석 중입니다...';
    status.className = 'status-message status-loading';

    try {
        // 1. Read Files
        const criteriaBuffer = await readFile(criteriaFile);
        const dataBuffer = await readFile(dataFile);

        // 2. Parse Excel
        const criteriaWorkbook = XLSX.read(criteriaBuffer, { type: 'array' });
        const dataWorkbook = XLSX.read(dataBuffer, { type: 'array' });

        // 3. Extract Data
        const criteriaSheet = criteriaWorkbook.Sheets[criteriaWorkbook.SheetNames[0]];
        const dataSheet = dataWorkbook.Sheets[dataWorkbook.SheetNames[0]];

        const criteriaJson = XLSX.utils.sheet_to_json(criteriaSheet, { header: 1 });
        const dataJson = XLSX.utils.sheet_to_json(dataSheet, { header: 1 }); // Raw data

        // 4. Process Data
        currentProcessedData = processData(criteriaJson, dataJson, dataFile.name);

        // 5. Render
        document.getElementById('setup-container').style.display = 'none';
        document.getElementById('report-section').style.display = 'block';

        // Update Title and Date
        document.getElementById('page-title').textContent = currentProcessedData.title;
        document.getElementById('page-date').textContent = currentProcessedData.date;

        renderTable(currentProcessedData);

    } catch (error) {
        console.error(error);
        status.textContent = '오류 발생: ' + error.message;
        status.className = 'status-message status-error';
        btn.disabled = false;
    }
}

function downloadJSON() {
    if (!currentProcessedData) {
        alert('저장할 데이터가 없습니다.');
        return;
    }

    const dataStr = JSON.stringify(currentProcessedData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'professor_data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsArrayBuffer(file);
    });
}

// --- Core Business Logic ---

function processData(criteriaRows, rawRows, filename) {
    // 1. Extract Date from Filename
    let dateStr = "2025.10.01."; // Default
    const dateMatch = filename.match(/(\d{8})/);
    if (dateMatch) {
        const d = dateMatch[1];
        dateStr = `${d.substring(0, 4)}.${d.substring(4, 6)}.${d.substring(6, 8)}.`;
    }

    // 2. Process Criteria
    const criteria = [];
    for (let i = 1; i < criteriaRows.length; i++) {
        const row = criteriaRows[i];
        if (!row || row.length < 5) continue;

        if (row[1] || row[4]) {
            criteria.push({
                category: row[1] || '',
                position: row[4] || '',
                original_index: i
            });
        }
    }

    // Fill down category
    let currentCategory = '';
    criteria.forEach(item => {
        if (item.category) currentCategory = item.category;
        else item.category = currentCategory;
    });

    // 3. Process Raw Data
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
        if (rawRows[i] && rawRows[i].includes('성명')) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) throw new Error("데이터 파일에서 '성명' 컬럼을 찾을 수 없습니다.");

    const headers = rawRows[headerRowIndex];
    const nameIdx = headers.indexOf('성명');
    const posIdx = headers.indexOf('발령직위');
    const startIdx = headers.indexOf('발령시작일');
    const endIdx = headers.indexOf('발령종료일');
    const stateIdx = headers.indexOf('발령상태');

    const activePositions = [];

    for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row) continue;

        const name = row[nameIdx];
        const position = row[posIdx];
        const state = stateIdx !== -1 ? row[stateIdx] : '재직';

        if (!name || !position) continue;
        if (state && !state.includes('재직') && !state.includes('유지')) continue;

        activePositions.push({
            name: name,
            position: position.trim(),
            period: `${formatDate(row[startIdx])} ~ ${formatDate(row[endIdx])}`
        });
    }

    // 4. Match Criteria
    const finalRows = [];

    criteria.forEach(crit => {
        const match = findBestMatch(crit.position, activePositions);

        finalRows.push({
            category: crit.category,
            position: crit.position,
            name: match ? match.name : '',
            period: match ? match.period : ''
        });
    });

    // 5. Split into Left/Right
    const midPoint = Math.ceil(finalRows.length / 2);
    const leftRows = finalRows.slice(0, midPoint);
    const rightRows = finalRows.slice(midPoint);

    while (rightRows.length < leftRows.length) {
        rightRows.push({ category: '', position: '', name: '', period: '' });
    }

    const combinedRows = leftRows.map((left, i) => ({
        left: left,
        right: rightRows[i]
    }));

    return {
        title: `교 원 보 직 자 현 황 (${dateStr})`,
        date: `(${dateStr} 현재)`,
        headers: {
            left: ['구분', '보 직 명', '성 명', '기 간'],
            right: ['구분', '보 직 명', '성 명', '기 간']
        },
        rows: combinedRows
    };
}

function formatDate(excelDate) {
    if (!excelDate) return '';
    if (typeof excelDate === 'number') {
        const date = XLSX.SSF.parse_date_code(excelDate);
        return `${date.y}.${String(date.m).padStart(2, '0')}.${String(date.d).padStart(2, '0')}`;
    }
    const str = String(excelDate).replace(/[^0-9]/g, '');
    if (str.length === 8) {
        return `${str.substring(0, 4)}.${str.substring(4, 6)}.${str.substring(6, 8)}`;
    }
    return str;
}

// --- Fuzzy Matching Logic ---

function normalize(str) {
    return str.replace(/\s+/g, '').trim();
}

function findBestMatch(targetPos, activeList) {
    let match = activeList.find(p => p.position === targetPos);
    if (match) return match;

    const targetNorm = normalize(targetPos);
    match = activeList.find(p => normalize(p.position) === targetNorm);
    if (match) return match;

    let bestScore = 0;
    let bestCandidate = null;

    activeList.forEach(p => {
        const score = calculateSimilarity(targetPos, p.position);
        if (score > bestScore) {
            bestScore = score;
            bestCandidate = p;
        }
    });

    if (bestScore > 0.8) return bestCandidate;

    return null;
}

function calculateSimilarity(s1, s2) {
    const n1 = normalize(s1);
    const n2 = normalize(s2);

    if (n1 === n2) return 1.0;
    if (n2.includes(n1)) return 0.9;
    if (n1.includes(n2)) return 0.8;

    return 0;
}

// --- Rendering Logic ---

function renderTable(data) {
    const container = document.getElementById('table-container');

    const table = document.createElement('table');
    table.className = 'two-column-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    data.headers.left.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        th.className = getColumnClass(header);
        headerRow.appendChild(th);
    });

    const gapTh = document.createElement('th');
    gapTh.className = 'gap-cell col-gap';
    headerRow.appendChild(gapTh);

    data.headers.right.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        th.className = getColumnClass(header);
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const nameCount = {};
    professorPositions = {};

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

    const tbody = document.createElement('tbody');

    let lastLeftCategory = '';
    let leftCategoryGroups = {};

    let lastRightCategory = '';
    let rightCategoryGroups = {};

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

    data.rows.forEach((row, index) => {

        const tr = document.createElement('tr');

        const leftCat = row.left.category;

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
        }

        const leftPosCell = document.createElement('td');
        leftPosCell.textContent = row.left.position;
        leftPosCell.className = 'col-position';
        tr.appendChild(leftPosCell);

        const leftNameCell = document.createElement('td');
        leftNameCell.className = 'col-name';

        if (row.left.name) {
            const name = row.left.name;
            leftNameCell.setAttribute('data-name', name);

            if (nameCount[name] > 1) {
                leftNameCell.classList.add('concurrent-highlight');
                leftNameCell.innerHTML = `${name} <span class="concurrent-badge">⭐${nameCount[name]}</span>`;
            } else {
                leftNameCell.textContent = name;
            }
        }
        tr.appendChild(leftNameCell);

        const leftPeriodCell = document.createElement('td');
        leftPeriodCell.textContent = row.left.period;
        leftPeriodCell.className = 'col-period';
        tr.appendChild(leftPeriodCell);

        const gapTd = document.createElement('td');
        gapTd.className = 'gap-cell col-gap';
        tr.appendChild(gapTd);

        const rightCat = row.right.category;

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
        }

        const rightPosCell = document.createElement('td');
        rightPosCell.textContent = row.right.position;
        rightPosCell.className = 'col-position';
        tr.appendChild(rightPosCell);

        const rightNameCell = document.createElement('td');
        rightNameCell.className = 'col-name';

        if (row.right.name) {
            const name = row.right.name;
            rightNameCell.setAttribute('data-name', name);

            if (nameCount[name] > 1) {
                rightNameCell.classList.add('concurrent-highlight');
                rightNameCell.innerHTML = `${name} <span class="concurrent-badge">⭐${nameCount[name]}</span>`;
            } else {
                rightNameCell.textContent = name;
            }
        }
        tr.appendChild(rightNameCell);

        const rightPeriodCell = document.createElement('td');
        rightPeriodCell.textContent = row.right.period;
        rightPeriodCell.className = 'col-period';
        tr.appendChild(rightPeriodCell);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);

    initInteractions();
    updateSummary(nameCount);
}

function initInteractions() {
    const tooltip = document.getElementById('custom-tooltip');
    const nameCells = document.querySelectorAll('.col-name[data-name]');

    nameCells.forEach(cell => {
        const name = cell.getAttribute('data-name');

        cell.addEventListener('mouseenter', (e) => {
            const positions = professorPositions[name];

            const sameNameCells = document.querySelectorAll(`.col-name[data-name="${name}"]`);
            sameNameCells.forEach(el => el.classList.add('highlight-concurrent'));

            if (positions && positions.length > 1) {
                tooltip.style.display = 'block';
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
            const sameNameCells = document.querySelectorAll(`.col-name[data-name="${name}"]`);
            sameNameCells.forEach(el => el.classList.remove('highlight-concurrent'));
            tooltip.style.display = 'none';
        });
    });
}

function updateSummary(nameCount) {
    const list = document.getElementById('summary-list');
    list.innerHTML = '';

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

let arrowsVisible = false;

function toggleConcurrentArrows() {
    const arrowLayer = document.getElementById('arrow-layer');
    arrowsVisible = !arrowsVisible;

    if (arrowsVisible) {
        arrowLayer.style.display = 'block';
        drawArrows();
        window.addEventListener('resize', drawArrows);
    } else {
        arrowLayer.style.display = 'none';
        window.removeEventListener('resize', drawArrows);
    }
}

function drawArrows() {
    const svg = document.getElementById('arrow-layer');
    svg.innerHTML = '';

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

    const nameCells = Array.from(document.querySelectorAll('.col-name[data-name]'));
    const nameGroups = {};

    nameCells.forEach(cell => {
        const name = cell.getAttribute('data-name');
        if (!nameGroups[name]) nameGroups[name] = [];
        nameGroups[name].push(cell);
    });

    Object.keys(nameGroups).forEach(name => {
        const cells = nameGroups[name];
        if (cells.length < 2) return;

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

            const startX = startRect.left + startRect.width / 2 - containerRect.left;
            const startY = startRect.bottom - containerRect.top;

            const endX = endRect.left + endRect.width / 2 - containerRect.left;
            const endY = endRect.top - containerRect.top;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('class', 'arrow-path');

            const controlY1 = startY + 20;
            const controlY2 = endY - 20;

            const d = `M ${startX} ${startY} C ${startX} ${controlY1}, ${endX} ${controlY2}, ${endX} ${endY}`;

            path.setAttribute('d', d);
            svg.appendChild(path);
        }
    });
}

function getColumnClass(header) {
    if (header === '구분') return 'col-category';
    if (header === '보 직 명') return 'col-position';
    if (header === '성 명') return 'col-name';
    if (header === '기 간') return 'col-period';
    return '';
}
