from passlib.context import CryptContext

# Konteks password yang sama persis seperti di file auth.py
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Hash yang seharusnya ada di database Anda
correct_hash = "$2b$12$Eix3O8.4.A.5.5s3.5Q9b.yqK3.Y8l/k3.g3.Y4j/n3o2.z5.g4.W"

# Password yang kita coba
password_to_test = "admin123"

print("--- Menjalankan Tes Verifikasi Password ---")
print(f"Mencoba verifikasi password: '{password_to_test}'")
print(f"Dengan hash: {correct_hash}")

try:
    # Fungsi inilah yang seharusnya berjalan saat Anda login
    is_valid = pwd_context.verify(password_to_test, correct_hash)

    if is_valid:
        print("\n✅ HASIL: VERIFIKASI BERHASIL! Password cocok.")
    else:
        print("\n❌ HASIL: VERIFIKASI GAGAL! Password tidak cocok.")

except Exception as e:
    print(f"\n🚨 TERJADI ERROR SAAT VERIFIKASI: {e}")