import os
import sys
import json
import decimal
import datetime
import time
import psycopg2
from psycopg2 import sql

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

# Neon unpooled direct connection URL
DB_URL = "postgresql://neondb_owner:npg_92RniLMuEgVT@ep-sparkling-pine-aevzp49y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Proper dependency order for clean restoration without FK violations
TABLES_ORDER = [
    # 1. Base django and auth
    "django_migrations",
    "django_content_type",
    "auth_permission",
    "auth_group",
    "auth_group_permissions",
    
    # 2. Tenancy & capabilities
    "schools_school",
    "users_capability",
    "users_user",
    "users_usercapability",
    "users_user_groups",
    "users_user_user_permissions",
    "schools_classsection",
    "schools_classsubjectteacher",
    
    # 3. Content & Question bank
    "content_book",
    "content_chapter",
    "content_topic",
    "content_question",
    "content_question_topics",
    "content_questionvariant",
    "content_questionvalidationhistory",
    
    # 4. Papers & Deliveries
    "papers_paper",
    "papers_paperversion",
    "papers_delivery",
    "papers_delivery_assigned_students",
    
    # 5. Attempts, answers, audit
    "attempts_attempt",
    "attempts_answer",
    "core_auditlog",
    "django_session",
    "token_blacklist_outstandingtoken",
    "token_blacklist_blacklistedtoken",
]

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        if isinstance(obj, datetime.time):
            return obj.isoformat()
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        if isinstance(obj, (bytes, bytearray)):
            return obj.decode('utf-8', errors='replace')
        return super().default(obj)

def format_sql_value(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float, decimal.Decimal)):
        return str(val)
    if isinstance(val, (dict, list)):
        escaped = json.dumps(val).replace("'", "''")
        return f"'{escaped}'"
    if isinstance(val, (datetime.datetime, datetime.date, datetime.time)):
        return f"'{val.isoformat()}'"
    # String or other
    escaped = str(val).replace("'", "''")
    return f"'{escaped}'"

def run_backup():
    print(f"Connecting to Neon database...")
    start_time = time.time()
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()
    
    tables_dump = {}
    table_stats = {}
    
    sql_statements = [
        "-- Question Generation System Full Database Backup",
        f"-- Generated at: {datetime.datetime.now(datetime.timezone.utc).isoformat()}",
        "-- Database: Neon PostgreSQL",
        "",
        "SET statement_timeout = 0;",
        "SET lock_timeout = 0;",
        "SET client_encoding = 'UTF8';",
        "SET standard_conforming_strings = on;",
        "SET check_function_bodies = false;",
        "SET client_min_messages = warning;",
        "SET row_security = off;",
        "SET search_path = public;",
        "",
        "BEGIN;",
        ""
    ]
    
    # 1. Add table cleanups in reverse order for foreign key safety
    sql_statements.append("-- Truncate all tables before reinserting")
    for tbl in reversed(TABLES_ORDER):
        sql_statements.append(f'TRUNCATE TABLE "{tbl}" CASCADE;')
    sql_statements.append("")

    print("\nDumping tables in bulk...")
    for table_name in TABLES_ORDER:
        t0 = time.time()
        # Fetch columns
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = %s
            ORDER BY ordinal_position;
        """, (table_name,))
        col_defs = cur.fetchall()
        if not col_defs:
            print(f"  [SKIP] Table {table_name} not found in database.")
            continue
        
        columns = [c[0] for c in col_defs]
        quoted_cols = ', '.join([f'"{c}"' for c in columns])
        
        # Fetch all rows in one network trip
        cur.execute(f'SELECT {quoted_cols} FROM "public"."{table_name}";')
        rows = cur.fetchall()
        elapsed = time.time() - t0
        
        table_stats[table_name] = len(rows)
        print(f"  [OK] {table_name:35} : {len(rows):5d} rows ({elapsed:.2f}s)")
        
        # JSON dump format
        table_records = []
        for row in rows:
            record = dict(zip(columns, row))
            table_records.append(record)
        tables_dump[table_name] = table_records
        
        # SQL insert generation
        if rows:
            sql_statements.append(f"-- Data for {table_name} ({len(rows)} rows)")
            
            # Batch inserts in chunks of 100 rows
            chunk_size = 100
            for i in range(0, len(rows), chunk_size):
                chunk = rows[i:i+chunk_size]
                values_list = []
                for row in chunk:
                    row_vals = ', '.join([format_sql_value(v) for v in row])
                    values_list.append(f"({row_vals})")
                sql_insert = f'INSERT INTO "{table_name}" ({quoted_cols}) VALUES\n  ' + ',\n  '.join(values_list) + ';'
                sql_statements.append(sql_insert)
            sql_statements.append("")
    
    sql_statements.append("COMMIT;")
    sql_statements.append("-- End of Backup")
    
    # Save SQL file
    sql_filepath = os.path.join(BASE_DIR, "backup_current_db.sql")
    with open(sql_filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(sql_statements))
    sql_size_mb = os.path.getsize(sql_filepath) / (1024 * 1024)
    print(f"\n[1] Saved SQL Backup: {sql_filepath} ({sql_size_mb:.2f} MB)")
    
    # Save JSON file
    json_filepath = os.path.join(BASE_DIR, "backup_current_db.json")
    with open(json_filepath, "w", encoding="utf-8") as f:
        json.dump(tables_dump, f, indent=2, cls=CustomJSONEncoder, ensure_ascii=False)
    json_size_mb = os.path.getsize(json_filepath) / (1024 * 1024)
    print(f"[2] Saved JSON Backup: {json_filepath} ({json_size_mb:.2f} MB)")
    
    total_time = time.time() - start_time
    print(f"\nCompleted complete backup of {len(table_stats)} tables in {total_time:.2f} seconds!")
    
    conn.close()

if __name__ == "__main__":
    run_backup()
