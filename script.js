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
 
 / /   - - -   D u a l   V i e w   L o g i c   - - -  
  
 f u n c t i o n   s w i t c h V i e w ( v i e w N a m e )   {  
         c o n s t   r e p o r t S e c t i o n   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' r e p o r t - s e c t i o n ' ) ;  
         c o n s t   o r g C h a r t S e c t i o n   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' o r g - c h a r t - s e c t i o n ' ) ;  
         c o n s t   b t n s   =   d o c u m e n t . q u e r y S e l e c t o r A l l ( ' . v i e w - t o g g l e - b t n ' ) ;  
  
         b t n s . f o r E a c h ( b t n   = >   b t n . c l a s s L i s t . r e m o v e ( ' a c t i v e ' ) ) ;  
  
         i f   ( v i e w N a m e   = = =   ' t a b l e ' )   {  
                 r e p o r t S e c t i o n . s t y l e . d i s p l a y   =   ' b l o c k ' ;  
                 o r g C h a r t S e c t i o n . s t y l e . d i s p l a y   =   ' n o n e ' ;  
                 b t n s [ 0 ] . c l a s s L i s t . a d d ( ' a c t i v e ' ) ;  
         }   e l s e   {  
                 r e p o r t S e c t i o n . s t y l e . d i s p l a y   =   ' n o n e ' ;  
                 o r g C h a r t S e c t i o n . s t y l e . d i s p l a y   =   ' b l o c k ' ;  
                 b t n s [ 1 ] . c l a s s L i s t . a d d ( ' a c t i v e ' ) ;  
  
                 / /   R e n d e r   o r g   c h a r t   i f   n o t   a l r e a d y   r e n d e r e d  
                 i f   ( d o c u m e n t . g e t E l e m e n t B y I d ( ' o r g - c h a r t - c a n v a s ' ) . c h i l d r e n . l e n g t h   < =   1 )   {   / /   O n l y   S V G   e x i s t s  
                         i f   ( c u r r e n t P r o c e s s e d D a t a )   {  
                                 r e n d e r O r g C h a r t ( c u r r e n t P r o c e s s e d D a t a ) ;  
                         }   e l s e   {  
                                 / /   T r y   t o   l o a d   d a t a   i f   n o t   p r e s e n t   ( V i e w e r   m o d e )  
                                 f e t c h ( ' p r o f e s s o r _ d a t a . j s o n ? t = '   +   n e w   D a t e ( ) . g e t T i m e ( ) )  
                                         . t h e n ( r e s   = >   r e s . j s o n ( ) )  
                                         . t h e n ( d a t a   = >   {  
                                                 c u r r e n t P r o c e s s e d D a t a   =   d a t a ;  
                                                 r e n d e r O r g C h a r t ( d a t a ) ;  
                                         } )  
                                         . c a t c h ( e r r   = >   c o n s o l e . e r r o r ( e r r ) ) ;  
                         }  
                 }  
         }  
 }  
  
 / /   - - -   O r g   C h a r t   L o g i c   - - -  
  
 l e t   c u r r e n t Z o o m   =   1 ;  
 c o n s t   Z O O M _ S T E P   =   0 . 1 ;  
  
 f u n c t i o n   z o o m I n ( )   {  
         c u r r e n t Z o o m   + =   Z O O M _ S T E P ;  
         a p p l y Z o o m ( ) ;  
 }  
  
 f u n c t i o n   z o o m O u t ( )   {  
         i f   ( c u r r e n t Z o o m   >   0 . 2 )   {  
                 c u r r e n t Z o o m   - =   Z O O M _ S T E P ;  
                 a p p l y Z o o m ( ) ;  
         }  
 }  
  
 f u n c t i o n   r e s e t Z o o m ( )   {  
         c u r r e n t Z o o m   =   1 ;  
         a p p l y Z o o m ( ) ;  
 }  
  
 f u n c t i o n   a p p l y Z o o m ( )   {  
         c o n s t   c a n v a s   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' o r g - c h a r t - c a n v a s ' ) ;  
         c a n v a s . s t y l e . t r a n s f o r m   =   ` s c a l e ( $ { c u r r e n t Z o o m } ) ` ;  
         c a n v a s . s t y l e . t r a n s f o r m O r i g i n   =   ' t o p   c e n t e r ' ;  
 }  
  
 f u n c t i o n   r e n d e r O r g C h a r t ( d a t a )   {  
         c o n s t   c a n v a s   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' o r g - c h a r t - c a n v a s ' ) ;  
         c o n s t   s v g   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' o r g - c o n n e c t i o n s ' ) ;  
  
         / /   C l e a r   e x i s t i n g   n o d e s   ( k e e p   S V G )  
         A r r a y . f r o m ( c a n v a s . c h i l d r e n ) . f o r E a c h ( c h i l d   = >   {  
                 i f   ( c h i l d . t a g N a m e   ! = =   ' s v g ' )   c a n v a s . r e m o v e C h i l d ( c h i l d ) ;  
         } ) ;  
         s v g . i n n e r H T M L   =   ' ' ;  
  
         / /   B u i l d   H i e r a r c h y  
         c o n s t   h i e r a r c h y   =   b u i l d H i e r a r c h y ( d a t a ) ;  
  
         / /   L a y o u t   C a l c u l a t i o n  
         c o n s t   L E V E L _ H E I G H T   =   1 5 0 ;  
         c o n s t   N O D E _ W I D T H   =   1 8 0 ;  
         c o n s t   S I B L I N G _ G A P   =   2 0 ;  
  
         / /   C a l c u l a t e   p o s i t i o n s  
         l e t   m a x X   =   0 ;  
         l e t   m a x Y   =   0 ;  
  
         f u n c t i o n   c a l c u l a t e L a y o u t ( n o d e ,   l e v e l ,   s t a r t X )   {  
                 l e t   c u r r e n t X   =   s t a r t X ;  
                 l e t   w i d t h   =   N O D E _ W I D T H ;  
  
                 i f   ( n o d e . c h i l d r e n   & &   n o d e . c h i l d r e n . l e n g t h   >   0 )   {  
                         l e t   c h i l d r e n W i d t h   =   0 ;  
                         n o d e . c h i l d r e n . f o r E a c h ( c h i l d   = >   {  
                                 c o n s t   c h i l d D i m s   =   c a l c u l a t e L a y o u t ( c h i l d ,   l e v e l   +   1 ,   c u r r e n t X ) ;  
                                 c u r r e n t X   + =   c h i l d D i m s . w i d t h   +   S I B L I N G _ G A P ;  
                                 c h i l d r e n W i d t h   + =   c h i l d D i m s . w i d t h   +   S I B L I N G _ G A P ;  
                         } ) ;  
                         c h i l d r e n W i d t h   - =   S I B L I N G _ G A P ;   / /   R e m o v e   l a s t   g a p  
  
                         / /   C e n t e r   p a r e n t   a b o v e   c h i l d r e n  
                         n o d e . x   =   s t a r t X   +   ( c h i l d r e n W i d t h   /   2 )   -   ( N O D E _ W I D T H   /   2 ) ;  
                         w i d t h   =   M a t h . m a x ( N O D E _ W I D T H ,   c h i l d r e n W i d t h ) ;  
                 }   e l s e   {  
                         n o d e . x   =   s t a r t X ;  
                 }  
  
                 n o d e . y   =   l e v e l   *   L E V E L _ H E I G H T   +   5 0 ;  
  
                 m a x X   =   M a t h . m a x ( m a x X ,   n o d e . x   +   N O D E _ W I D T H ) ;  
                 m a x Y   =   M a t h . m a x ( m a x Y ,   n o d e . y   +   L E V E L _ H E I G H T ) ;  
  
                 r e t u r n   {   w i d t h :   w i d t h ,   x :   n o d e . x   } ;  
         }  
  
         / /   P o s i t i o n   R o o t   N o d e s  
         l e t   c u r r e n t R o o t X   =   5 0 ;  
         h i e r a r c h y . f o r E a c h ( r o o t   = >   {  
                 c o n s t   d i m s   =   c a l c u l a t e L a y o u t ( r o o t ,   0 ,   c u r r e n t R o o t X ) ;  
                 c u r r e n t R o o t X   + =   d i m s . w i d t h   +   5 0 ;   / /   G a p   b e t w e e n   r o o t   t r e e s  
         } ) ;  
  
         / /   D r a w   N o d e s   a n d   C o n n e c t i o n s  
         h i e r a r c h y . f o r E a c h ( r o o t   = >   {  
                 d r a w T r e e ( r o o t ,   c a n v a s ,   s v g ) ;  
         } ) ;  
  
         / /   A d j u s t   c a n v a s   s i z e  
         c a n v a s . s t y l e . w i d t h   =   ` $ { M a t h . m a x ( c u r r e n t R o o t X ,   1 2 0 0 ) } p x ` ;  
         c a n v a s . s t y l e . h e i g h t   =   ` $ { m a x Y   +   1 0 0 } p x ` ;  
 }  
  
 f u n c t i o n   b u i l d H i e r a r c h y ( d a t a )   {  
         c o n s t   r o o t s   =   [ ] ;  
         c o n s t   c a t e g o r y M a p   =   { } ;  
  
         / /   H e l p e r   t o   g e t   o r   c r e a t e   c a t e g o r y   n o d e  
         f u n c t i o n   g e t C a t e g o r y N o d e ( c a t N a m e )   {  
                 i f   ( ! c a t e g o r y M a p [ c a t N a m e ] )   {  
                         c o n s t   n o d e   =   {  
                                 i d :   ` c a t - $ { c a t N a m e } ` ,  
                                 t y p e :   ' c a t e g o r y ' ,  
                                 l a b e l :   c a t N a m e ,  
                                 c h i l d r e n :   [ ]  
                         } ;  
                         c a t e g o r y M a p [ c a t N a m e ]   =   n o d e ;  
                         r o o t s . p u s h ( n o d e ) ;  
                 }  
                 r e t u r n   c a t e g o r y M a p [ c a t N a m e ] ;  
         }  
  
         / /   P r o c e s s   a l l   r o w s  
         d a t a . r o w s . f o r E a c h ( r o w   = >   {  
                 [ ' l e f t ' ,   ' r i g h t ' ] . f o r E a c h ( s i d e   = >   {  
                         c o n s t   i t e m   =   r o w [ s i d e ] ;  
                         i f   ( i t e m . c a t e g o r y   & &   i t e m . p o s i t i o n )   {  
                                 c o n s t   c a t N o d e   =   g e t C a t e g o r y N o d e ( i t e m . c a t e g o r y ) ;  
  
                                 / /   C h e c k   i f   p o s i t i o n   n o d e   a l r e a d y   e x i s t s   u n d e r   t h i s   c a t e g o r y  
                                 l e t   p o s N o d e   =   c a t N o d e . c h i l d r e n . f i n d ( c   = >   c . l a b e l   = = =   i t e m . p o s i t i o n ) ;  
  
                                 i f   ( ! p o s N o d e )   {  
                                         p o s N o d e   =   {  
                                                 i d :   ` p o s - $ { i t e m . c a t e g o r y } - $ { i t e m . p o s i t i o n } ` ,  
                                                 t y p e :   ' p o s i t i o n ' ,  
                                                 l a b e l :   i t e m . p o s i t i o n ,  
                                                 p e r s o n :   i t e m . n a m e ,  
                                                 p e r i o d :   i t e m . p e r i o d ,  
                                                 c h i l d r e n :   [ ]  
                                         } ;  
                                         c a t N o d e . c h i l d r e n . p u s h ( p o s N o d e ) ;  
                                 }   e l s e   i f   ( i t e m . n a m e   & &   ( ! p o s N o d e . p e r s o n   | |   p o s N o d e . p e r s o n   = = =   ' ' ) )   {  
                                         / /   U p d a t e   e m p t y   p o s i t i o n   i f   n a m e   f o u n d   l a t e r  
                                         p o s N o d e . p e r s o n   =   i t e m . n a m e ;  
                                         p o s N o d e . p e r i o d   =   i t e m . p e r i o d ;  
                                 }  
                         }  
                 } ) ;  
         } ) ;  
  
         r e t u r n   r o o t s ;  
 }  
  
 f u n c t i o n   d r a w T r e e ( n o d e ,   c o n t a i n e r ,   s v g )   {  
         / /   D r a w   N o d e  
         c o n s t   e l   =   d o c u m e n t . c r e a t e E l e m e n t ( ' d i v ' ) ;  
         e l . c l a s s N a m e   =   ` o r g - n o d e   $ { n o d e . t y p e } - n o d e ` ;  
         e l . i d   =   n o d e . i d ;  
         e l . s t y l e . l e f t   =   ` $ { n o d e . x } p x ` ;  
         e l . s t y l e . t o p   =   ` $ { n o d e . y } p x ` ;  
  
         l e t   h t m l   =   ` < d i v   c l a s s = " n o d e - h e a d e r " > $ { n o d e . l a b e l } < / d i v > ` ;  
         i f   ( n o d e . t y p e   = = =   ' p o s i t i o n '   & &   n o d e . p e r s o n )   {  
                 h t m l   + =   `  
                         < d i v   c l a s s = " n o d e - b o d y " >  
                                 < d i v   c l a s s = " n o d e - n a m e " > $ { n o d e . p e r s o n } < / d i v >  
                                 < d i v   c l a s s = " n o d e - p e r i o d " > $ { n o d e . p e r i o d   | |   ' ' } < / d i v >  
                         < / d i v >  
                 ` ;  
         }  
         e l . i n n e r H T M L   =   h t m l ;  
  
         / /   A d d   c l i c k   h a n d l e r   f o r   d e t a i l s / e x p a n s i o n   ( f u t u r e )  
         e l . a d d E v e n t L i s t e n e r ( ' c l i c k ' ,   ( e )   = >   {  
                 e . s t o p P r o p a g a t i o n ( ) ;  
                 / /   T o g g l e   s e l e c t e d   s t a t e   o r   s h o w   m o d a l  
                 d o c u m e n t . q u e r y S e l e c t o r A l l ( ' . o r g - n o d e ' ) . f o r E a c h ( n   = >   n . c l a s s L i s t . r e m o v e ( ' s e l e c t e d ' ) ) ;  
                 e l . c l a s s L i s t . a d d ( ' s e l e c t e d ' ) ;  
         } ) ;  
  
         c o n t a i n e r . a p p e n d C h i l d ( e l ) ;  
  
         / /   D r a w   C h i l d r e n  
         i f   ( n o d e . c h i l d r e n )   {  
                 n o d e . c h i l d r e n . f o r E a c h ( c h i l d   = >   {  
                         d r a w T r e e ( c h i l d ,   c o n t a i n e r ,   s v g ) ;  
                         d r a w C o n n e c t i o n ( n o d e ,   c h i l d ,   s v g ) ;  
                 } ) ;  
         }  
 }  
  
 f u n c t i o n   d r a w C o n n e c t i o n ( p a r e n t ,   c h i l d ,   s v g )   {  
         c o n s t   p a r e n t X   =   p a r e n t . x   +   9 0 ;   / /   C e n t e r   o f   1 8 0 p x   w i d t h  
         c o n s t   p a r e n t Y   =   p a r e n t . y   +   ( p a r e n t . t y p e   = = =   ' c a t e g o r y '   ?   4 0   :   8 0 ) ;   / /   A p p r o x   h e i g h t  
  
         c o n s t   c h i l d X   =   c h i l d . x   +   9 0 ;  
         c o n s t   c h i l d Y   =   c h i l d . y ;  
  
         c o n s t   m i d Y   =   ( p a r e n t Y   +   c h i l d Y )   /   2 ;  
  
         c o n s t   p a t h   =   d o c u m e n t . c r e a t e E l e m e n t N S ( ' h t t p : / / w w w . w 3 . o r g / 2 0 0 0 / s v g ' ,   ' p a t h ' ) ;  
         c o n s t   d   =   ` M   $ { p a r e n t X }   $ { p a r e n t Y }    
                               L   $ { p a r e n t X }   $ { m i d Y }    
                               L   $ { c h i l d X }   $ { m i d Y }    
                               L   $ { c h i l d X }   $ { c h i l d Y } ` ;  
  
         p a t h . s e t A t t r i b u t e ( ' d ' ,   d ) ;  
         p a t h . s e t A t t r i b u t e ( ' c l a s s ' ,   ' c o n n e c t i o n - l i n e ' ) ;  
  
         s v g . a p p e n d C h i l d ( p a t h ) ;  
 }  
 