# main.py (Updated for continuous detection, status panel, new DB table, custom history filters)
import cv2
import torch
import face_recognition
import pickle
import json
import numpy as np
import asyncio
from fastapi import FastAPI, WebSocket, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketDisconnect
from ultralytics import YOLO
from pydantic import BaseModel 
import concurrent.futures
from datetime import datetime, timedelta

import auth
from database import get_db_connection
from models import WorkerUpdate, CCTV  # Add CCTV import

# --- Inisialisasi Aplikasi ---
app = FastAPI(title="Pertamina Gate System API")

origins = [
    "http://pertamina-gate.test",
    "http://localhost",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API Endpoints for CCTV ---
@app.get("/api/cctv", tags=["CCTV"])
async def get_all_cctv(current_user: dict = Depends(auth.get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, name, ip_address, location, port, username, password FROM cctv_streams")
    cctvs = cursor.fetchall()
    conn.close()
    return cctvs

@app.post("/api/cctv", tags=["CCTV"])
async def add_cctv(cctv: CCTV, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    sql = "INSERT INTO cctv_streams (name, ip_address, location, port, username, password) VALUES (%s, %s, %s, %s, %s, %s)"
    val = (cctv.name, cctv.ip_address, cctv.location, cctv.port if cctv.port else None, cctv.username if cctv.username else None, cctv.password if cctv.password else None)
    cursor.execute(sql, val)
    conn.commit()
    conn.close()
    return {"status": "success", "message": "CCTV added."}

# --- PETA KELAS DAN WARNA ---
CLASS_NAMES = {
    0: 'person', 1: 'ear', 2: 'ear-muffs', 3: 'face', 4: 'face-guard',
    5: 'face-mask', 6: 'foot', 7: 'tool', 8: 'glasses', 9: 'gloves',
    10: 'helmet', 11: 'hands', 12: 'head', 13: 'coverall', 14: 'shoes',
    15: 'coverall', 16: 'safety-vest'
}

COLOR_MAP = {
    'person': (255, 255, 255), 'ear': (150, 150, 150), 'ear-muffs': (0, 165, 255),
    'face': (200, 200, 200), 'face-guard': (255, 255, 0), 'face-mask': (235, 206, 135),
    'foot': (42, 42, 165), 'tool': (255, 0, 255), 'glasses': (255, 0, 0),
    'gloves': (50, 205, 50), 'helmet': (0, 255, 0), 'hands': (189, 215, 255),
    'head': (203, 192, 255), 'coverall': (0, 0, 255), 'shoes': (0, 255, 255),
    'safety-vest': (0, 215, 255)
}

# --- ATURAN APD ---
PPE_WAJIB = {'coverall', 'helmet', 'shoes'}
PPE_OPSIONAL = {'glasses', 'gloves', 'face-mask'}

PPE_MODEL_PATH = "../models/ppe_yolov10m/weights/best.pt"
ppe_model = YOLO(PPE_MODEL_PATH) 

known_face_encodings = []
known_face_metadata = []

def load_known_faces_from_db():
    global known_face_encodings, known_face_metadata
    known_face_encodings.clear(); known_face_metadata.clear()
    conn = get_db_connection()
    if not conn: return
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, employee_id, name, company, role, status_sim_l, face_encoding FROM workers")
        for row in cursor.fetchall():
            known_face_encodings.append(pickle.loads(row['face_encoding']))
            known_face_metadata.append(row)
        print(f"SUCCESS: Loaded {len(known_face_encodings)} faces from DB.")
    finally:
        if conn.is_connected():
            conn.close()

@app.on_event("startup")
def on_startup():
    load_known_faces_from_db()

# --- Endpoint Otentikasi ---
@app.post("/token", tags=["Authentication"])
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM app_users WHERE username = %s", (form_data.username,))
    user = cursor.fetchone()
    conn.close()
    if not user or not auth.verify_password(form_data.password, user['hashed_password']):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token = auth.create_access_token(data={"sub": user['username'], "role": user['role']})
    return {"access_token": access_token, "token_type": "bearer", "role": user['role']}

# --- API Endpoints for Logs (updated with filter, using gate_logs, added custom date range) ---
@app.get("/api/logs", tags=["Logs"])
async def get_logs(limit: int = 50, filter: str = "all", start_date: str = None, end_date: str = None, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    sql = """
        SELECT gl.log_id, gl.timestamp_in AS timestamp, gl.ppe_status AS status, gl.ppe_details, w.name, w.company, w.role
        FROM gate_logs gl
        JOIN workers w ON gl.worker_id = w.id
    """
    val = []
    now = datetime.now()
    if start_date and end_date:  # Custom range
        sql += " WHERE gl.timestamp_in BETWEEN %s AND %s"
        val.extend([datetime.strptime(start_date, '%Y-%m-%d'), datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)])
    elif filter == "today":
        sql += " WHERE gl.timestamp_in >= %s"
        val.append(now.replace(hour=0, minute=0, second=0, microsecond=0))
    elif filter == "this_week":
        start_week = now - timedelta(days=now.weekday())  # Mulai Senin
        sql += " WHERE gl.timestamp_in >= %s"
        val.append(start_week.replace(hour=0, minute=0, second=0, microsecond=0))
    elif filter == "this_month":
        start_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        sql += " WHERE gl.timestamp_in >= %s"
        val.append(start_month)
    elif filter == "this_year":
        start_year = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        sql += " WHERE gl.timestamp_in >= %s"
        val.append(start_year)
    elif filter == "last_year":
        start_last = datetime(now.year - 1, 1, 1)
        end_last = datetime(now.year, 1, 1)
        sql += " WHERE gl.timestamp_in >= %s AND gl.timestamp_in < %s"
        val.extend([start_last, end_last])
    elif filter == "2024":
        start_2024 = datetime(2024, 1, 1)
        end_2024 = datetime(2025, 1, 1)
        sql += " WHERE gl.timestamp_in >= %s AND gl.timestamp_in < %s"
        val.extend([start_2024, end_2024])
    elif filter == "2023":
        start_2023 = datetime(2023, 1, 1)
        end_2023 = datetime(2024, 1, 1)
        sql += " WHERE gl.timestamp_in >= %s AND gl.timestamp_in < %s"
        val.extend([start_2023, end_2023])

    sql += " ORDER BY gl.timestamp_in DESC LIMIT %s"
    val.append(limit)

    cursor.execute(sql, tuple(val))
    logs = cursor.fetchall()
    # Parse ppe_details JSON for description
    for log in logs:
        details = json.loads(log['ppe_details'])
        log['description'] = details['description']
        log.pop('ppe_details')  # Clean up
    conn.close()
    return logs

# --- WebSocket untuk Dashboard & Enrollment ---
# --- FUNGSI UTAMA YANG DIPERBARUI TOTAL ---
@app.websocket("/ws/dashboard")
async def ws_dashboard(websocket: WebSocket):
    await websocket.accept()
    cap = cv2.VideoCapture(0)
    last_records = {}  # Track last record time per user to avoid spam (record every 60s or on change)
    try:
        while True:
            ret, frame = cap.read()
            if not ret: break

            # 1. Deteksi semua objek dengan YOLO
            results = ppe_model(frame, verbose=False)
            detected_items = set()
            
            for result in results:
                for box in result.boxes:
                    class_id = int(box.cls)
                    label = CLASS_NAMES.get(class_id, 'unknown')
                    detected_items.add(label)
                    
                    # Gambar bounding box untuk semua item APD
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    color = COLOR_MAP.get(label, (0, 0, 0))
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

            # 2. Kenali wajah (support multiple faces)
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            face_locations = face_recognition.face_locations(rgb_frame)
            face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)
            
            user_infos = []
            for i, encoding in enumerate(face_encodings):
                matches = face_recognition.compare_faces(known_face_encodings, encoding, tolerance=0.5)
                if True in matches:
                    match_index = matches.index(True)
                    user_info = known_face_metadata[match_index]
                    user_infos.append(user_info)

                    # Tampilkan nama, role, company di dekat wajah
                    top, right, bottom, left = face_locations[i]
                    text = f"{user_info['name']} - {user_info['role']} @ {user_info['company']}"
                    cv2.putText(frame, text, (left, top - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

            # 3. Analisis Kepatuhan APD dan SIML untuk setiap user
            response_data = {"users": []}
            for user_info in user_infos:
                # Asumsi deteksi APD global; untuk per person, butuh asosiasi lanjutan (tambahkan proximity check if needed)
                status_wajib = {item: (item in detected_items) for item in PPE_WAJIB}
                status_opsional = {item: (item in detected_items) for item in PPE_OPSIONAL}

                is_wajib_lengkap = all(status_wajib.values())
                is_opsional_lengkap = all(status_opsional.values())
                is_siml_aktif = user_info['status_sim_l'] == 'Aktif'

                overall_status = "merah"
                description = []

                if not is_siml_aktif:
                    overall_status = "merah"
                    description.append("SIML Tidak Aktif")
                else:
                    if not is_wajib_lengkap:
                        overall_status = "merah"
                        missing_wajib = [item for item, detected in status_wajib.items() if not detected]
                        description.extend([f"Tidak Menggunakan <b style='color:red'>{item.capitalize()}</b>" for item in missing_wajib])
                    else:
                        if is_opsional_lengkap:
                            overall_status = "hijau"
                            description.append("APD Lengkap dan SIML Aktif")
                        else:
                            overall_status = "orange"
                            missing_opsional = [item for item, detected in status_opsional.items() if not detected]
                            description.extend([f"Tidak Menggunakan <b style='color:orange'>{item.capitalize()}</b>" for item in missing_opsional])

                # 4. Record to DB if new or changed (every 60s max)
                user_id = user_info['id']
                now = datetime.now()
                last_time = last_records.get(user_id, now - timedelta(seconds=61))
                if (now - last_time).total_seconds() > 60:  # Record if >60s since last
                    conn = get_db_connection()
                    cursor = conn.cursor()
                    sql = """
                        INSERT INTO gate_logs (worker_id, timestamp_in, ppe_status, ppe_details, cctv_id)
                        VALUES (%s, %s, %s, %s, %s)
                    """
                    ppe_used = {"wajib": status_wajib, "opsional": status_opsional}
                    details = json.dumps({"ppe_used": ppe_used, "description": "; ".join(description)})
                    val = (user_id, now, overall_status, details, None)  # cctv_id None for dashboard
                    cursor.execute(sql, val)
                    conn.commit()
                    conn.close()
                    last_records[user_id] = now

                # Tambah ke response untuk status panel
                response_data["users"].append({
                    "user": user_info,
                    "ppe_status": {
                        "wajib": status_wajib,
                        "opsional": status_opsional,
                        "overall": overall_status,
                        "description": description
                    }
                })

            # 5. Kirim data ke frontend (continuous, no break)
            _, buffer = cv2.imencode('.jpg', frame)
            await websocket.send_bytes(buffer.tobytes())
            await websocket.send_json(response_data)
                
            await asyncio.sleep(0.1)  # Optimized sleep for smoother feed

    except WebSocketDisconnect:
        print("Dashboard client disconnected.")
    finally:
        if cap.isOpened():
            cap.release()

# Ganti fungsi ws_enroll Anda dengan yang ini di file backend/main.py (no change, kept as is)

@app.websocket("/ws/enroll")
async def ws_enroll(websocket: WebSocket):
    await websocket.accept()
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Cannot open camera for enrollment.")
        await websocket.close()
        return
        
    try:
        while True:
            message = None
            try:
                message_text = await asyncio.wait_for(websocket.receive_text(), timeout=0.01)
                message = json.loads(message_text)
            except (asyncio.TimeoutError, json.JSONDecodeError):
                pass
            
            ret, frame = cap.read()
            if not ret: break

            if message and message.get("command") == "capture":
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                face_locations = face_recognition.face_locations(rgb_frame)
                
                if len(face_locations) == 1:
                    face_encoding = face_recognition.face_encodings(rgb_frame, face_locations)[0]
                    encoding_bytes = pickle.dumps(face_encoding)
                    
                    try:
                        conn = get_db_connection()
                        cursor = conn.cursor()
                        sql = "INSERT INTO workers (employee_id, name, company, role, status_sim_l, face_encoding) VALUES (%s, %s, %s, %s, %s, %s)"
                        val = (
                            message['employee_id'], message['name'], message['company'], 
                            message['role'], message['status_sim_l'], encoding_bytes
                        )
                        cursor.execute(sql, val)
                        conn.commit()
                        conn.close()
                        
                        load_known_faces_from_db()
                        await websocket.send_json({"status": "success", "message": f"Worker {message['name']} berhasil ditambahkan."})

                    except Exception as e:
                        print(f"DATABASE ERROR: {e}")
                        error_message = f"Error: Employee ID '{message['employee_id']}' sudah terdaftar."
                        await websocket.send_json({"status": "error", "message": error_message})

                else:
                    msg = "Wajah tidak terdeteksi." if len(face_locations) == 0 else "Terdeteksi lebih dari satu wajah."
                    await websocket.send_json({"status": "error", "message": msg})

            _, buffer = cv2.imencode('.jpg', frame)
            await websocket.send_bytes(buffer.tobytes())
            await asyncio.sleep(0.1)  # Optimized
            
    except WebSocketDisconnect: 
        print("Enrollment client disconnected.")
    finally: 
        if cap.isOpened():
            cap.release()

# --- API Endpoints CRUD untuk Workers --- (no change, kept as is)
@app.get("/api/workers", tags=["Workers"])
async def get_all_workers(current_user: dict = Depends(auth.get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, employee_id, name, company, role, status_sim_l, created_at FROM workers ORDER BY name")
    workers = cursor.fetchall()
    conn.close()
    return workers

@app.get("/api/workers/{worker_id}", tags=["Workers"])
async def get_worker_by_id(worker_id: int, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, employee_id, name, company, role, status_sim_l FROM workers WHERE id = %s", (worker_id,))
    worker = cursor.fetchone()
    conn.close()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    return worker

@app.put("/api/workers/{worker_id}", tags=["Workers"])
async def update_worker(worker_id: int, worker_data: WorkerUpdate, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    sql = """
        UPDATE workers SET employee_id = %s, name = %s, company = %s, role = %s, status_sim_l = %s
        WHERE id = %s
    """
    val = (worker_data.employee_id, worker_data.name, worker_data.company, worker_data.role, worker_data.status_sim_l, worker_id)
    cursor.execute(sql, val)
    conn.commit()
    affected = cursor.rowcount > 0
    conn.close()
    if affected:
        load_known_faces_from_db()
        return {"status": "success", "message": "Worker data updated."}
    raise HTTPException(status_code=404, detail="Worker not found")

@app.delete("/api/workers/{worker_id}", tags=["Workers"])
async def delete_worker(worker_id: int, current_user: dict = Depends(auth.get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete workers.")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM workers WHERE id = %s", (worker_id,))
    conn.commit()
    is_deleted = cursor.rowcount > 0
    conn.close()
    
    if is_deleted:
        load_known_faces_from_db()
        return {"status": "success", "message": "Worker deleted."}
    raise HTTPException(status_code=404, detail="Worker not found.")