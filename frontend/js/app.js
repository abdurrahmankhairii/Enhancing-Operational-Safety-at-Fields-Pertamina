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

    // --- Logika Dashboard jika di dashboard.html ---
    if (window.location.pathname.endsWith('dashboard.html')) {
        startDashboardWebSocket();
    }

    function startDashboardWebSocket() {
        if (dashboardWs) return;
        
        dashboardWs = new WebSocket(API_URL.replace('http', 'ws') + '/ws/dashboard');
        const videoFeed = document.getElementById('videoFeed');
        const userInfoPanel = document.getElementById('userInfoPanel');
        const userNameEl = document.getElementById('userName');
        const ppeListEl = document.getElementById('ppeList');

        dashboardWs.onopen = () => console.log("Dashboard WebSocket Connected");
        dashboardWs.onclose = () => {
            console.log("Dashboard WebSocket Disconnected");
            userInfoPanel.classList.add('d-none');
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
        if (!data || !data.user || !data.ppe_status) {
            panelEl.classList.add('d-none');
            return;
        }

        panelEl.classList.remove('d-none');
        nameEl.textContent = data.user.name;

        panelEl.classList.remove('status-aman', 'status-peringatan', 'status-bahaya');
        const overallStatus = data.ppe_status.overall;
        panelEl.classList.add(`status-${overallStatus}`);

        let ppeHtml = '';
        const createListItem = (name, detected) => {
            const statusText = detected ? 'Memakai' : 'Tidak Memakai';
            const iconClass = detected ? 'fa-check text-success' : 'fa-times text-danger';
            const imagePath = `images/${name.toLowerCase().replace(' ', '-')}.jpg`;
            return `
                <div class="ppe-list-item">
                    <div class="item-details">
                        <img src="${imagePath}" alt="${name}">
                        <span>${name}</span>
                    </div>
                    <span class="item-status"><i class="fas ${iconClass} me-2"></i>${statusText}</span>
                </div>`;
        };
        
        ppeHtml += '<h6>APD Wajib</h6>';
        for (const [item, isDetected] of Object.entries(data.ppe_status.wajib)) {
            ppeHtml += createListItem(item.charAt(0).toUpperCase() + item.slice(1), isDetected);
        }

        ppeHtml += '<h6 class="mt-3">APD Opsional</h6>';
        for (const [item, isDetected] of Object.entries(data.ppe_status.opsional)) {
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
                    location: document.getElementById('location').value
                };
                if (!cctvData.name || !cctvData.ip_address || !cctvData.location) {
                    alert('Please fill all fields.');
                    return;
                }
                try {
                    await fetch(`${API_URL}/api/cctv`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(cctvData)
                    });
                    addCctvModal.hide();
                    document.getElementById('addCctvForm').reset();
                    loadCctvs();
                } catch (error) {
                    console.error("Error adding CCTV:", error);
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
                        <td><input type="checkbox" data-id="${c.id}" data-ip="${c.ip_address}"></td>
                        <td>${c.name}</td>
                        <td>${c.ip_address}</td>
                        <td>${c.location}</td>
                    </tr>`;
            });
        } catch (error) {
            console.error("Error loading CCTVs:", error);
        }
    }

    function updateCctvGrid(layout) {
        const selectedCheckboxes = document.querySelectorAll('#cctvTableBody input[type="checkbox"]:checked');
        const selectedIps = Array.from(selectedCheckboxes).map(cb => cb.dataset.ip);
        const grid = document.getElementById('cctvGrid');
        grid.innerHTML = '';
        let cols = 1;
        if (layout === 2) cols = 2;
        if (layout === 4) cols = 2;
        if (layout === 9) cols = 3;
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        selectedIps.slice(0, layout).forEach(ip => {
            const div = document.createElement('div');
            const img = document.createElement('img');
            img.src = ip;  // Assuming MJPEG or HTTP stream URL for real-time
            img.alt = 'CCTV Stream';
            img.classList.add('w-100', 'h-100');
            div.appendChild(img);
            grid.appendChild(div);
        });
    }

    // --- Logika Halaman Users (CRUD) jika di users.html ---
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
                workersTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No worker data found. Click 'Add New Worker' to begin.</td></tr>`;
                return;
            }

            workers.forEach(w => {
                const statusBadge = w.status_sim_l === 'Aktif'
                    ? `<span class="badge bg-success">Aktif</span>`
                    : `<span class="badge bg-danger">Tidak Aktif</span>`;

                workersTableBody.innerHTML += `
                    <tr>
                        <td><strong>${w.employee_id}</strong></td>
                        <td>${w.name}</td>
                        <td>${w.company}</td>
                        <td>${w.role}</td>
                        <td>${statusBadge}</td>
                        <td>
                            <button class="btn btn-info btn-sm edit-worker-btn" data-id="${w.id}" title="Edit Worker"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-danger btn-sm delete-worker-btn" data-id="${w.id}" title="Delete Worker"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>`;
            });
        } catch (error) {
            console.error("Error loading workers:", error);
            workersTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Failed to load data. Is the backend running?</td></tr>`;
        }
    }

    if (workersTableBody) {
        workersTableBody.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-worker-btn');
            const deleteBtn = e.target.closest('.delete-worker-btn');

            if (editBtn) {
                const workerId = editBtn.dataset.id;
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
            }

            if (deleteBtn) {
                const workerId = deleteBtn.dataset.id;
                const workerName = deleteBtn.closest('tr').children[1].textContent;
                
                if (confirm(`Are you sure you want to delete ${workerName}?`)) {
                    await fetch(`${API_URL}/api/workers/${workerId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    loadWorkers();
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

            await fetch(`${API_URL}/api/workers/${workerId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(workerData)
            });

            editWorkerModal.hide();
            loadWorkers();
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
        });
    }

    function startEnrollmentWebSocket() {
        if (enrollWs) return;
        const wsUrl = API_URL.replace('http', 'ws') + '/ws/enroll';
        enrollWs = new WebSocket(wsUrl);

        enrollWs.onopen = () => {
            enrollmentStatus.textContent = "Camera ready. Position your face.";
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
            enrollmentStatus.textContent = "Failed to connect to camera server. Is the backend running?";
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
                alert('Please fill all worker details.');
                return;
            }

            if (enrollWs && enrollWs.readyState === WebSocket.OPEN) {
                enrollWs.send(JSON.stringify({ command: 'capture', ...workerData }));
                enrollmentStatus.textContent = "Capturing...";
            } else {
                enrollmentStatus.textContent = "Connection error. Cannot capture.";
                enrollmentStatus.className = 'mt-2 fw-bold text-danger';
            }
        });
    }
    
    // --- Logika Logout ---
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            localStorage.clear();
            window.location.href = 'login.html';
        });
    });
});