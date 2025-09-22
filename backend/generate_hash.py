from passlib.context import CryptContext

# Gunakan konteks yang sama persis seperti di proyek Anda
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Password yang ingin kita hash
password_to_hash = "khairidev163"

print(f"Membuat hash untuk password: '{password_to_hash}'...")

# Proses hashing
hashed_password = pwd_context.hash(password_to_hash)

print("\n✅ HASH BARU ANDA BERHASIL DIBUAT:")
print("------------------------------------------------------------")
print(hashed_password)
print("------------------------------------------------------------")
print("\nSalin seluruh baris hash di atas (yang diawali dengan $2b$).")