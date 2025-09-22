import mysql.connector
from mysql.connector import Error

# Konfigurasi koneksi ke database Anda di Laragon
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '', # Password default Laragon biasanya kosong
    'database': 'pertamina_gate_system'
}

def get_db_connection():
    """Membuat dan mengembalikan objek koneksi database."""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        return None