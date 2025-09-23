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
    cursor.execute("SELECT id, name, ip_address, location FROM cctv_streams")
    cctvs = cursor.fetchall()
    conn.close()
    return cctvs

@app.post("/api/cctv", tags=["CCTV"])
async def add_cctv(cctv: CCTV, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    sql = "INSERT INTO cctv_streams (name, ip_address, location) VALUES (%s, %s, %s)"
    val = (cctv.name, cctv.ip_address, cctv.location)
    cursor.execute(sql, val)
    conn.commit()
    conn.close()
    return {"status": "success", "message": "CCTV added."}

# --- PETA KELAS DAN WARNA ---
# Pastikan nama kelas di sini sama persis dengan nama kelas di model YOLO Anda
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

# --- WebSocket untuk Dashboard & Enrollment ---
# --- FUNGSI UTAMA YANG DIPERBARUI TOTAL ---
@app.websocket("/ws/dashboard")
async def ws_dashboard(websocket: WebSocket):
    await websocket.accept()
    cap = cv2.VideoCapture(0)
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

            # 2. Kenali wajah
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            face_locations = face_recognition.face_locations(rgb_frame)
            face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)
            
            user_info = None
            if face_encodings:
                matches = face_recognition.compare_faces(known_face_encodings, face_encodings[0], tolerance=0.5)
                if True in matches:
                    match_index = matches.index(True)
                    user_info = known_face_metadata[match_index]

            # 3. Analisis Kepatuhan APD
            status_wajib = {item: (item in detected_items) for item in PPE_WAJIB}
            status_opsional = {item: (item in detected_items) for item in PPE_OPSIONAL}

            is_wajib_lengkap = all(status_wajib.values())
            is_opsional_lengkap = all(status_opsional.values())

            overall_status = "aman"
            if not is_wajib_lengkap:
                overall_status = "bahaya"
            elif not is_opsional_lengkap:
                overall_status = "peringatan"

            # 4. Siapkan data untuk dikirim ke frontend
            response_data = {
                "user": user_info,
                "ppe_status": {
                    "wajib": status_wajib,
                    "opsional": status_opsional,
                    "overall": overall_status
                }
            }
            
            # Ganti label "person" dengan nama user jika dikenali
            if user_info:
                # Ini adalah contoh sederhana, implementasi yang lebih baik akan mencari box 'person'
                # dan menimpanya dengan nama. Untuk sekarang, kita tampilkan saja di pojok.
                cv2.putText(frame, user_info['name'], (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2, cv2.LINE_AA)

            # 5. Kirim data ke frontend
            _, buffer = cv2.imencode('.jpg', frame)
            await websocket.send_bytes(buffer.tobytes())
            await websocket.send_json(response_data)  # Selalu kirim JSON, bahkan jika user_info None
                
            await asyncio.sleep(0.05)

    except WebSocketDisconnect:
        print("Dashboard client disconnected.")
    finally:
        if cap.isOpened():
            cap.release()

# Ganti fungsi ws_enroll Anda dengan yang ini di file backend/main.py

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
                    
                    # --- BLOK PERBAIKAN DIMULAI DI SINI ---
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
                        # Ini akan menangkap error "Duplicate entry" dan error database lainnya
                        print(f"DATABASE ERROR: {e}")
                        error_message = f"Error: Employee ID '{message['employee_id']}' sudah terdaftar."
                        await websocket.send_json({"status": "error", "message": error_message})
                    # --- BLOK PERBAIKAN SELESAI ---

                else:
                    msg = "Wajah tidak terdeteksi." if len(face_locations) == 0 else "Terdeteksi lebih dari satu wajah."
                    await websocket.send_json({"status": "error", "message": msg})

            _, buffer = cv2.imencode('.jpg', frame)
            await websocket.send_bytes(buffer.tobytes())
            await asyncio.sleep(0.05)
            
    except WebSocketDisconnect: 
        print("Enrollment client disconnected.")
    finally: 
        if cap.isOpened():
            cap.release()

# --- API Endpoints CRUD untuk Workers ---
@app.get("/api/workers", tags=["Workers"])
async def get_all_workers(current_user: dict = Depends(auth.get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, employee_id, name, company, role, status_sim_l, created_at FROM workers ORDER BY name")
    workers = cursor.fetchall()
    conn.close()
    return workers

# --- PENAMBAHAN BARU ---
@app.get("/api/workers/{worker_id}", tags=["Workers"])
async def get_worker_by_id(worker_id: int, current_user: dict = Depends(auth.get_current_user)):
    """Mengambil data satu worker spesifik untuk ditampilkan di form edit."""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, employee_id, name, company, role, status_sim_l FROM workers WHERE id = %s", (worker_id,))
    worker = cursor.fetchone()
    conn.close()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    return worker

# --- PENAMBAHAN BARU ---
@app.put("/api/workers/{worker_id}", tags=["Workers"])
async def update_worker(worker_id: int, worker_data: WorkerUpdate, current_user: dict = Depends(auth.get_current_user)):
    """Menyimpan perubahan data worker dari form edit."""
    conn = get_db_connection()
    cursor = conn.cursor()
    sql = """
        UPDATE workers SET employee_id = %s, name = %s, company = %s, role = %s, status_sim_l = %s
        WHERE id = %s
    """
    val = (worker_data.employee_id, worker_data.name, worker_data.company, worker_data.role, worker_data.status_sim_l, worker_id)
    cursor.execute(sql, val)
    conn.commit()
    conn.close()
    load_known_faces_from_db() # Wajah tidak berubah, tapi data lain perlu di-refresh di memori
    return {"status": "success", "message": "Worker data updated."}

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