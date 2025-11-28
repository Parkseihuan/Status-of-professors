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

    // Right section headers
    data.headers.right.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        th.className = getColumnClass(header);
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Detect concurrent positions (same person with multiple positions)
    const nameCount = {};
    const nameToConcurrentClass = {};
    const colors = ['concurrent-1', 'concurrent-2', 'concurrent-3', 'concurrent-4',
        'concurrent-5', 'concurrent-6', 'concurrent-7', 'concurrent-8'];
    let colorIndex = 0;

    // Count occurrences of each name
    data.rows.forEach(row => {
        ['left', 'right'].forEach(side => {
            const name = row[side].name;
            if (name && name.trim()) {
                nameCount[name] = (nameCount[name] || 0) + 1;
            }
        });
    });

    // Assign colors to names that appear more than once
    Object.keys(nameCount).forEach(name => {
        if (nameCount[name] > 1) {
            nameToConcurrentClass[name] = colors[colorIndex % colors.length];
            colorIndex++;
        }
    });

    // Create table body
    const tbody = document.createElement('tbody');

    // Track category for rowspan
    let lastLeftCategory = '';
    let leftCategoryRowspan = 0;
    let leftCategoryCell = null;

    let lastRightCategory = '';
    let rightCategoryRowspan = 0;
    let rightCategoryCell = null;

    // First pass: count rowspans
    const leftCategoryGroups = {};
    const rightCategoryGroups = {};

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

        // Left section
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
        leftNameCell.textContent = row.left.name;
        leftNameCell.className = 'col-name';
        // Add concurrent position highlighting
        if (row.left.name && nameToConcurrentClass[row.left.name]) {
            leftNameCell.classList.add(nameToConcurrentClass[row.left.name]);
        }
        tr.appendChild(leftNameCell);

        // Period
        const leftPeriodCell = document.createElement('td');
        leftPeriodCell.textContent = row.left.period;
        leftPeriodCell.className = 'col-period';
        tr.appendChild(leftPeriodCell);

        // Right section
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
        rightNameCell.textContent = row.right.name;
        rightNameCell.className = 'col-name';
        // Add concurrent position highlighting
        if (row.right.name && nameToConcurrentClass[row.right.name]) {
            rightNameCell.classList.add(nameToConcurrentClass[row.right.name]);
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
    container.appendChild(table);
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
