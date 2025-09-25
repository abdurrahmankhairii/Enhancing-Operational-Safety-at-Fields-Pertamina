// app.js: Enhanced interactions - smooth transitions, tooltips, confirmations for elegance and usability
document.addEventListener("DOMContentLoaded", function() {
    // --- Konfigurasi Awal & Cek Otentikasi ---
    const API_URL = 'http://127.0.0.1:8000';
    const token = localStorage.getItem('accessToken');
    
    if (!token && !window.location.pathname.endsWith('login.html')) {
        window.location.href = 'login.html';
        return;
    }

    // --- Variabel Global untuk Elemen & Status ---
    let dashboardWs = null;
    let enrollWs = null;
    
    const addWorkerModalEl = document.getElementById('addWorkerModal');
    const editWorkerModalEl = document.getElementById('editWorkerModal');
    const workersTableBody = document.getElementById('workersTableBody');
    const enrollmentFeed = document.getElementById('enrollmentFeed');
    const enrollmentStatus = document.getElementById('enrollmentStatus');
    const logoutBtns = document.querySelectorAll('#logoutBtn');
    const addWorkerBtn = document.getElementById('addWorkerBtn');
    
    let addWorkerModal, editWorkerModal;
    if (addWorkerModalEl) {
        addWorkerModal = new bootstrap.Modal(addWorkerModalEl);
    }
    if (editWorkerModalEl) {
        editWorkerModal = new bootstrap.Modal(editWorkerModalEl);
    }

    // Initialize tooltips for elegance
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[title]'));
    const tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // --- Logika Dashboard jika di dashboard.html ---
    if (window.location.pathname.endsWith('dashboard.html')) {
        startDashboardWebSocket();
        loadActivityLogs();  // Load initial
        setInterval(loadActivityLogs, 5000);  // Real-time refresh every 5s
    }

    function loadActivityLogs() {
        const activityLog = document.querySelector('.activity-log');
        if (!activityLog) return;
        fetch(`${API_URL}/api/logs?limit=10&filter=today`, {  // Recent 10 today
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(res => res.json()).then(logs => {
            activityLog.innerHTML = '';
            logs.forEach(log => {
                const statusClass = log.status === 'hijau' ? 'alert-success' : log.status === 'orange' ? 'alert-warning' : 'alert-danger';
                activityLog.innerHTML += `
                    <div class="log-item alert ${statusClass}">
                        <div class="log-time">${new Date(log.timestamp).toLocaleTimeString()}</div>
                        <div class="log-details">${log.name} - ${log.description}</div>
                        <div class="log-action"><button class="btn btn-sm btn-outline-secondary">View</button></div>
                    </div>`;
            });
        }).catch(err => console.error(err));
    }

    function startDashboardWebSocket() {
        if (dashboardWs) return;
        
        dashboardWs = new WebSocket(API_URL.replace('http', 'ws') + '/ws/dashboard');
        const videoFeed = document.getElementById('videoFeed');
        const userInfoPanel = document.getElementById('userInfoPanel');
        const userNameEl = document.getElementById('userName');
        const ppeListEl = document.getElementById('ppeList');

        dashboardWs.onopen = () => {
            console.log("Dashboard WebSocket Connected");
            videoFeed.src = 'https://via.placeholder.com/1280x720.png?text=Live+Feed...';
        };
        dashboardWs.onclose = () => {
            console.log("Dashboard WebSocket Disconnected");
            userInfoPanel.classList.add('d-none');
            videoFeed.src = 'https://via.placeholder.com/1280x720.png?text=Disconnected';
            dashboardWs = null;
        };

        dashboardWs.onmessage = (event) => {
            if (event.data instanceof Blob) {
                const urlObject = URL.createObjectURL(event.data);
                videoFeed.src = urlObject;
                videoFeed.onload = () => URL.revokeObjectURL(urlObject);
            } else {
                try {
                    const data = JSON.parse(event.data);
                    updateUserInfoPanel(data, userInfoPanel, userNameEl, ppeListEl);
                } catch (e) { /* Abaikan pesan non-JSON */ }
            }
        };
    }

    function updateUserInfoPanel(data, panelEl, nameEl, listEl) {
        if (!data || !data.users || data.users.length === 0) {
            panelEl.classList.add('d-none');
            return;
        }

        // Display first user for panel; handle multiple if needed
        const firstUser = data.users[0];
        panelEl.classList.remove('d-none');
        nameEl.textContent = `${firstUser.user.name} - ${firstUser.user.role} @ ${firstUser.user.company}`;

        panelEl.classList.remove('status-hijau', 'status-orange', 'status-merah');
        const overallStatus = firstUser.ppe_status.overall;
        panelEl.classList.add(`status-${overallStatus}`);

        let ppeHtml = '';
        const createListItem = (name, detected) => {
            const statusText = detected ? 'Memakai' : 'Tidak Memakai';
            const iconClass = detected ? 'fa-check text-success' : 'fa-times text-danger';
            const imagePath = `images/${name.toLowerCase().replace(' ', '-')}.jpg`;
            const statusColor = detected ? 'text-success' : 'text-danger';
            return `
                <div class="ppe-list-item">
                    <div class="item-details">
                        <img src="${imagePath}" alt="${name}">
                        <span class="fw-medium">${name}</span>
                    </div>
                    <span class="item-status ${statusColor}"><i class="fas ${iconClass} me-2"></i>${statusText}</span>
                </div>`;
        };
        
        ppeHtml += '<h6>APD Wajib</h6>';
        for (const [item, isDetected] of Object.entries(firstUser.ppe_status.wajib)) {
            ppeHtml += createListItem(item.charAt(0).toUpperCase() + item.slice(1), isDetected);
        }

        ppeHtml += '<h6 class="mt-3">APD Opsional</h6>';
        for (const [item, isDetected] of Object.entries(firstUser.ppe_status.opsional)) {
            let name = item.replace('-', ' ');
            name = name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            ppeHtml += createListItem(name, isDetected);
        }

        listEl.innerHTML = ppeHtml;
    }

    function stopDashboardWebSocket() {
        if (dashboardWs) {
            dashboardWs.close();
            dashboardWs = null;
        }
    }
    
    // --- Logika CCTV jika di cctv.html ---
    if (window.location.pathname.endsWith('cctv.html')) {
        let currentLayout = 1;
        loadCctvs();

        const addCctvBtn = document.getElementById('addCctvBtn');
        const addCctvModalEl = document.getElementById('addCctvModal');
        let addCctvModal;
        if (addCctvModalEl) {
            addCctvModal = new bootstrap.Modal(addCctvModalEl);
        }

        if (addCctvBtn) {
            addCctvBtn.addEventListener('click', () => addCctvModal.show());
        }

        const saveCctvBtn = document.getElementById('saveCctvBtn');
        if (saveCctvBtn) {
            saveCctvBtn.addEventListener('click', async () => {
                const cctvData = {
                    name: document.getElementById('cctvName').value,
                    ip_address: document.getElementById('ipAddress').value,
                    location: document.getElementById('location').value,
                    port: document.getElementById('port').value,
                    username: document.getElementById('username').value,
                    password: document.getElementById('password').value
                };
                if (!cctvData.name || !cctvData.ip_address || !cctvData.location) {
                    alert('Please fill all fields.');
                    return;
                }
                try {
                    const response = await fetch(`${API_URL}/api/cctv`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(cctvData)
                    });
                    if (response.ok) {
                        addCctvModal.hide();
                        document.getElementById('addCctvForm').reset();
                        loadCctvs();
                        // Success feedback
                        const btn = event.target;
                        const originalText = btn.innerHTML;
                        btn.innerHTML = '<i class="fas fa-check me-2"></i>Saved!';
                        btn.classList.add('btn-success');
                        setTimeout(() => {
                            btn.innerHTML = originalText;
                            btn.classList.remove('btn-success');
                        }, 2000);
                    }
                } catch (error) {
                    console.error("Error adding CCTV:", error);
                    alert('Error adding CCTV. Please try again.');
                }
            });
        }

        const cctvTableBody = document.getElementById('cctvTableBody');
        if (cctvTableBody) {
            cctvTableBody.addEventListener('change', (e) => {
                if (e.target.type === 'checkbox') {
                    updateCctvGrid(currentLayout);
                }
            });
        }

        const layoutBtns = document.querySelectorAll('.layout-btn');
        layoutBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                layoutBtns.forEach(b => b.classList.remove('btn-primary', 'btn-secondary'));
                e.target.classList.add('btn-primary');
                e.target.classList.remove('btn-outline-secondary');
                currentLayout = parseInt(e.target.dataset.layout);
                updateCctvGrid(currentLayout);
            });
        });
    }

    async function loadCctvs() {
        const cctvTableBody = document.getElementById('cctvTableBody');
        if (!cctvTableBody) return;
        try {
            const response = await fetch(`${API_URL}/api/cctv`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const cctvs = await response.json();
            cctvTableBody.innerHTML = '';
            cctvs.forEach(c => {
                cctvTableBody.innerHTML += `
                    <tr>
                        <td><input type="checkbox" data-id="${c.id}" data-ip="${c.ip_address}" class="form-check-input"></td>
                        <td><strong>${c.name}</strong></td>
                        <td><code class="small">${c.ip_address}</code></td>
                        <td>${c.location}</td>
                    </tr>`;
            });
        } catch (error) {
            console.error("Error loading CCTVs:", error);
            cctvTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Failed to load CCTVs</td></tr>`;
        }
    }

    function updateCctvGrid(layout) {
        const selectedCheckboxes = document.querySelectorAll('#cctvTableBody input[type="checkbox"]:checked');
        const selectedIps = Array.from(selectedCheckboxes).map(cb => cb.dataset.ip);
        const grid = document.getElementById('cctvGrid');
        grid.innerHTML = '';
        const numStreams = Math.min(layout, selectedIps.length);
        if (numStreams === 0) return;

        let rows = 1, cols = 1;
        if (layout === 1) { rows = 1; cols = 1; }
        else if (layout === 2) { rows = 1; cols = 2; }
        else if (layout === 4) { rows = 2; cols = 2; }
        else if (layout === 9) { rows = 3; cols = 3; }

        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        grid.style.height = '100%';  // Full height
        grid.style.display = 'grid';  // Ensure grid

        selectedIps.slice(0, layout).forEach(ip => {
            const videoDiv = document.createElement('div');
            const img = document.createElement('img');
            img.src = ip;
            img.alt = 'CCTV Stream';
            videoDiv.appendChild(img);
            grid.appendChild(videoDiv);
        });
    }

    // For history page
    if (window.location.pathname.endsWith('history.html')) {
        const filterSelect = document.getElementById('historyFilter');
        if (filterSelect) {
            filterSelect.addEventListener('change', loadHistoryLogs);
        }
        const loadBtn = document.getElementById('loadHistoryBtn');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => {
                const start = document.getElementById('startDate').value;
                const end = document.getElementById('endDate').value;
                loadHistoryLogs(start, end);
            });
        }
        loadHistoryLogs();
    }

    async function loadHistoryLogs(start = null, end = null) {
        const historyTableBody = document.getElementById('historyTableBody');
        if (!historyTableBody) return;
        let url = `${API_URL}/api/logs?limit=100`;
        const filter = document.getElementById('historyFilter') ? document.getElementById('historyFilter').value : 'all';
        if (start && end) {
            url += `&start_date=${start}&end_date=${end}`;
        } else {
            url += `&filter=${filter}`;
        }
        try {
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const logs = await response.json();
            historyTableBody.innerHTML = '';
            logs.forEach(log => {
                const statusBadge = log.status === 'hijau' ? '<span class="badge bg-success">Hijau</span>' :
                                    log.status === 'orange' ? '<span class="badge bg-warning">Orange</span>' :
                                    '<span class="badge bg-danger">Merah</span>';
                const descHtml = log.description.replace(/<b style='color:red'>(.*?)<\/b>/g, '<b class="text-danger">$1</b>').replace(/<b style='color:orange'>(.*?)<\/b>/g, '<b class="text-warning">$1</b>');
                historyTableBody.innerHTML += `
                    <tr>
                        <td>${new Date(log.timestamp).toLocaleString()}</td>
                        <td>${log.name}</td>
                        <td>${statusBadge}</td>
                        <td>${descHtml}</td>
                        <td>${log.role}</td>
                        <td>${log.company}</td>
                    </tr>`;
            });
        } catch (error) {
            console.error("Error loading history logs:", error);
            historyTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Failed to load history</td></tr>`;
        }
    }

    // --- Logika Halaman Workers (CRUD) jika di users.html ---
    if (window.location.pathname.endsWith('users.html')) {
        loadWorkers();
    }

    async function loadWorkers() {
        if (!workersTableBody) return;
        try {
            const response = await fetch(`${API_URL}/api/workers`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error("Failed to fetch workers");
            
            const workers = await response.json();
            workersTableBody.innerHTML = '';
            
            if (workers.length === 0) {
                workersTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No workers found. <a href="#" class="text-primary" data-bs-toggle="modal" data-bs-target="#addWorkerModal">Add the first worker</a> to begin.</td></tr>`;
                return;
            }

            workers.forEach(w => {
                const statusBadge = w.status_sim_l === 'Aktif'
                    ? `<span class="badge bg-success">Aktif</span>`
                    : `<span class="badge bg-danger">Tidak Aktif</span>`;

                workersTableBody.innerHTML += `
                    <tr class="align-middle">
                        <td><strong class="text-primary">${w.employee_id}</strong></td>
                        <td>${w.name}</td>
                        <td><span class="badge bg-light text-dark">${w.company}</span></td>
                        <td>${w.role}</td>
                        <td>${statusBadge}</td>
                        <td>
                            <button class="btn btn-info btn-sm edit-worker-btn me-1" data-id="${w.id}" title="Edit Worker" data-bs-toggle="tooltip" data-bs-placement="top">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-danger btn-sm delete-worker-btn" data-id="${w.id}" title="Delete Worker" data-bs-toggle="tooltip" data-bs-placement="top">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>`;
            });

            // Re-init tooltips after dynamic content
            const newTooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
            newTooltipTriggerList.map(function (tooltipTriggerEl) {
                return new bootstrap.Tooltip(tooltipTriggerEl);
            });
        } catch (error) {
            console.error("Error loading workers:", error);
            workersTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">Failed to load workers. <button class="btn btn-sm btn-outline-primary" onclick="location.reload()">Retry</button></td></tr>`;
        }
    }

    if (workersTableBody) {
        workersTableBody.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-worker-btn');
            const deleteBtn = e.target.closest('.delete-worker-btn');

            if (editBtn) {
                const workerId = editBtn.dataset.id;
                try {
                    const response = await fetch(`${API_URL}/api/workers/${workerId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const worker = await response.json();
                    
                    document.getElementById('editWorkerId').value = worker.id;
                    document.getElementById('editEmployeeId').value = worker.employee_id;
                    document.getElementById('editName').value = worker.name;
                    document.getElementById('editCompany').value = worker.company;
                    document.getElementById('editRole').value = worker.role;
                    document.getElementById('editStatusSimL').value = worker.status_sim_l;

                    editWorkerModal.show();
                } catch (error) {
                    console.error("Error fetching worker:", error);
                    alert('Error loading worker data.');
                }
            }

            if (deleteBtn) {
                const workerId = deleteBtn.dataset.id;
                const workerName = deleteBtn.closest('tr').children[1].textContent;
                const confirmed = confirm(`Are you sure you want to delete ${workerName}? This action cannot be undone.`);
                if (confirmed) {
                    try {
                        const response = await fetch(`${API_URL}/api/workers/${workerId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            loadWorkers();
                            // Success feedback
                            deleteBtn.innerHTML = '<i class="fas fa-check"></i>';
                            deleteBtn.classList.remove('btn-danger');
                            deleteBtn.classList.add('btn-success');
                            setTimeout(() => {
                                deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                                deleteBtn.classList.remove('btn-success');
                                deleteBtn.classList.add('btn-danger');
                            }, 1500);
                        } else {
                            alert('Error deleting worker.');
                        }
                    } catch (error) {
                        console.error("Error deleting worker:", error);
                        alert('Error deleting worker. Please try again.');
                    }
                }
            }
        });
    }
    
    const saveChangesBtn = document.getElementById('saveChangesBtn');
    if (saveChangesBtn) {
        saveChangesBtn.addEventListener('click', async () => {
            const workerId = document.getElementById('editWorkerId').value;
            const workerData = {
                employee_id: document.getElementById('editEmployeeId').value,
                name: document.getElementById('editName').value,
                company: document.getElementById('editCompany').value,
                role: document.getElementById('editRole').value,
                status_sim_l: document.getElementById('editStatusSimL').value
            };

            if (!workerData.name || !workerData.company) {
                alert('Please fill required fields.');
                return;
            }

            try {
                const response = await fetch(`${API_URL}/api/workers/${workerId}`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(workerData)
                });
                if (response.ok) {
                    editWorkerModal.hide();
                    loadWorkers();
                    // Success feedback
                    const btn = event.target;
                    const originalText = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-check me-2"></i>Updated!';
                    btn.classList.add('btn-success');
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.classList.remove('btn-success');
                    }, 2000);
                }
            } catch (error) {
                console.error("Error updating worker:", error);
                alert('Error updating worker.');
            }
        });
    }

    if (addWorkerBtn) {
        addWorkerBtn.addEventListener('click', () => addWorkerModal.show());
    }
    
    // --- Logika Modal Pendaftaran (Enrollment) ---
    if (addWorkerModalEl) {
        addWorkerModalEl.addEventListener('shown.bs.modal', () => {
            startEnrollmentWebSocket();
        });
        addWorkerModalEl.addEventListener('hidden.bs.modal', () => {
            stopEnrollmentWebSocket();
            document.getElementById('addWorkerForm').reset();
            enrollmentStatus.textContent = '';
            enrollmentStatus.className = 'mt-2 fw-bold text-muted';
        });
    }

    function startEnrollmentWebSocket() {
        if (enrollWs) return;
        const wsUrl = API_URL.replace('http', 'ws') + '/ws/enroll';
        enrollWs = new WebSocket(wsUrl);

        enrollWs.onopen = () => {
            enrollmentStatus.textContent = "Camera ready. Position your face in the frame.";
            enrollmentStatus.className = 'mt-2 fw-bold text-success';
        };

        enrollWs.onmessage = (event) => {
            if (event.data instanceof Blob) {
                enrollmentFeed.src = URL.createObjectURL(event.data);
            } else {
                const data = JSON.parse(event.data);
                enrollmentStatus.textContent = data.message;
                enrollmentStatus.className = `mt-2 fw-bold text-${data.status === 'success' ? 'success' : 'danger'}`;
                if (data.status === 'success') {
                    setTimeout(() => {
                        addWorkerModal.hide();
                        loadWorkers();
                    }, 2000);
                }
            }
        };
        
        enrollWs.onerror = (event) => {
            console.error("WebSocket Error:", event);
            enrollmentStatus.textContent = "Failed to connect to camera. Check backend connection.";
            enrollmentStatus.className = 'mt-2 fw-bold text-danger';
        };
        
        enrollWs.onclose = () => {
            enrollmentFeed.src = 'https://via.placeholder.com/640x480.png?text=Connection+Closed';
            enrollWs = null;
        };
    }

    function stopEnrollmentWebSocket() {
        if (enrollWs) {
            enrollWs.close();
            enrollWs = null;
        }
    }
    
    const captureBtn = document.getElementById('captureBtn');
    if (captureBtn) {
        captureBtn.addEventListener('click', () => {
            const workerData = {
                employee_id: document.getElementById('employeeId').value,
                name: document.getElementById('name').value,
                company: document.getElementById('company').value,
                role: document.getElementById('role').value,
                status_sim_l: document.getElementById('statusSimL').value
            };

            if (!workerData.employee_id || !workerData.name || !workerData.company || !workerData.role) {
                alert('Please fill all worker details before capturing.');
                return;
            }

            if (enrollWs && enrollWs.readyState === WebSocket.OPEN) {
                enrollWs.send(JSON.stringify({ command: 'capture', ...workerData }));
                enrollmentStatus.textContent = "Capturing face... Please hold still.";
                enrollmentStatus.className = 'mt-2 fw-bold text-info';
            } else {
                enrollmentStatus.textContent = "Connection error. Cannot capture.";
                enrollmentStatus.className = 'mt-2 fw-bold text-danger';
            }
        });
    }
    
    // --- Logika Logout ---
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('Are you sure you want to log out?')) {
                localStorage.clear();
                window.location.href = 'login.html';
            }
        });
    });

    // Global smooth scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});