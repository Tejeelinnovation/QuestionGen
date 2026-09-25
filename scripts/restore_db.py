"""
Restore script to recover database from backup_current_db.sql or backup_current_db.json
"""
import os
import sys
import time
import psycopg2

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

DB_URL = "postgresql://neondb_owner:npg_92RniLMuEgVT@ep-sparkling-pine-aevzp49y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"

def restore_from_sql(sql_file="backup_current_db.sql"):
    filepath = os.path.join(BASE_DIR, sql_file)
    if not os.path.exists(filepath):
        print(f"Error: {filepath} not found.")
        sys.exit(1)
        
    print(f"Reading {filepath}...")
    with open(filepath, "r", encoding="utf-8") as f:
        sql_content = f.read()
        
    print("Connecting to database and applying restore...")
    t0 = time.time()
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()
    
    cur.execute(sql_content)
    cur.close()
    conn.close()
    
    print(f"SUCCESS: Database restored cleanly in {time.time() - t0:.2f} seconds!")

if __name__ == "__main__":
    restore_from_sql()
