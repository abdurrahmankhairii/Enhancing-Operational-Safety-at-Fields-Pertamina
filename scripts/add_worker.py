# (Kode ini sama seperti di jawaban sebelumnya, pastikan
# konfigurasi database di dalamnya sudah benar)
import cv2
import face_recognition
import mysql.connector
import pickle

DB_CONFIG = {
    'host': 'localhost', 'user': 'root', 'password': '',
    'database': 'pertamina_gate_system'
}

def add_new_worker():
    employee_id = input("Masukkan Nomor Identitas Pekerja: ")
    name = input("Masukkan Nama Lengkap: ")
    role = input("Masukkan Fungsi/Jabatan: ")

    cap = cv2.VideoCapture(0)
    print("\nPandang ke kamera. Tekan 's' untuk menyimpan, 'q' untuk keluar.")
    
    while True:
        ret, frame = cap.read()
        if not ret: break
        cv2.imshow("Pendaftaran Wajah", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('s'):
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            face_locations = face_recognition.face_locations(rgb_frame)
            
            if len(face_locations) == 1:
                face_encoding = face_recognition.face_encodings(rgb_frame, face_locations)[0]
                try:
                    conn = mysql.connector.connect(**DB_CONFIG)
                    cursor = conn.cursor()
                    encoding_bytes = pickle.dumps(face_encoding)
                    sql = "INSERT INTO workers (employee_id, name, role, face_encoding) VALUES (%s, %s, %s, %s)"
                    val = (employee_id, name, role, encoding_bytes)
                    cursor.execute(sql, val)
                    conn.commit()
                    print(f"\nSukses! Data untuk {name} telah ditambahkan.")
                except mysql.connector.Error as err:
                    print(f"Error: {err}")
                finally:
                    if conn.is_connected():
                        cursor.close()
                        conn.close()
                break
            else:
                print("Wajah tidak terdeteksi atau terdeteksi lebih dari satu. Coba lagi.")
        elif key == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    add_new_worker()